'use client';

import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { parallaxState } from '@/lib/parallax';
import { controls } from '@/lib/controls';

/**
 * Camera driver. Owns:
 *   - the base position / lookAt target (leva-tunable via `controls.camera`)
 *   - scroll-driven dolly blend (`cameraControl.dollyT`, 0 → 1)
 *   - mouse-parallax smoothing (also drives the ship)
 *   - a very gentle Y-axis idle float (amplitude 0.08, ~6s period)
 *
 * Lambda conversion (time constant τ = 1/λ):
 *   "damping 0.05 per 60fps frame" ≈ τ≈0.33s → λ≈3.0
 */
const BASE_LOOK = new THREE.Vector3(3, 1, 0);
const MOUSE_LAMBDA = 3.0;
const IDLE_AMPLITUDE = 0.08;
const IDLE_PERIOD = 6; // seconds

/**
 * Mutable controller exposed to parent timelines. Step 6 animates `dollyT`
 * from 0 → 1 via ScrollTrigger.
 */
export const cameraControl = {
  dollyT: 0,
};

export function CameraRig() {
  const { camera } = useThree();
  const clock = useRef(0);

  // Reusable vectors — no per-frame allocation.
  const tmpPos = useRef(new THREE.Vector3()).current;

  useLayoutEffect(() => {
    camera.position.set(
      controls.camera.baseX,
      controls.camera.baseY,
      controls.camera.baseZ,
    );
    camera.lookAt(BASE_LOOK);
  }, [camera]);

  useFrame((_, dt) => {
    clock.current += dt;

    // Free-camera mode: OrbitControls drives the camera directly, so we
    // skip the rig's pose update entirely. Parallax smoothing still
    // runs because the ship consumes it — otherwise the ship snaps.
    const freeCam = controls.camera.freeCamera;

    // 1. Smooth mouse target → smoothed (shared with ship).
    parallaxState.smoothedX = THREE.MathUtils.damp(
      parallaxState.smoothedX,
      parallaxState.targetX,
      MOUSE_LAMBDA,
      dt,
    );
    parallaxState.smoothedY = THREE.MathUtils.damp(
      parallaxState.smoothedY,
      parallaxState.targetY,
      MOUSE_LAMBDA,
      dt,
    );

    if (freeCam) return;

    // 2. Dolly-blend base Y/Z from controls (scroll-driven dollyT 0→1).
    const t = THREE.MathUtils.clamp(cameraControl.dollyT, 0, 1);
    const baseY = THREE.MathUtils.lerp(
      controls.camera.baseY,
      controls.camera.dollyEndY,
      t,
    );
    const baseZ = THREE.MathUtils.lerp(
      controls.camera.baseZ,
      controls.camera.dollyEndZ,
      t,
    );

    // 3. Idle Y float.
    const idle = Math.sin((clock.current / IDLE_PERIOD) * Math.PI * 2) * IDLE_AMPLITUDE;

    // 4. Final camera pose.
    const mx = parallaxState.smoothedX;
    const my = parallaxState.smoothedY;
    tmpPos.set(
      controls.camera.baseX + mx * controls.camera.offsetXGain,
      baseY + my * controls.camera.offsetYGain + idle,
      baseZ,
    );
    camera.position.copy(tmpPos);
    camera.lookAt(BASE_LOOK);
  });

  return null;
}
