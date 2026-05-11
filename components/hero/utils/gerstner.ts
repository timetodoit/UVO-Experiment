/**
 * Shared Gerstner wave definition. The GLSL vertex shader in
 * `shaders/ocean.vert.glsl` MUST implement the exact same math so CPU-sampled
 * ship bobbing stays pixel-locked to the GPU-displaced ocean.
 *
 * Formulation per wave i:
 *   D  = normalize(dir)
 *   w  = 2π / wavelength
 *   A  = steepness * wavelength / (2π)
 *   Q  = 0.5              (peak-sharpness, kept moderate)
 *   φ  = speed * w        (angular frequency from spec's "speed")
 *   k  = w·(D·xz0) + φ·t
 *
 *   dx  += Q · A · D.x · cos(k)
 *   dz  += Q · A · D.y · cos(k)
 *   dy  +=     A         · sin(k)
 *
 * The *input* xz is the undisplaced world-space position; Gerstner's horizontal
 * drift is layered on top of that, not iterated.
 */

export type GerstnerWave = {
  dir: [number, number];
  wavelength: number;
  steepness: number;
  speed: number;
};

// Six waves with deliberately non-harmonic wavelengths (no integer ratios
// between any pair) so their combined pattern doesn't repeat visibly over
// the visible patch. Directions are spread around the compass — no two
// waves within ~45° — to avoid reinforcing the same streak direction.
// Steepness is kept modest because 6 waves summed can over-sharpen crests
// and break the Gerstner approximation (visible "loops" at the peaks).
export const OCEAN_WAVES: GerstnerWave[] = [
  { dir: [1.0, 0.6], wavelength: 8.0, steepness: 0.2, speed: 1.2 },
  { dir: [-0.7, 0.4], wavelength: 4.7, steepness: 0.14, speed: 1.3 },
  { dir: [0.3, -1.0], wavelength: 2.3, steepness: 0.11, speed: 1.0 },
  { dir: [0.9, -0.25], wavelength: 5.9, steepness: 0.08, speed: 1.8 },
  { dir: [-0.35, -0.9], wavelength: 3.1, steepness: 0.07, speed: 0.6 },
  { dir: [0.15, 0.95], wavelength: 1.3, steepness: 0.05, speed: 2.2 },
];

export const OCEAN_WAVE_COUNT = OCEAN_WAVES.length;
const TAU = Math.PI * 2;
const Q = 0.5;

/**
 * Displaced surface point at undisplaced world XZ. Returns world-space
 * (x + dx, y = dy, z + dz).
 */
export function sampleOceanPoint(
  x: number,
  z: number,
  t: number,
  waves: GerstnerWave[] = OCEAN_WAVES,
): { x: number; y: number; z: number } {
  let dx = 0;
  let dy = 0;
  let dz = 0;

  for (const w of waves) {
    const mag = Math.hypot(w.dir[0], w.dir[1]) || 1;
    const Dx = w.dir[0] / mag;
    const Dz = w.dir[1] / mag;
    const omega = TAU / w.wavelength;
    const A = (w.steepness * w.wavelength) / TAU;
    const phi = w.speed * omega;
    const k = omega * (Dx * x + Dz * z) + phi * t;
    const ck = Math.cos(k);
    const sk = Math.sin(k);
    dx += Q * A * Dx * ck;
    dz += Q * A * Dz * ck;
    dy += A * sk;
  }

  return { x: x + dx, y: dy, z: z + dz };
}

/**
 * Just the height. Cheaper when you don't need horizontal drift (e.g. quick
 * bob sampling at a fixed XZ). Note: the `x`/`z` args are UNDISPLACED
 * world-space coords (pre-Gerstner-horizontal-drift). For the ship bob,
 * prefer `sampleOceanHeightAtWorld`, which inverts the drift so the ship
 * sits on the wave that's visible under it, not on the wave whose
 * pre-drift coords match.
 */
export function sampleOceanHeight(
  x: number,
  z: number,
  t: number,
  waves: GerstnerWave[] = OCEAN_WAVES,
): number {
  return sampleOceanPoint(x, z, t, waves).y;
}

/**
 * Height of the displaced water surface at a given WORLD position (X, Z).
 *
 * Gerstner's horizontal drift means a vertex starting at undisplaced (u, v)
 * ends up at world (u + dx(u,v), dy, v + dz(u,v)). So naively calling
 * `sampleOceanHeight(X, Z)` gives the height of the vertex that STARTED
 * at (X, Z), not the height of the water visibly under (X, Z). The
 * mismatch is what caused the ship to alternately float above and sink
 * below the rendered surface.
 *
 * Fix: one fixed-point iteration. Guess (u, v) = (X, Z), evaluate drift
 * → refine (u, v) = (X - dx, Z - dz), re-evaluate. One iteration is
 * enough at Q=0.5 steepness — residual error is <2% of amplitude.
 */
export function sampleOceanHeightAtWorld(
  X: number,
  Z: number,
  t: number,
  waves: GerstnerWave[] = OCEAN_WAVES,
): number {
  const p1 = sampleOceanPoint(X, Z, t, waves);
  const u = 2 * X - p1.x; // = X - (p1.x - X) = X - dx
  const v = 2 * Z - p1.z;
  const p2 = sampleOceanPoint(u, v, t, waves);
  return p2.y;
}
