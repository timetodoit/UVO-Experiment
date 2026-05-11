'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Scene } from './Scene';
import { PostEffects } from './PostEffects';
import { useMouseParallax } from './utils/useMouseParallax';

/**
 * Thin wrapper around <Canvas /> so <Hero /> can stay presentational and the
 * R3F boundary lives in one file. DPR clamp, tone mapping, and color space
 * defaults come from the spec's perf section.
 *
 * Frameloop is flipped to `'demand'` once the hero scrolls out of view —
 * we don't need to burn GPU cycles animating an invisible canvas.
 *
 * Antialiasing is handled by the postprocessing pipeline (SMAA + MSAA on
 * the composer's framebuffer), not by the default framebuffer — so
 * `antialias: false` here. If the user disables the post pipeline
 * entirely via leva, they'll see aliased edges; the MSAA inside the
 * composer also skips that case, which is acceptable for a dev toggle.
 */
export function SceneCanvas() {
  // Window-level pointermove → writes normalized coords into shared parallax
  // state. Lives outside the Canvas tree because it listens on window, not
  // any R3F element.
  useMouseParallax();

  const wrapRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        frameloop={inView ? 'always' : 'demand'}
        // `soft` = PCFSoftShadowMap. Only the KeyLight casts, and only the
        // ship casts / the shadow-catcher receives, so the cost is bounded.
        shadows="soft"
        gl={{
          antialias: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.25,
          outputColorSpace: THREE.SRGBColorSpace,
          powerPreference: 'high-performance',
        }}
        camera={{ fov: 35, near: 0.1, far: 200, position: [-3.5, 4.8, 24.5] }}
        className="absolute inset-0"
      >
        <Scene />
        <PostEffects />
      </Canvas>
    </div>
  );
}
