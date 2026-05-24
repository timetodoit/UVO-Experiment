// Mutable tuning for the fuel slider liquid sim. The FuelSlider reads these
// each frame; the dev-only ControlsPanel writes to them via leva onChange.

export const fuelControls = {
  // Spring restoring force toward the rest level. Higher = stiffer surface,
  // faster oscillation.
  tension: 0.025,
  // Per-frame velocity loss. Higher = waves die out faster.
  damping: 0.04,
  // How strongly each column pulls its neighbors. Higher = waves travel
  // faster along the surface.
  spread: 0.2,
  // Lateral passes per substep. More = smoother / faster propagation.
  passes: 5,
  // Splash impulse scaling: impulse magnitude ≈ |pointer_vy| * splashGain.
  splashGain: 0.006,
  // Cap on a single splash impulse.
  splashMax: 5,
  // Surface columns affected by a splash (Gaussian-weighted around pointer).
  splashRadius: 5,
};

// Action handles wired up by the FuelSlider on mount.
export const fuelSim = {
  calm: () => {},
};
