'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import oceanVert from './shaders/ocean.vert.glsl';
import oceanFrag from './shaders/ocean.frag.glsl';
import { OCEAN_WAVES, OCEAN_WAVE_COUNT } from './utils/gerstner';
import { getSunColor, getSunDir } from './utils/sun';
import { shipState } from '@/lib/ship';
import { controls } from '@/lib/controls';

// Shader hardcodes 6 waves — bail loudly if the shared array drifts.
if (OCEAN_WAVE_COUNT !== 6) {
  throw new Error(
    `Ocean shader expects exactly 6 waves, got ${OCEAN_WAVE_COUNT}. ` +
      `Update ocean.vert.glsl loop bound if this changes.`,
  );
}

export function Ocean() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    const dirs = OCEAN_WAVES.map((w) => {
      const mag = Math.hypot(w.dir[0], w.dir[1]) || 1;
      return new THREE.Vector2(w.dir[0] / mag, w.dir[1] / mag);
    });

    return {
      uTime: { value: 0 },
      uDir: { value: dirs },
      uWavelength: { value: OCEAN_WAVES.map((w) => w.wavelength) },
      uSteepness: { value: OCEAN_WAVES.map((w) => w.steepness) },
      uSpeed: { value: OCEAN_WAVES.map((w) => w.speed) },

      // Water palette — all sourced from controls.ocean (leva colors).
      uDeepColor: { value: new THREE.Color(controls.ocean.deepColor) },
      uCrestColor: { value: new THREE.Color(controls.ocean.crestColor) },
      uSubsurfaceColor: { value: new THREE.Color(controls.ocean.subsurfaceColor) },
      uFoamColor: { value: new THREE.Color(controls.ocean.foamColor) },

      // Procedural sky mirror — matches the SkyDome so the water's
      // reflected sky lines up with the real sky above the horizon. These
      // stay static (no leva control yet — tweak in Scene.tsx SkyDome to
      // change both in lockstep).
      uSkyHorizon: { value: new THREE.Color('#dbe8f0') },
      uSkyZenith: { value: new THREE.Color('#1f6fad') },

      // Fog color must match <fog> in Scene.tsx exactly — distant water
      // dissolves into the atmosphere, so any mismatch shows as a band.
      uFogColor: { value: new THREE.Color('#dbe8f0') },
      uFogNear: { value: 14.0 },
      uFogFar: { value: 70.0 },

      // Sun — direction, tint, and intensity all driven by controls.sun.
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff6e6') },
      uSunIntensity: { value: controls.sun.intensity },
      uAmbientIntensity: { value: controls.lights.ambientIntensity },

      // Micro-ripple detail (fragment-only — no ship coupling).
      uRippleStrength: { value: controls.ocean.rippleStrength },
      uRippleScale: { value: controls.ocean.rippleScale },
      uRippleSpeed: { value: controls.ocean.rippleSpeed },

      // Cloud shadow sampling — same uniforms as sky so the cloud fbm
      // field evaluates to the same values at the same world coords.
      uCloudCoverage: { value: controls.clouds.coverage },
      uCloudScale: { value: controls.clouds.scale },
      uCloudSpeed: { value: controls.clouds.speed },
      uCloudShadowStrength: { value: controls.clouds.shadowStrength },

      // Hull-reflection approximation — dark water near the ship.
      uHullShadowStrength: { value: controls.ocean.hullShadowStrength },
      uHullShadowRadius: { value: controls.ocean.hullShadowRadius },

      // Sun-independent contact AO under the hull — what gives the boat
      // a proper dark "shadow" at low sun elevations when the PCF key
      // shadow has been thrown off to the horizon.
      uHullContactStrength: { value: controls.ocean.hullContactStrength },
      uHullContactRadius: { value: controls.ocean.hullContactRadius },

      // Distance-based wave attenuation — waves fade out toward the
      // horizon so the far ocean reads as calm rather than choppy.
      uWaveFalloffNear: { value: controls.ocean.waveFalloffNear },
      uWaveFalloffFar: { value: controls.ocean.waveFalloffFar },

      // Ship wake inputs — updated from shipState every frame.
      uShipPos: { value: new THREE.Vector2(0, 0) },
      uShipBowDir: { value: new THREE.Vector2(0, 1) },
      uShipY: { value: 0 },
    };
  }, []);

  useFrame((_, dt) => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uTime.value += dt;

    // Pull leva-edited steepness/speed off the shared OCEAN_WAVES array.
    const steepArr = m.uniforms.uSteepness.value as number[];
    const speedArr = m.uniforms.uSpeed.value as number[];
    for (let i = 0; i < OCEAN_WAVE_COUNT; i++) {
      steepArr[i] = OCEAN_WAVES[i].steepness;
      speedArr[i] = OCEAN_WAVES[i].speed;
    }

    // Mirror shared ship state into shader-side uniforms.
    const pos = m.uniforms.uShipPos.value as THREE.Vector2;
    const bow = m.uniforms.uShipBowDir.value as THREE.Vector2;
    pos.set(shipState.x, shipState.z);
    bow.set(shipState.bowDirX, shipState.bowDirZ);
    m.uniforms.uShipY.value = shipState.y;

    // Sun position/color (same source of truth as KeyLight + SkyDome).
    getSunDir(m.uniforms.uSunDir.value as THREE.Vector3);
    getSunColor(m.uniforms.uSunColor.value as THREE.Color);
    m.uniforms.uSunIntensity.value = controls.sun.intensity;
    m.uniforms.uAmbientIntensity.value = controls.lights.ambientIntensity;

    // Ocean palette — leva color picker writes hex strings; `.set(hex)`
    // re-parses into the existing Color object (no allocation).
    (m.uniforms.uDeepColor.value as THREE.Color).set(controls.ocean.deepColor);
    (m.uniforms.uCrestColor.value as THREE.Color).set(controls.ocean.crestColor);
    (m.uniforms.uSubsurfaceColor.value as THREE.Color).set(controls.ocean.subsurfaceColor);
    (m.uniforms.uFoamColor.value as THREE.Color).set(controls.ocean.foamColor);

    // Ripple + cloud + hull-shadow params.
    m.uniforms.uRippleStrength.value = controls.ocean.rippleStrength;
    m.uniforms.uRippleScale.value = controls.ocean.rippleScale;
    m.uniforms.uRippleSpeed.value = controls.ocean.rippleSpeed;
    m.uniforms.uCloudCoverage.value = controls.clouds.coverage;
    m.uniforms.uCloudScale.value = controls.clouds.scale;
    m.uniforms.uCloudSpeed.value = controls.clouds.speed;
    m.uniforms.uCloudShadowStrength.value = controls.clouds.shadowStrength;
    m.uniforms.uHullShadowStrength.value = controls.ocean.hullShadowStrength;
    m.uniforms.uHullShadowRadius.value = controls.ocean.hullShadowRadius;
    m.uniforms.uHullContactStrength.value = controls.ocean.hullContactStrength;
    m.uniforms.uHullContactRadius.value = controls.ocean.hullContactRadius;
    m.uniforms.uWaveFalloffNear.value = controls.ocean.waveFalloffNear;
    m.uniforms.uWaveFalloffFar.value = controls.ocean.waveFalloffFar;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      {/* 512 segments over 200u = ~0.39u per cell, so the shortest wave
          (λ=1.3) gets ~3.3 samples per period — above Nyquist + some
          margin so the ship doesn't alias against the short ripples. */}
      <planeGeometry args={[200, 200, 512, 512]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={oceanVert}
        fragmentShader={oceanFrag}
        uniforms={uniforms}
      />
    </mesh>
  );
}
