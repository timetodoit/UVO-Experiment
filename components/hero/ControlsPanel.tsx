'use client';

import { useControls } from 'leva';
import { OCEAN_WAVES } from './utils/gerstner';
import { controls } from '@/lib/controls';

/**
 * Dev-only tweak panel. Gated by `NODE_ENV === 'development'` so it (and the
 * leva bundle) tree-shakes out of production builds.
 *
 * Values are written via leva `onChange` callbacks directly into the shared
 * `controls` object and the `OCEAN_WAVES` array — no React state, no
 * rerenders. Consumers read from these refs each frame in `useFrame`.
 */
export function ControlsPanel() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Panel />;
}

function Panel() {
  // Sun — moves the key light, the ocean's specular source, and the sky
  // dome's sun disc together.
  useControls('Sun', {
    azimuth: {
      value: controls.sun.azimuth,
      min: 0,
      max: 360,
      step: 1,
      onChange: (v) => {
        controls.sun.azimuth = v;
      },
    },
    elevation: {
      value: controls.sun.elevation,
      min: 0,
      max: 90,
      step: 0.5,
      onChange: (v) => {
        controls.sun.elevation = v;
      },
    },
    warmth: {
      label: 'warmth',
      value: controls.sun.warmth,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v) => {
        controls.sun.warmth = v;
      },
    },
    intensity: {
      value: controls.sun.intensity,
      min: 0,
      max: 6,
      step: 0.05,
      onChange: (v) => {
        controls.sun.intensity = v;
      },
    },
  });

  // Clouds — shared by sky shader (renders clouds) and ocean shader
  // (re-samples the same field for moving shadow projections).
  useControls('Clouds', {
    coverage: {
      value: controls.clouds.coverage,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v) => {
        controls.clouds.coverage = v;
      },
    },
    scale: {
      value: controls.clouds.scale,
      min: 0.1,
      max: 2,
      step: 0.01,
      onChange: (v) => {
        controls.clouds.scale = v;
      },
    },
    speed: {
      value: controls.clouds.speed,
      min: 0,
      max: 0.1,
      step: 0.001,
      onChange: (v) => {
        controls.clouds.speed = v;
      },
    },
    opacity: {
      value: controls.clouds.opacity,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v) => {
        controls.clouds.opacity = v;
      },
    },
    shadowStrength: {
      label: 'shadow strength',
      value: controls.clouds.shadowStrength,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v) => {
        controls.clouds.shadowStrength = v;
      },
    },
    godRays: {
      label: 'god rays',
      value: controls.clouds.godRays,
      min: 0,
      max: 1.5,
      step: 0.01,
      onChange: (v) => {
        controls.clouds.godRays = v;
      },
    },
  });

  // Ocean — palette + ripple detail + hull-shadow sizing + three primary
  // wave speeds/steepnesses. Waves 4–6 stay at their OCEAN_WAVES defaults
  // to keep the panel compact; edit the array directly if you need those.
  useControls('Ocean', {
    deepColor: {
      label: 'deep color',
      value: controls.ocean.deepColor,
      onChange: (v) => {
        controls.ocean.deepColor = v;
      },
    },
    crestColor: {
      label: 'crest color',
      value: controls.ocean.crestColor,
      onChange: (v) => {
        controls.ocean.crestColor = v;
      },
    },
    subsurfaceColor: {
      label: 'subsurface',
      value: controls.ocean.subsurfaceColor,
      onChange: (v) => {
        controls.ocean.subsurfaceColor = v;
      },
    },
    foamColor: {
      label: 'foam color',
      value: controls.ocean.foamColor,
      onChange: (v) => {
        controls.ocean.foamColor = v;
      },
    },
    rippleStrength: {
      label: 'ripple strength',
      value: controls.ocean.rippleStrength,
      min: 0,
      max: 1.5,
      step: 0.02,
      onChange: (v) => {
        controls.ocean.rippleStrength = v;
      },
    },
    rippleScale: {
      label: 'ripple scale',
      value: controls.ocean.rippleScale,
      min: 0.5,
      max: 5,
      step: 0.05,
      onChange: (v) => {
        controls.ocean.rippleScale = v;
      },
    },
    rippleSpeed: {
      label: 'ripple speed',
      value: controls.ocean.rippleSpeed,
      min: 0,
      max: 1.5,
      step: 0.01,
      onChange: (v) => {
        controls.ocean.rippleSpeed = v;
      },
    },
    hullShadowStrength: {
      label: 'hull shadow',
      value: controls.ocean.hullShadowStrength,
      min: 0,
      max: 1,
      step: 0.02,
      onChange: (v) => {
        controls.ocean.hullShadowStrength = v;
      },
    },
    hullShadowRadius: {
      label: 'hull radius',
      value: controls.ocean.hullShadowRadius,
      min: 0,
      max: 15,
      step: 0.1,
      onChange: (v) => {
        controls.ocean.hullShadowRadius = v;
      },
    },
    hullContactStrength: {
      label: 'contact AO',
      value: controls.ocean.hullContactStrength,
      min: 0,
      max: 2,
      step: 0.02,
      onChange: (v) => {
        controls.ocean.hullContactStrength = v;
      },
    },
    hullContactRadius: {
      label: 'contact AO radius',
      value: controls.ocean.hullContactRadius,
      min: 0,
      max: 10,
      step: 0.1,
      onChange: (v) => {
        controls.ocean.hullContactRadius = v;
      },
    },
    waveFalloffNear: {
      label: 'wave fade near',
      value: controls.ocean.waveFalloffNear,
      min: 5,
      max: 100,
      step: 1,
      onChange: (v) => {
        controls.ocean.waveFalloffNear = v;
      },
    },
    waveFalloffFar: {
      label: 'wave fade far',
      value: controls.ocean.waveFalloffFar,
      min: 10,
      max: 150,
      step: 1,
      onChange: (v) => {
        controls.ocean.waveFalloffFar = v;
      },
    },
    wave1Steepness: {
      label: 'wave 1 steepness',
      value: OCEAN_WAVES[0].steepness,
      min: 0,
      max: 0.5,
      step: 0.005,
      onChange: (v) => {
        OCEAN_WAVES[0].steepness = v;
      },
    },
    wave1Speed: {
      label: 'wave 1 speed',
      value: OCEAN_WAVES[0].speed,
      min: 0,
      max: 3,
      step: 0.05,
      onChange: (v) => {
        OCEAN_WAVES[0].speed = v;
      },
    },
    wave2Steepness: {
      label: 'wave 2 steepness',
      value: OCEAN_WAVES[1].steepness,
      min: 0,
      max: 0.5,
      step: 0.005,
      onChange: (v) => {
        OCEAN_WAVES[1].steepness = v;
      },
    },
    wave2Speed: {
      label: 'wave 2 speed',
      value: OCEAN_WAVES[1].speed,
      min: 0,
      max: 3,
      step: 0.05,
      onChange: (v) => {
        OCEAN_WAVES[1].speed = v;
      },
    },
    wave3Steepness: {
      label: 'wave 3 steepness',
      value: OCEAN_WAVES[2].steepness,
      min: 0,
      max: 0.5,
      step: 0.005,
      onChange: (v) => {
        OCEAN_WAVES[2].steepness = v;
      },
    },
    wave3Speed: {
      label: 'wave 3 speed',
      value: OCEAN_WAVES[2].speed,
      min: 0,
      max: 3,
      step: 0.05,
      onChange: (v) => {
        OCEAN_WAVES[2].speed = v;
      },
    },
  });

  useControls('Ship', {
    driftSpeed: {
      value: controls.ship.driftSpeed,
      min: 0,
      max: 0.5,
      step: 0.005,
      onChange: (v) => {
        controls.ship.driftSpeed = v;
      },
    },
    yawGain: {
      label: 'mouse → yaw',
      value: controls.ship.yawGain,
      min: 0,
      max: 0.2,
      step: 0.005,
      onChange: (v) => {
        controls.ship.yawGain = v;
      },
    },
    pathXGain: {
      label: 'mouse → path X',
      value: controls.ship.pathXGain,
      min: 0,
      max: 1.5,
      step: 0.05,
      onChange: (v) => {
        controls.ship.pathXGain = v;
      },
    },
    submerge: {
      label: 'submerge',
      value: controls.ship.submerge,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v) => {
        controls.ship.submerge = v;
      },
    },
  });

  useControls('Camera', {
    offsetXGain: {
      label: 'mouse → X',
      value: controls.camera.offsetXGain,
      min: 0,
      max: 2,
      step: 0.05,
      onChange: (v) => {
        controls.camera.offsetXGain = v;
      },
    },
    offsetYGain: {
      label: 'mouse → Y',
      value: controls.camera.offsetYGain,
      min: 0,
      max: 1,
      step: 0.02,
      onChange: (v) => {
        controls.camera.offsetYGain = v;
      },
    },
    baseX: {
      value: controls.camera.baseX,
      min: -5,
      max: 5,
      step: 0.1,
      onChange: (v) => {
        controls.camera.baseX = v;
      },
    },
    baseY: {
      value: controls.camera.baseY,
      min: 0,
      max: 10,
      step: 0.1,
      onChange: (v) => {
        controls.camera.baseY = v;
      },
    },
    baseZ: {
      value: controls.camera.baseZ,
      min: 5,
      max: 30,
      step: 0.5,
      onChange: (v) => {
        controls.camera.baseZ = v;
      },
    },
    dollyEndY: {
      label: 'dolly Y end',
      value: controls.camera.dollyEndY,
      min: 0,
      max: 6,
      step: 0.1,
      onChange: (v) => {
        controls.camera.dollyEndY = v;
      },
    },
    dollyEndZ: {
      label: 'dolly Z end',
      value: controls.camera.dollyEndZ,
      min: 2,
      max: 20,
      step: 0.5,
      onChange: (v) => {
        controls.camera.dollyEndZ = v;
      },
    },
  });

  useControls('Lights', {
    ambient: {
      value: controls.lights.ambientIntensity,
      min: 0,
      max: 2,
      step: 0.02,
      onChange: (v) => {
        controls.lights.ambientIntensity = v;
      },
    },
    hemi: {
      label: 'hemi fill',
      value: controls.lights.hemiIntensity,
      min: 0,
      max: 3,
      step: 0.05,
      onChange: (v) => {
        controls.lights.hemiIntensity = v;
      },
    },
    fill: {
      value: controls.lights.fillIntensity,
      min: 0,
      max: 3,
      step: 0.05,
      onChange: (v) => {
        controls.lights.fillIntensity = v;
      },
    },
    rim: {
      value: controls.lights.rimIntensity,
      min: 0,
      max: 3,
      step: 0.05,
      onChange: (v) => {
        controls.lights.rimIntensity = v;
      },
    },
    exposure: {
      value: controls.lights.exposure,
      min: 0.5,
      max: 3,
      step: 0.05,
      onChange: (v) => {
        controls.lights.exposure = v;
      },
    },
    shadowOpacity: {
      label: 'shadow strength',
      value: controls.lights.shadowOpacity,
      min: 0,
      max: 1,
      step: 0.02,
      onChange: (v) => {
        controls.lights.shadowOpacity = v;
      },
    },
    shadowRadius: {
      label: 'shadow softness',
      value: controls.lights.shadowRadius,
      min: 0,
      max: 60,
      step: 0.5,
      onChange: (v) => {
        controls.lights.shadowRadius = v;
      },
    },
    shadowBias: {
      label: 'shadow bias',
      value: controls.lights.shadowBias,
      min: -0.005,
      max: 0.005,
      step: 0.0001,
      onChange: (v) => {
        controls.lights.shadowBias = v;
      },
    },
    shadowNormalBias: {
      label: 'shadow normal bias',
      value: controls.lights.shadowNormalBias,
      min: 0,
      max: 0.5,
      step: 0.005,
      onChange: (v) => {
        controls.lights.shadowNormalBias = v;
      },
    },
  });

  return null;
}
