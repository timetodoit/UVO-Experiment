'use client';

import { useEffect } from 'react';
import { parallaxState } from '@/lib/parallax';

/**
 * Attaches a window-level pointermove listener that writes normalized
 * [-1, 1] coordinates into the shared parallax state. Smoothing happens
 * downstream in <CameraRig> — this hook is just the input source.
 */
export function useMouseParallax() {
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      parallaxState.targetX = nx;
      // Invert Y so "mouse up" → positive (matches camera conventions).
      parallaxState.targetY = -ny;
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
}
