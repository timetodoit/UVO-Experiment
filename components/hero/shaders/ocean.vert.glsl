// 6-wave Gerstner ocean vertex shader.
//
// Math here MUST match components/hero/utils/gerstner.ts exactly — the ship
// CPU-samples that file to bob, so any drift here shows up as geometry poking
// through the surface.
//
// Wave amplitude is attenuated by distance from origin (world XZ) via
// smoothstep(uWaveFalloffNear, uWaveFalloffFar, dist). The ship always
// sits near origin (well inside `near`), so its CPU sampler doesn't need
// the matching falloff — but the ShadowCatcher does, and applies the
// same uniforms via its own onBeforeCompile patch.

uniform float uTime;
uniform vec2  uDir[6];         // already normalized on the CPU side
uniform float uWavelength[6];
uniform float uSteepness[6];
uniform float uSpeed[6];
uniform float uWaveFalloffNear;
uniform float uWaveFalloffFar;

varying vec3 vWorldPos;
varying vec3 vNormal;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;
const float Q_SHARPNESS = 0.5;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  float x0 = worldPos.x;
  float z0 = worldPos.z;

  // Separate wave contributions from the flat-plane identity so we can
  // attenuate wave-induced displacement and normals independently, without
  // warping the plane itself.
  vec3 waveDisp = vec3(0.0);
  vec3 waveDPdx = vec3(0.0);
  vec3 waveDPdz = vec3(0.0);

  for (int i = 0; i < 6; i++) {
    vec2  D      = uDir[i];
    float lambda = uWavelength[i];
    float S      = uSteepness[i];
    float speed  = uSpeed[i];

    float omega = TAU / lambda;
    float A     = S * lambda / TAU;
    float phi   = speed * omega;

    float k  = omega * dot(D, vec2(x0, z0)) + phi * uTime;
    float ck = cos(k);
    float sk = sin(k);

    waveDisp.x += Q_SHARPNESS * A * D.x * ck;
    waveDisp.z += Q_SHARPNESS * A * D.y * ck;
    waveDisp.y +=                A        * sk;

    float WA = omega * A;

    waveDPdx.x += -Q_SHARPNESS * D.x * D.x * WA * sk;
    waveDPdx.y +=                D.x *       WA * ck;
    waveDPdx.z += -Q_SHARPNESS * D.x * D.y * WA * sk;

    waveDPdz.x += -Q_SHARPNESS * D.x * D.y * WA * sk;
    waveDPdz.y +=                D.y *       WA * ck;
    waveDPdz.z += -Q_SHARPNESS * D.y * D.y * WA * sk;
  }

  // Distance-from-origin wave attenuation. Far from the camera origin we
  // fade wave height to zero so the horizon reads as calm water rather
  // than crests rolling all the way to the fog band.
  float distFromOrigin = length(vec2(x0, z0));
  float waveFalloff = 1.0 - smoothstep(uWaveFalloffNear, uWaveFalloffFar, distFromOrigin);

  worldPos.xyz += waveDisp * waveFalloff;

  // Tangent basis: base plane's identity + attenuated wave contributions.
  // As waveFalloff → 0, dPdx → (1,0,0), dPdz → (0,0,1), cross → (0,1,0).
  vec3 dPdx = vec3(1.0, 0.0, 0.0) + waveDPdx * waveFalloff;
  vec3 dPdz = vec3(0.0, 0.0, 1.0) + waveDPdz * waveFalloff;

  vWorldPos = worldPos.xyz;
  vNormal   = normalize(cross(dPdz, dPdx));

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
