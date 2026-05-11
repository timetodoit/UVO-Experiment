// Sky dome fragment shader.
//
// Layers from back to front:
//  1. Two-stop vertical gradient (horizon → zenith) with a haze band
//  2. Procedural cloud layer (domain-warped fbm on a "projected plane")
//  3. Sun disc — a tight bright kernel plus a softer halo
//  4. "Fake" god rays — radial brightness emanating from the sun, gated
//     by cloud breaks, so the effect reads as light shafts between
//     clouds rather than a uniform glow
//
// The cloud-plane projection (dir.xz / dir.y) makes clouds appear
// foreshortened toward the horizon, which is how real clouds look from
// ground level. The ocean shader re-evaluates the same cloud field on a
// horizontal plane at `uCloudHeight` to cast matching shadows on the
// water, so a cloud you see in the sky darkens the water under it.

uniform vec3  uHorizon;
uniform vec3  uZenith;
uniform vec3  uHazeTint;
uniform float uExponent;
uniform float uHazeStrength;

uniform vec3  uSunDir;       // normalized on CPU
uniform vec3  uSunColor;     // tinted by warmth slider
uniform float uCloudCoverage;
uniform float uCloudScale;
uniform float uCloudSpeed;
uniform float uCloudOpacity;
uniform float uGodRays;
uniform float uTime;

varying vec3 vWorldDir;

// ---------- Noise helpers (same family as ocean shader) ----------

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

const mat2 FBM_ROT = mat2(0.80, -0.60, 0.60, 0.80);

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = FBM_ROT * p * 2.07;
    a *= 0.5;
  }
  return v;
}

// ---------- Cloud field ----------
// Sampled on a virtual plane at altitude 1.0 above the viewer. Rays with
// dir.y near zero project to extreme UVs, compressing clouds toward the
// horizon. The ocean shader uses the same math with its own plane height
// so shadows line up.
float cloudField(vec2 uv) {
  // Light domain-warp for organic, non-tiled clouds.
  vec2 warp = vec2(fbm(uv * 0.4 + 7.3), fbm(uv * 0.4 + 23.1));
  float n = fbm(uv * uCloudScale + warp * 0.6 + vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.6));
  // Smoothstep around the coverage threshold — low coverage = thin wisps,
  // high coverage = overcast. The width of the transition (0.18) keeps
  // cloud edges soft instead of hard-masked.
  return smoothstep(uCloudCoverage - 0.05, uCloudCoverage + 0.18, n);
}

void main() {
  vec3 dir = normalize(vWorldDir);
  vec3 L = normalize(uSunDir);

  // ---------- 1. Base sky gradient ----------
  float up = max(dir.y, 0.0);
  float t = smoothstep(0.0, 1.0, pow(up, 1.0 / uExponent));
  vec3 col = mix(uHorizon, uZenith, t);

  // Haze band at the horizon.
  float haze = pow(1.0 - smoothstep(0.0, 0.35, up), 1.8) * uHazeStrength;
  col = mix(col, uHazeTint, haze);

  // ---------- 2. Procedural clouds ----------
  // Project dir onto a cloud plane at y = 1.0 (relative coords — scaling
  // handled by uCloudScale). Guard dir.y against near-zero for rays close
  // to horizontal, otherwise UV explodes.
  vec2 cloudUv = dir.xz / max(dir.y, 0.06);
  float cloud = cloudField(cloudUv);
  // Fade clouds out right at the horizon — otherwise the plane-projection
  // trick produces very long streaks that look unnatural.
  cloud *= smoothstep(0.02, 0.18, dir.y);

  // Shade clouds: a grey base brightened on the sun-facing side, plus a
  // silver-lining rim where the sun aligns with the view direction.
  float sunAlign = max(dot(dir, L), 0.0);
  vec3 cloudBase   = vec3(0.72, 0.75, 0.80);
  vec3 cloudLit    = mix(cloudBase, uSunColor * 1.2, 0.55);
  vec3 cloudShadow = cloudBase * 0.65;
  vec3 cloudCol = mix(cloudShadow, cloudLit, pow(sunAlign, 2.5));
  // Silver lining — a thin bright ring at cloud edges where the sun peeks through.
  float edge = smoothstep(0.35, 0.7, cloud) * (1.0 - smoothstep(0.7, 0.95, cloud));
  cloudCol += uSunColor * edge * pow(sunAlign, 1.5) * 0.6;

  col = mix(col, cloudCol, cloud * uCloudOpacity);

  // ---------- 3. Sun disc + halo ----------
  float sunD = max(dot(dir, L), 0.0);
  // Dim the sun the more cloud sits in front of it — this is what sells
  // the "sun behind the clouds" feel rather than a constant bright disc.
  float sunVis = 1.0 - cloud * 0.85;
  col += uSunColor * pow(sunD, 600.0) * 6.0 * sunVis;    // core disc
  col += uSunColor * pow(sunD, 40.0)  * 0.4 * sunVis;    // inner halo
  col += uSunColor * pow(sunD, 8.0)   * 0.12 * sunVis;   // broad glow

  // ---------- 4. Fake god rays ----------
  // Screen-direction brightness biased toward the sun, modulated by a
  // high-frequency noise aligned with the sun. Gated by (1 - cloud) so
  // the rays read as light breaking through cloud gaps.
  float rayDot = max(dot(dir, L), 0.0);
  // Stripes along the sun direction — noise sampled on a coord that
  // varies perpendicular to L so bright/dark bands fan out radially.
  vec3 rayPerp = normalize(cross(L, vec3(0.0, 1.0, 0.0)) + vec3(0.001));
  float rayStripe = fbm(vec2(dot(dir, rayPerp) * 14.0, dot(dir, L) * 3.0) + uTime * 0.05);
  float rayField = pow(rayDot, 4.0) * (0.55 + 0.8 * rayStripe);
  rayField *= (1.0 - cloud * 0.7);
  col += uSunColor * rayField * uGodRays;

  gl_FragColor = vec4(col, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
