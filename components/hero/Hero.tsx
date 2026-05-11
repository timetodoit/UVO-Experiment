'use client';

import { useCallback, useRef } from 'react';
import { SceneCanvas } from './SceneCanvas';
import { ControlsPanel } from './ControlsPanel';
import { useScrollProgress } from './utils/useScrollProgress';

/**
 * Hero layout: fullscreen R3F Canvas behind a DOM overlay (nav, headline, CTA).
 * Canvas is pointer-events:none-by-default via absolute positioning; the
 * overlay re-enables pointer events on its interactive children only.
 *
 * Scroll progress (0..1 across the hero's pin range) drives:
 *   - camera dolly                      (handled inside useScrollProgress)
 *   - overlay fade 0.2 → 0.5            (handled here, opacity on a ref div)
 *   - dither uProgress 0.3 → 1.0        (wired in step 7)
 */
export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const onProgress = useCallback((p: number) => {
    const el = overlayRef.current;
    if (!el) return;
    // Overlay fades from 1 → 0 across [0.25, 0.75] of the (now longer) scroll
    // range. Kept gentler than the dolly so the copy reads for a beat before
    // it starts dissolving.
    const t = Math.min(1, Math.max(0, (p - 0.25) / (0.75 - 0.25)));
    el.style.opacity = String(1 - t);
  }, []);

  useScrollProgress(heroRef, { onProgress });

  return (
    <section
      ref={heroRef}
      className="relative h-screen w-full overflow-hidden bg-[#dbe8f0]"
    >
      {/* dev-only leva panel; renders null in prod */}
      <ControlsPanel />

      {/* 3D layer */}
      <SceneCanvas />

      {/* DOM overlay */}
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 z-10 transition-none"
        style={{ opacity: 1 }}
      >
        <TopNav />
        <HeroCopy />
        <BottomParagraph />
      </div>
    </section>
  );
}

function TopNav() {
  return (
    <nav className="pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between px-10 py-7">
      <div className="flex items-center gap-2">
        <LogoMark />
        <span className="text-[15px] font-medium tracking-tight">Hydraoo</span>
      </div>

      <ul className="hidden items-center gap-9 text-[13px] text-white/80 md:flex">
        <li>
          <a href="#" className="transition hover:text-white">
            Platform
          </a>
        </li>
        <li>
          <a href="#" className="transition hover:text-white">
            Solutions
          </a>
        </li>
        <li>
          <a href="#" className="transition hover:text-white">
            Resources
          </a>
        </li>
        <li>
          <a href="#" className="transition hover:text-white">
            Company
          </a>
        </li>
      </ul>

      <a
        href="#"
        className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-[13px] backdrop-blur transition hover:bg-white/10"
      >
        Get a Demo
      </a>
    </nav>
  );
}

function HeroCopy() {
  return (
    <div className="absolute left-10 top-[22%] max-w-2xl md:top-[24%]">
      <div className="pointer-events-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] text-white/85 backdrop-blur">
        <span className="text-white">✦</span>
        <span>Powering Next-Gen Fleet Management</span>
      </div>

      <h1 className="text-[76px] font-medium leading-[0.95] tracking-[-0.02em] md:text-[92px]">
        Built for Oceans.
        <br />
        <span className="italic font-light text-white/95">Trusted by fleets.</span>
      </h1>

      <div className="pointer-events-auto mt-10 flex items-center gap-5">
        <a
          href="#"
          className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[13px] font-medium text-black transition hover:bg-white/90"
        >
          Get a Demo
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 6h8m0 0L6.5 2.5M10 6l-3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>

        <div className="flex items-center gap-3">
          <AvatarStack />
          <span className="text-[12px] leading-tight text-white/75">
            Trusted by 15+
            <br />
            industry leaders
          </span>
        </div>
      </div>
    </div>
  );
}

function BottomParagraph() {
  return (
    <p className="absolute bottom-10 left-10 max-w-sm text-[13px] leading-relaxed text-white/70">
      Delivering dependable maritime intelligence — unifying vessel telemetry,
      weather-aware routing, and fleet-wide analytics into one resilient platform
      purpose-built for the open ocean.
    </p>
  );
}

function LogoMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="8" stroke="white" strokeWidth="1.2" fill="none" />
      <path
        d="M3 11c2-2 4-2 6 0s4 2 6 0"
        stroke="white"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AvatarStack() {
  const seeds = ['#b4a48c', '#8fa6a0', '#c6b4a4', '#9aa0a8'];
  return (
    <div className="flex -space-x-2">
      {seeds.map((c, i) => (
        <span
          key={i}
          className="inline-block h-7 w-7 rounded-full border border-black/40"
          style={{ background: c }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
