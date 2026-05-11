'use client';

import { useMemo } from 'react';
import { useControls } from 'leva';
import { useFrame } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  DepthOfField,
  ChromaticAberration,
  Vignette,
  Noise,
  HueSaturation,
  BrightnessContrast,
  SMAA,
  N8AO,
} from '@react-three/postprocessing';
import { SMAAPreset } from 'postprocessing';
import { Vector2, Vector3 } from 'three';
import { controls } from '@/lib/controls';
import { shipState } from '@/lib/ship';

/**
 * Cinematic post-processing stack.
 *
 * Lives as a child of <Canvas /> so it sits inside the R3F render loop.
 * Unlike the hot-path controls (Sun/Ocean/etc.) which use `onChange` into
 * a shared object, this component reads its leva values reactively — a
 * toggle change re-renders the component and EffectComposer rebuilds its
 * pass list. That's fine because these are setup-time knobs, not
 * per-frame uniforms.
 *
 * Render order (matters — each pass operates on the previous pass's output):
 *   Scene → N8AO → Bloom → DepthOfField → ChromaticAberration
 *         → HueSaturation → BrightnessContrast
 *         → Vignette → Noise → SMAA → screen
 *
 * N8AO runs first so the ambient-occlusion darkening is lit by subsequent
 * effects (bloom can bleed into the un-occluded edges, etc.) rather than
 * being masked by them. SMAA sits at the end so the final image is clean —
 * any jaggies introduced by earlier effects get smoothed out last, and the
 * SMAAPreset.ULTRA + multisampling={8} combo pushes edge quality beyond
 * what the stock preset delivered. Even if the SMAA toggle is off, MSAA
 * in the composer's framebuffer still hides the worst jaggies.
 */
export function PostEffects() {
  // Master toggle first so flipping off skips the whole pass chain.
  const master = useControls('Post / master', {
    enabled: controls.post.enabled,
    smaa: controls.post.smaa,
  });

  const bloom = useControls('Post / bloom', {
    bloom: controls.post.bloom,
    intensity: {
      value: controls.post.bloomIntensity,
      min: 0,
      max: 3,
      step: 0.05,
    },
    threshold: {
      label: 'luminance threshold',
      value: controls.post.bloomThreshold,
      min: 0,
      max: 1,
      step: 0.01,
    },
    smoothing: {
      label: 'luminance smoothing',
      value: controls.post.bloomSmoothing,
      min: 0,
      max: 1,
      step: 0.01,
    },
  });

  // Depth of field. Focus control is offered in three complementary modes
  // because normalized `focusDistance` (0-1 along the frustum) is hard to
  // dial in at a ship that's ~25u out against a 200u far plane:
  //
  //   - `focusOnShip`: DoF's `target` prop is fed the ship's world XYZ
  //     each frame. Focus distance is auto-computed from camera→target,
  //     and tracks the ship as it drifts. This is the default mode.
  //   - `worldFocusDistance`: manual distance in world units. Straight-
  //     forward — "focus at 30u from camera".
  //   - `focusDistance` (normalized): kept for compat, ignored while the
  //     above two are active.
  //
  // `worldFocusRange` is the depth band that stays in sharp focus; pixels
  // outside roll off into blur at `bokehScale`.
  const dof = useControls('Post / depth of field', {
    dof: controls.post.dof,
    focusOnShip: {
      label: 'focus on ship',
      value: controls.post.focusOnShip,
    },
    worldFocusDistance: {
      label: 'world focus dist',
      value: controls.post.worldFocusDistance,
      min: 1,
      max: 80,
      step: 0.25,
    },
    worldFocusRange: {
      label: 'world focus range',
      value: controls.post.worldFocusRange,
      min: 0.5,
      max: 30,
      step: 0.25,
    },
    focus: {
      label: 'focus (norm)',
      value: controls.post.dofDistance,
      min: 0,
      max: 1,
      step: 0.001,
    },
    focalLength: {
      value: controls.post.dofFocalLength,
      min: 0,
      max: 1,
      step: 0.005,
    },
    bokehScale: {
      value: controls.post.dofBokeh,
      min: 0,
      max: 30,
      step: 0.25,
    },
  });

  // DoF `target` prop takes a live Vector3 — the effect reads .x/.y/.z
  // each frame when updating the circle-of-confusion, so mutating this
  // Vector3 in useFrame is enough; no re-render needed.
  const dofTarget = useMemo(() => new Vector3(0, 0, 0), []);
  useFrame(() => {
    if (dof.focusOnShip) {
      dofTarget.set(shipState.x, shipState.y, shipState.z);
    }
  });

  // N8AO — screen-space ambient occlusion. Darkens the hull/water crease
  // and the ship's self-occluded corners, which flat directional lighting
  // alone can't produce. Runs as a standalone pass (not an Effect) but is
  // wrapped by @react-three/postprocessing so it composes with the chain.
  const ao = useControls('Post / ambient occlusion', {
    ao: controls.post.ao,
    radius: {
      label: 'ao radius',
      value: controls.post.aoRadius,
      min: 0,
      max: 10,
      step: 0.05,
    },
    intensity: {
      label: 'ao intensity',
      value: controls.post.aoIntensity,
      min: 0,
      max: 10,
      step: 0.05,
    },
    distanceFalloff: {
      label: 'distance falloff',
      value: controls.post.aoDistanceFalloff,
      min: 0,
      max: 5,
      step: 0.05,
    },
    // With screen-space radius on, `radius` is measured in pixels at the
    // tightest sample distance rather than world units — gives a much
    // more contact-y shadow under the hull instead of the flat halo
    // that 0.55-world-unit radius produced.
    screenSpaceRadius: {
      label: 'screen-space radius',
      value: controls.post.aoScreenSpace,
    },
  });

  const chroma = useControls('Post / chromatic aberration', {
    chroma: controls.post.chroma,
    offset: {
      value: controls.post.chromaOffset,
      min: 0,
      max: 0.006,
      step: 0.0001,
    },
  });

  const vig = useControls('Post / vignette', {
    vignette: controls.post.vignette,
    darkness: {
      value: controls.post.vignetteDarkness,
      min: 0,
      max: 1,
      step: 0.01,
    },
    offset: {
      value: controls.post.vignetteOffset,
      min: 0,
      max: 1,
      step: 0.01,
    },
  });

  const grain = useControls('Post / grain', {
    grain: controls.post.grain,
    opacity: {
      value: controls.post.grainOpacity,
      min: 0,
      max: 0.4,
      step: 0.005,
    },
  });

  const grade = useControls('Post / color grading', {
    grading: controls.post.grading,
    hue: { value: controls.post.hue, min: -Math.PI, max: Math.PI, step: 0.01 },
    saturation: {
      value: controls.post.saturation,
      min: -1,
      max: 1,
      step: 0.01,
    },
    brightness: {
      value: controls.post.brightness,
      min: -0.5,
      max: 0.5,
      step: 0.01,
    },
    contrast: {
      value: controls.post.contrast,
      min: -0.5,
      max: 0.5,
      step: 0.01,
    },
  });

  // ChromaticAberration expects a THREE.Vector2 (not a plain array in this
  // version). Memoize so we don't allocate a new Vector2 each render.
  const chromaOffset = useMemo(
    () => new Vector2(chroma.offset, chroma.offset),
    [chroma.offset],
  );

  if (!master.enabled) return null;

  return (
    <EffectComposer multisampling={8}>
      <>
        {ao.ao && (
          <N8AO
            aoRadius={ao.radius}
            intensity={ao.intensity}
            distanceFalloff={ao.distanceFalloff}
            quality="ultra"
            aoSamples={24}
            denoiseSamples={8}
            screenSpaceRadius={ao.screenSpaceRadius}
          />
        )}
        {bloom.bloom && (
          <Bloom
            intensity={bloom.intensity}
            luminanceThreshold={bloom.threshold}
            luminanceSmoothing={bloom.smoothing}
            mipmapBlur
          />
        )}
        {dof.dof && (
          <DepthOfField
            // `target` takes precedence over focusDistance when set; the
            // effect samples its .x/.y/.z each frame, so we just mutate
            // the same Vector3 in useFrame. When focusOnShip is off, we
            // fall back to worldFocusDistance (world units) which is far
            // easier to reason about than the 0-1 normalized form.
            target={dof.focusOnShip ? dofTarget : undefined}
            worldFocusDistance={
              dof.focusOnShip ? undefined : dof.worldFocusDistance
            }
            worldFocusRange={dof.worldFocusRange}
            focusDistance={dof.focus}
            focalLength={dof.focalLength}
            bokehScale={dof.bokehScale}
          />
        )}
        {chroma.chroma && (
          <ChromaticAberration
            offset={chromaOffset}
            radialModulation={false}
            modulationOffset={0}
          />
        )}
        {grade.grading && (
          <HueSaturation hue={grade.hue} saturation={grade.saturation} />
        )}
        {grade.grading && (
          <BrightnessContrast
            brightness={grade.brightness}
            contrast={grade.contrast}
          />
        )}
        {vig.vignette && (
          <Vignette
            eskil={false}
            offset={vig.offset}
            darkness={vig.darkness}
          />
        )}
        {grain.grain && <Noise premultiply opacity={grain.opacity} />}
        {/* ULTRA preset raises SMAA's edge-detection and blending quality
            well beyond the default — the previous stock SMAA was visibly
            soft on diagonals and silhouettes, which the user called out. */}
        {master.smaa && <SMAA preset={SMAAPreset.ULTRA} />}
      </>
    </EffectComposer>
  );
}
