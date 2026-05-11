'use client';

import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { scrollState } from '@/lib/scroll';
import { cameraControl } from '../CameraRig';

gsap.registerPlugin(ScrollTrigger);

type UseScrollProgressOptions = {
  /**
   * Below `dollyStart` no dolly happens; at `dollyEnd` the dolly is complete.
   * Stretched across most of the hero scroll range so the dolly reads as a
   * slow, continuous drift toward the ship rather than a front-loaded zoom.
   */
  dollyStart?: number;
  dollyEnd?: number;
  /**
   * Callback fired on every scroll update with the raw 0..1 hero progress.
   */
  onProgress?: (heroProgress: number) => void;
};

/**
 * Pins a ScrollTrigger to the given hero section. Writes progress into shared
 * state + mutates `cameraControl.dollyT` directly so the camera dollies in on
 * scroll.
 *
 * Uses refs/mutation (not state) to avoid per-frame rerenders — matches the
 * pattern in the spec.
 */
export function useScrollProgress(
  heroRef: RefObject<HTMLElement | null>,
  {
    dollyStart = 0.0,
    dollyEnd = 0.95,
    onProgress,
  }: UseScrollProgressOptions = {},
) {
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      // Stretch the pin range so the dolly plays out over more pixels.
      end: '+=150%',
      // Heavier scrub = camera eases in behind the scroll position instead
      // of tracking it instantly. Combined with the longer pin range above,
      // the dolly feels markedly slower.
      scrub: 1.8,
      onUpdate: (self) => {
        const p = self.progress;
        scrollState.heroProgress = p;

        // Camera dolly: map [dollyStart, dollyEnd] → [0, 1].
        const dollySpan = Math.max(1e-6, dollyEnd - dollyStart);
        cameraControl.dollyT = THREE.MathUtils.clamp(
          (p - dollyStart) / dollySpan,
          0,
          1,
        );

        onProgress?.(p);
      },
    });

    // Refresh once so start/end are computed after Lenis has settled.
    ScrollTrigger.refresh();

    return () => {
      trigger.kill();
    };
  }, [heroRef, dollyStart, dollyEnd, onProgress]);
}
