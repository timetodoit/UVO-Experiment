/**
 * Shared mouse-parallax state. Plain module-level object so every useFrame
 * consumer (camera rig, ship) can read the latest values with zero
 * rerenders. `target*` are set by the pointermove listener; `smoothed*` are
 * lerped toward the target inside <CameraRig>.
 *
 * Components that consume these should run AFTER <CameraRig> in the R3F
 * component tree so they read the post-smoothing values each frame.
 */
export const parallaxState = {
  targetX: 0, // normalized [-1, 1]
  targetY: 0, // normalized [-1, 1]
  smoothedX: 0,
  smoothedY: 0,
};
