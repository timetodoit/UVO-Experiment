/**
 * Shared ship world state. Ship writes to it each frame, the ocean's
 * fragment shader reads it for wake foam, and the DoF pass reads it for
 * auto-focus. Module-level mutable object — no React state, no rerenders.
 */
export const shipState = {
  /** World X of the ship's origin (hull center in XZ). */
  x: 0,
  /** World Y of the ship's midship deck — used by the ocean shader's
   *  hull contact AO (darker where the hull sits close to the water) and
   *  by the DoF pass for focus targeting. */
  y: 0,
  /** World Z. */
  z: 0,
  /** Unit vector in world XZ pointing from stern to bow. */
  bowDirX: 0,
  bowDirZ: 1,
};
