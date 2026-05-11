// Ocean fragment shader.
//
// Shading model:
//  - Fresnel-blended procedural sky reflection (no env map, no reflection pass)
//  - Sharp Blinn-Phong sun glint, tinted by uSunColor (time-of-day warmth)
//  - Subsurface-scatter approximation on backlit crests
//  - Deep→crest color mix driven by surface normal
//  - Fragment-only micro-ripple normal perturbation (fine surface detail)
//  - Soft cloud shadows: re-samples the sky shader's cloud field on a
//    horizontal plane at cloud altitude, so a cloud overhead dims the
//    water under it
//  - Hull-reflection approximation: the water near the ship darkens
//    because the hull blocks sky (cheaper than a planar reflection pass
//    and the dominant visible effect at this camera angle)
//  - Four foam contributions: crest, V-wake, bow crescent, contact churn
//  - Distance fog matching the scene's linear fog uniforms

uniform vec3  uDeepColor;
uniform vec3  uCrestColor;
uniform vec3  uSubsurfaceColor;
uniform vec3  uSkyHorizon;
uniform vec3  uSkyZenith;
uniform vec3  uFoamColor;
uniform vec3  uFogColor;
uniform vec3  uSunDir;                // world-space, normalized on CPU
uniform vec3  uSunColor;              // tinted by sun warmth slider
uniform float uSunIntensity;          // from controls.sun.intensity
uniform float uAmbientIntensity;      // from controls.lights.ambientIntensity
uniform float uRippleStrength;        // from controls.ocean.rippleStrength
uniform float uRippleScale;           // noise frequency of the ripple field
uniform float uRippleSpeed;           // time multiplier on the ripple drift
uniform float uCloudCoverage;         // matches sky shader
uniform float uCloudScale;            // matches sky shader
uniform float uCloudSpeed;            // matches sky shader
uniform float uCloudShadowStrength;   // how much clouds dim the water
uniform float uHullShadowStrength;    // how dark the water gets under the hull
uniform float uHullShadowRadius;      // radius of the hull's blocked-sky halo
uniform float uHullContactStrength;   // sun-independent contact AO under hull
uniform float uHullContactRadius;     // radius of the contact AO halo
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform vec2  uShipPos;               // world XZ
uniform vec2  uShipBowDir;            // world XZ, unit
uniform float uShipY;                 // world Y of ship origin (for contact AO)

varying vec3 vWorldPos;
varying vec3 vNormal;

// ---------- Noise helpers ----------

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 2D rotation matrix (~36.87°). Applied between fbm octaves so each
// successive layer samples the noise grid at a different orientation —
// this is the single most effective trick for breaking the axis-aligned
// streak pattern that naive fbm produces.
const mat2 FBM_ROT = mat2(0.80, -0.60, 0.60, 0.80);

float fbm(vec2 p) {
  // 5 octaves with per-octave rotation. The non-integer frequency step
  // (2.07 rather than 2.0) further decorrelates octaves by moving their
  // "grid alignments" off harmonic multiples of each other.
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = FBM_ROT * p * 2.07;
    a *= 0.5;
  }
  return v;
}

// Domain-warped fbm — samples fbm at a position that has itself been
// offset by a low-freq noise vector. The result looks organic and
// non-repetitive, no matter how long the user stares at a patch.
float fbmWarp(vec2 p, float warpStrength) {
  vec2 warp = vec2(fbm(p * 0.45), fbm(p * 0.45 + vec2(37.2, 17.7)));
  return fbm(p + warp * warpStrength);
}

// Cloud field — shares logic with sky.frag.glsl so the shadow cast on the
// water spatially aligns with the cloud drawn overhead. Sampled on a
// horizontal plane at the cloud altitude (found by projecting the
// fragment's world position along the sun direction up to y=CLOUD_H).
float cloudField(vec2 uv) {
  vec2 warp = vec2(fbm(uv * 0.4 + 7.3), fbm(uv * 0.4 + 23.1));
  float n = fbm(uv * uCloudScale + warp * 0.6 + vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.6));
  return smoothstep(uCloudCoverage - 0.05, uCloudCoverage + 0.18, n);
}

// ---------- Main ----------

void main() {
  vec3 N = normalize(vNormal);

  // ---------- Micro-ripple normal perturbation ----------
  // Fragment-only surface detail: the gradient of a high-frequency fbm
  // field tilts N by a small amount, producing countless tiny ripples
  // that catch sun glints across the whole ocean. Intentionally NOT in
  // the vertex shader — moving geometry at this scale would push
  // high-frequency jitter into the ship's hull-point sampling and make
  // the bob feel buzzy. Finite-difference gradient keeps this local and
  // cheap (three fbm evaluations total).
  //
  // Two layers at different scales + opposing drift directions break up
  // any residual swirl from the fbm rotation so the ripple field reads
  // as isotropic "wind chop" rather than a pattern.
  {
    float eps = 0.05;
    float t = uTime * uRippleSpeed;
    vec2 p1 = vWorldPos.xz * uRippleScale + vec2(t, -t * 0.6);
    float a0 = fbm(p1);
    float ax = fbm(p1 + vec2(eps, 0.0));
    float az = fbm(p1 + vec2(0.0, eps));
    vec2 gA = (vec2(ax, az) - a0) / eps;

    vec2 p2 = vWorldPos.xz * (uRippleScale * 2.05) + vec2(-t * 1.1, t * 0.8);
    float b0 = fbm(p2);
    float bx = fbm(p2 + vec2(eps, 0.0));
    float bz = fbm(p2 + vec2(0.0, eps));
    vec2 gB = (vec2(bx, bz) - b0) / eps;

    vec2 rippleGrad = gA * 0.6 + gB * 0.4;
    // Tangent-space perturbation on a Y-up surface: grad.x → −N.x,
    // grad.y → −N.z. The minus signs make high-noise areas tilt the
    // normal "uphill" toward the crest, matching how real ripple
    // gradients look to a light source.
    N = normalize(N + vec3(-rippleGrad.x, 0.0, -rippleGrad.y) * uRippleStrength);
  }

  vec3 V = normalize(cameraPosition - vWorldPos);
  float NdotV = max(dot(N, V), 0.0);
  vec3 L = normalize(uSunDir);

  // ---------- Cloud shadow ----------
  // Project the fragment position along the sun direction up to the
  // cloud layer, sample the cloud field there. A fragment ends up in
  // shadow when its "shadow ray" from the sun hits cloud on the way
  // down. This gives moving, shaped shadows that line up with visible
  // clouds in the sky dome.
  const float CLOUD_H = 40.0;
  float cloudShadow = 0.0;
  if (L.y > 0.05) {
    float tRay = (CLOUD_H - vWorldPos.y) / L.y;
    vec3 cloudHit = vWorldPos + L * tRay;
    // Scale so cloud footprint on the water roughly matches the angular
    // size of clouds in the sky (sky uses dir.xz/dir.y; we use world xz
    // normalized by cloud altitude).
    vec2 cloudUv = cloudHit.xz / CLOUD_H;
    cloudShadow = cloudField(cloudUv);
  }
  // Effective sun intensity at this fragment, dimmed where a cloud sits
  // between it and the sun.
  float sunLit = 1.0 - cloudShadow * uCloudShadowStrength;
  float effSun = uSunIntensity * sunLit;

  // ---------- Procedural sky reflection ----------
  vec3 R = reflect(-V, N);
  float skyT = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(skyT, 0.85));
  // Faux sun disk sitting in the reflected sky. Tinted by uSunColor so
  // the "warmth" slider tints the sun glint on the water along with the
  // sky shader's sun disc.
  float sunDot = max(dot(R, L), 0.0);
  sky += uSunColor * pow(sunDot, 90.0) * 1.4 * effSun;

  // ---------- Base body color ----------
  // Flat-facing regions (crest tops) lean toward the brighter crest tint.
  // Scale the whole body by the ambient floor so the "ambient" slider lifts
  // shadowed water alongside the ship's ambient component.
  float crestMix = smoothstep(0.88, 0.998, N.y);
  vec3 base = mix(uDeepColor, uCrestColor, crestMix * 0.55);
  base *= (0.6 + uAmbientIntensity * 1.6);

  // Subsurface scatter: backlit wave crests glow from behind. Stronger when
  // the sun is opposite the view direction (glancing backlight) and when
  // local height > 0 (wave peak rather than trough).
  float height01 = clamp((vWorldPos.y + 0.15) / 0.35, 0.0, 1.0);
  float backlit = clamp(dot(L, -V), 0.0, 1.0);
  float sss = pow(height01, 2.0) * backlit * 0.8;
  base += uSubsurfaceColor * sss;

  // ---------- Fresnel for reflection amount ----------
  float F0 = 0.02;
  float fres = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

  // ---------- Sun specular ----------
  // Scales with effective (cloud-dimmed) sun intensity and is tinted by
  // the sun warmth color so low-angle "afternoon" sun produces warmer
  // glints than midday.
  vec3 H = normalize(L + V);
  float specPow = pow(max(dot(N, H), 0.0), 220.0);
  vec3 spec = uSunColor * specPow * 2.2 * effSun;

  // ---------- Foam ----------
  float foam = 0.0;

  // 1. Crest foam — only at the very top of the wave field. Domain-warped
  // fbm + a high-freq detail layer so breaking-crest foam has a grainy,
  // broken-up edge with no visible tile pattern.
  float crestFoamMask = smoothstep(0.12, 0.22, vWorldPos.y);
  float crestNoise = fbmWarp(vWorldPos.xz * 2.4 + uTime * 0.22, 0.9);
  float crestDetail = vnoise(vWorldPos.xz * 9.0 + uTime * 0.8);
  crestNoise = crestNoise * 0.78 + crestDetail * 0.22;
  foam += crestFoamMask * smoothstep(0.42, 0.74, crestNoise) * 0.55;

  // 2. Ship-relative foam. Project world point into the ship's local frame
  // where `along` = forward from ship, `lateral` = left/right from centerline.
  vec2 rel = vWorldPos.xz - uShipPos;
  vec2 bow = normalize(uShipBowDir);
  vec2 perp = vec2(-bow.y, bow.x);
  float along = dot(rel, bow);
  float lateral = dot(rel, perp);
  float absLat = abs(lateral);

  // 2a. Kelvin-ish V-wake behind the ship. `sBehind` is distance aft of the
  // ship midpoint; the cone half-angle ≈ 25° via tan() ≈ 0.466.
  float sBehind = max(-along, 0.0);
  float coneEdge = sBehind * 0.466 + 0.45;
  // Use (1 - smoothstep(lo, hi, x)) for "falls off as x grows" — the reversed
  // form smoothstep(hi, lo, x) is undefined when edge0 >= edge1 in GLSL ES.
  float wakeInside = 1.0 - smoothstep(coneEdge - 0.55, coneEdge, absLat);
  float wakeRim = (1.0 - smoothstep(coneEdge + 0.05, coneEdge + 0.45, absLat))
                * smoothstep(coneEdge - 0.25, coneEdge + 0.05, absLat);
  float wakeFalloff = exp(-sBehind * 0.06) * smoothstep(0.0, 1.2, sBehind);
  // Warped fbm + a fine-detail overlay. The warp stretches foam streaks
  // into organic, turbulent tendrils rather than parallel stripes.
  float wakeNoise = fbmWarp(vec2(sBehind * 1.1, lateral * 2.0) - uTime * 0.35, 0.7);
  float wakeDetail = vnoise(vec2(sBehind * 3.5, lateral * 6.0) - uTime * 0.9);
  wakeNoise = wakeNoise * 0.72 + wakeDetail * 0.28;
  float wake = (wakeInside * 0.35 + wakeRim * 1.1) * wakeFalloff
             * (0.45 + 0.75 * wakeNoise);
  foam += wake;

  // 2b. Bow crescent — foam breaking off the bow. Centred ~2.2u ahead of the
  // ship origin, shaped into a thin crescent that bulges to the sides.
  float alongAhead = max(along - 2.2, 0.0);
  float bowDist = sqrt(alongAhead * alongAhead + lateral * lateral);
  float bowCrescent = (1.0 - smoothstep(0.25, 1.4, bowDist))
                    * smoothstep(0.1, 0.55, absLat);
  bowCrescent *= 0.7 * (0.55 + 0.55 * fbm(vWorldPos.xz * 3.2 + uTime * 0.4));
  foam += bowCrescent;

  // 2c. Contact churn — low-frequency halo hugging the hull, now with a
  // finer-grained noise mix so the water right at the hull-line looks
  // actively frothy instead of smoothly shaded.
  float contactR = length(rel);
  float contactHalo = (1.0 - smoothstep(1.6, 3.2, contactR))
                    * smoothstep(0.5, 1.5, contactR);
  float contactNoise = 0.5 + 0.55 * fbm(vWorldPos.xz * 5.0 - uTime * 0.5);
  foam += contactHalo * 0.45 * contactNoise;

  foam = clamp(foam, 0.0, 1.0);

  // ---------- Hull shadow (pseudo-reflection) ----------
  // The water directly under and beside the ship reads "dark" in the
  // reference images because the hull blocks sky — not because there's a
  // mirror image of the ship visible at this camera angle. Dampen both
  // Fresnel and crest color in a radius around the ship, then tint that
  // patch toward the deep color. This sells the "ship reflects on
  // water" effect without needing a planar reflection pass.
  float hullDist = length(rel);
  float hullShadow = (1.0 - smoothstep(0.0, uHullShadowRadius, hullDist))
                   * uHullShadowStrength;
  // Kill the Fresnel sky reflection in the shadowed region so the water
  // reads as dark glass rather than a mirror.
  float effFres = fres * (1.0 - hullShadow * 0.9);

  // ---------- Hull contact AO ----------
  // Sun-independent darkening tight around the hull. The directional
  // key-light shadow gets cast away from the ship at low elevations, so
  // the water directly under the boat isn't actually darker from the sun
  // alone. Real boats always have a dark water patch right under them
  // because the hull occludes sky/diffuse ambient from every angle; this
  // term approximates that as a distance-falloff around the ship, scaled
  // up when the hull sits low relative to the local water height.
  float contactDist = length(rel);
  float contactClose = 1.0 - smoothstep(0.0, uHullContactRadius, contactDist);
  // Ship Y above local water — smaller gap → darker AO. Clamp wide so
  // the AO doesn't pop when a wave crest briefly reaches over the hull.
  float hullGap = max(uShipY - vWorldPos.y, 0.0);
  float lowHull = 1.0 - smoothstep(0.15, 1.8, hullGap);
  float contactAO = contactClose * mix(0.35, 1.0, lowHull) * uHullContactStrength;

  // ---------- Composite ----------
  vec3 color = mix(base, sky, effFres);
  // Darken the body directly — the hull's shadow itself plus blocked
  // ambient sky contribution.
  color = mix(color, uDeepColor * 0.35, hullShadow * 0.6);
  // Hull contact AO — pure multiplicative darkening, on top of the hull
  // shadow so the two combine rather than one masking the other.
  color *= (1.0 - contactAO * 0.85);
  color += spec * (1.0 - foam * 0.6) * (1.0 - hullShadow * 0.7) * (1.0 - contactAO * 0.6);
  // Dim the overall body by cloud shadow too (after specular so the
  // specular has its own clamp handled above).
  color *= (1.0 - cloudShadow * uCloudShadowStrength * 0.35);

  // Foam is a matte near-white layer. It also nudges the color slightly
  // cooler underneath for the "aerated water" look.
  color = mix(color, uFoamColor, foam * 0.92);

  // Distance fog matching the scene's linear fog (near=10, far=60).
  float dist = distance(cameraPosition, vWorldPos);
  float fog  = smoothstep(uFogNear, uFogFar, dist);
  color = mix(color, uFogColor, fog);

  gl_FragColor = vec4(color, 1.0);

  // Plug into three's color pipeline. Raw ShaderMaterial doesn't auto-wire
  // these, so without them the ocean bypasses toneMappingExposure and the
  // outputColorSpace conversion — i.e. the leva "exposure" slider can't
  // touch the water, and it ends up a different grade from the PBR ship.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
