'use client';

import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let lenis: Lenis | null = null;
let initialized = false;

export function initLenis(): Lenis {
  if (typeof window === 'undefined') {
    throw new Error('initLenis() must be called on the client');
  }
  if (lenis) return lenis;

  gsap.registerPlugin(ScrollTrigger);

  lenis = new Lenis({
    // Longer duration → smoother, more "gliding" wheel response. Paired with
    // a deeper scrub on the ScrollTrigger so the camera dolly eases along
    // with the scroll rather than tracking it 1:1.
    duration: 1.8,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 0.85,
  });

  // Drive Lenis from GSAP's ticker so scroll, ScrollTrigger, and useFrame
  // all share a single clock.
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis!.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  initialized = true;
  return lenis;
}

export function getLenis(): Lenis | null {
  return lenis;
}

export function isLenisInitialized(): boolean {
  return initialized;
}
