/**
 * Shared, mutable control state. Leva writes to this object (via onChange
 * callbacks — not reactive state), every per-frame consumer reads from it.
 *
 * Ocean wave params live on the OCEAN_WAVES array in
 * `components/hero/utils/gerstner.ts` so the CPU sampler (used by the ship)
 * and the GPU uniforms share one source of truth.
 *
 * Colors are stored as hex strings so leva's color picker can roundtrip
 * them; consumers in `useFrame` parse them into THREE.Color each frame via
 * `color.set(hex)` (cheap — same object, just updated components).
 */
export const controls = {
  // Sun position + color. Drives the key DirectionalLight, the ocean
  // shader's uSunDir, and the sky shader's sun disc + god rays. Azimuth
  // is degrees clockwise from +Z (camera-forward), elevation is degrees
  // above the horizon. Warmth shifts the sun color from neutral white
  // (0) toward deep golden-hour amber (1).
  sun: {
    // Low amber afternoon sun facing the camera — produces long glints
    // on the water and a visible sun disc in the sky dome.
    azimuth: 184,
    elevation: 6.0,
    warmth: 1.0,
    intensity: 4.05,
  },
  // Procedural cloud layer rendered by the sky shader and re-sampled by
  // the ocean shader to cast soft moving shadows on the water.
  clouds: {
    coverage: 0.28,
    scale: 1.18,
    speed: 0.1,
    opacity: 1.0,
    shadowStrength: 0.51,
    godRays: 1.05,
  },
  ocean: {
    // Palette — water body + foam tint.
    deepColor: '#051424',
    crestColor: '#1f4a4b',
    subsurfaceColor: '#4ebec7',
    foamColor: '#d1e1f2',
    // Fragment-only micro-ripple normal perturbation — adds fine surface
    // detail without modifying geometry (ship bob stays smooth).
    rippleStrength: 0.24,
    rippleScale: 2.8,
    rippleSpeed: 1.08,
    // "Hull reflection" — darkens the water near the ship to simulate
    // the hull blocking sky reflection. Cheaper and more convincing at
    // this camera angle than a full planar mirror pass.
    hullShadowStrength: 0.71,
    hullShadowRadius: 4.9,
    // Hull contact AO — sun-independent darkening directly under the
    // ship. Kicks in stronger when the ship's Y is close to the water's
    // Y (wave trough), giving a proper "shadow you don't see because
    // the sun is low" under-hull darkness. Separate from hullShadow so
    // both can be tuned without one swamping the other.
    hullContactStrength: 0.85,
    hullContactRadius: 3.8,
    // Wave falloff. Waves at distance `far` are attenuated to 0 — so the
    // horizon doesn't look as choppy as the water under the camera. The
    // CPU sampler uses full-height waves because the ship always sits
    // near origin (well inside `near`).
    waveFalloffNear: 30.0,
    waveFalloffFar: 75.0,
  },
  ship: {
    driftSpeed: 0.07,
    yawGain: 0.07,
    pathXGain: 0.3,
    // How deeply the ship sits in the water. Larger = hull displaces
    // more water. Small bumps in this hide the sample-vs-actual mismatch
    // that Gerstner has when the ship lies on a steep wave crest.
    submerge: 0.28,
  },
  camera: {
    offsetXGain: 2.0,
    offsetYGain: 0.39,
    baseX: -3.5,
    baseY: 4.8,
    baseZ: 24.5,
    dollyEndY: 0.6,
    dollyEndZ: 8.5,
    // Free-camera mode. When true, <CameraRig> steps aside and
    // <OrbitControls> takes over so the user can frame any angle. The
    // "save as default" button in the Leva panel writes the current
    // camera position into baseX/Y/Z.
    freeCamera: false,
  },
  lights: {
    // Daylight fills — tuned lower now that the AO pass and the
    // warmer/stronger sun carry more of the overall lighting load.
    ambientIntensity: 0.98,
    hemiIntensity: 1.8,
    fillIntensity: 1.75,
    rimIntensity: 2.05,
    // Mid-exposure so the ACES rolloff doesn't blow out the now-brighter
    // sun intensity (4.05) on specular highlights.
    exposure: 0.7,
    shadowOpacity: 0.36,
    shadowRadius: 23,
    shadowBlurSamples: 32,
    shadowBias: -0.0005,
    shadowNormalBias: 0.06,
  },
  // Post-processing pipeline. Each of these is read reactively by the
  // `<PostEffects />` component — changing one re-renders that component
  // and the EffectComposer rebuilds its pass list. None of them are
  // read per-frame, so reactive reads are fine here (unlike the hot
  // per-frame paths above).
  post: {
    enabled: true,
    // SMAA off by default — the 8× MSAA in the composer's framebuffer
    // handles most aliasing without the extra pass. Flip on for
    // diagonals-heavy frames.
    smaa: false,
    bloom: true,
    bloomIntensity: 0.15,
    bloomThreshold: 0.64,
    bloomSmoothing: 0.18,
    dof: true,
    // `focusOnShip` sends the ship's world position into DoF's `target`
    // prop, which auto-computes focus distance. Manual mode uses the
    // worldFocusDistance slider below. `focusDistance` (0-1 normalized)
    // is kept for backwards compat but effectively unused when either
    // focusOnShip or worldFocusDistance is set.
    focusOnShip: true,
    worldFocusDistance: 25,
    worldFocusRange: 6,
    dofDistance: 0.62,
    dofFocalLength: 0.82,
    dofBokeh: 2.0,
    chroma: true,
    chromaOffset: 0.0009,
    vignette: true,
    vignetteDarkness: 0.61,
    vignetteOffset: 0.4,
    grain: true,
    grainOpacity: 0.2,
    grading: true,
    hue: -0.3,
    saturation: -0.1,
    brightness: 0.0,
    contrast: -0.2,
    // N8AO — screen-space ambient occlusion. Quality "ultra" +
    // screenSpaceRadius punches a tighter, more contact-y AO that
    // actually darkens hull-water creases rather than fading into a
    // flat halo.
    ao: true,
    aoRadius: 0.55,
    aoIntensity: 3.95,
    aoDistanceFalloff: 1.0,
    aoScreenSpace: true,
  },
};

export type Controls = typeof controls;
