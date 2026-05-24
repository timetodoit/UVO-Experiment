'use client';

import { useEffect, useRef, useState } from 'react';

const MAX_FUEL = 30;
const TANK_W = 280;
const TANK_H = 480;
const TANK_RADIUS = 28;
const INNER_PAD = 14;
const SURFACE_POINTS = 56;

const TENSION = 0.025;
const DAMPING = 0.025;
const SPREAD = 0.25;
const PASSES = 6;

const SPLASH_GAIN = 0.012;
const SPLASH_MAX = 8;
const SPLASH_RADIUS = 5;

export function FuelSlider() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fuel, setFuel] = useState(12);
  const fuelRef = useRef(fuel);
  fuelRef.current = fuel;

  const yRef = useRef<Float32Array>(new Float32Array(SURFACE_POINTS));
  const vRef = useRef<Float32Array>(new Float32Array(SURFACE_POINTS));
  const lDeltaRef = useRef<Float32Array>(new Float32Array(SURFACE_POINTS));
  const rDeltaRef = useRef<Float32Array>(new Float32Array(SURFACE_POINTS));
  const lastRestNormRef = useRef(fuel / MAX_FUEL);

  const draggingRef = useRef(false);
  const lastPointerYRef = useRef(0);
  const lastPointerTRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = TANK_W * dpr;
    canvas.height = TANK_H * dpr;
    ctx.scale(dpr, dpr);

    const innerLeft = INNER_PAD;
    const innerRight = TANK_W - INNER_PAD;
    const innerTop = INNER_PAD;
    const innerBottom = TANK_H - INNER_PAD;
    const innerW = innerRight - innerLeft;
    const innerH = innerBottom - innerTop;

    const restYFromNorm = (n: number) =>
      innerBottom - innerH * Math.max(0, Math.min(1, n));

    let raf = 0;
    let lastT = performance.now();

    const fuelFromPointer = (clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const localY = clientY - rect.top;
      const norm = 1 - (localY - innerTop) / innerH;
      return Math.max(0, Math.min(1, norm)) * MAX_FUEL;
    };

    const splash = (centerX: number, impulse: number) => {
      const colF = ((centerX - innerLeft) / innerW) * (SURFACE_POINTS - 1);
      const v = vRef.current;
      const c = Math.round(colF);
      for (let i = c - SPLASH_RADIUS; i <= c + SPLASH_RADIUS; i++) {
        if (i < 0 || i >= SURFACE_POINTS) continue;
        const d = (i - colF) / SPLASH_RADIUS;
        const w = Math.exp(-d * d * 3);
        v[i] += impulse * w;
      }
    };

    function step() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // Carry rest-level changes: keep the surface physically in place
      // so a moving rest level produces a natural lag/overshoot.
      const targetRest = fuelRef.current / MAX_FUEL;
      const prevRest = lastRestNormRef.current;
      if (targetRest !== prevRest) {
        const dRestPx = -innerH * (targetRest - prevRest);
        const y = yRef.current;
        for (let i = 0; i < SURFACE_POINTS; i++) y[i] -= dRestPx;
        lastRestNormRef.current = targetRest;
      }

      // Substep at ~120Hz for stability across frame rates
      const SUBSTEP = 1 / 120;
      let acc = dt;
      while (acc > 0) {
        const h = Math.min(SUBSTEP, acc);
        acc -= h;
        const scale = h * 60;

        const y = yRef.current;
        const v = vRef.current;
        const lDelta = lDeltaRef.current;
        const rDelta = rDeltaRef.current;

        for (let i = 0; i < SURFACE_POINTS; i++) {
          const force = TENSION * y[i] + DAMPING * v[i];
          v[i] -= force * scale;
          y[i] += v[i] * scale;
        }

        for (let pass = 0; pass < PASSES; pass++) {
          for (let i = 0; i < SURFACE_POINTS; i++) {
            if (i > 0) {
              lDelta[i] = SPREAD * (y[i] - y[i - 1]);
              v[i - 1] += lDelta[i] * scale;
            }
            if (i < SURFACE_POINTS - 1) {
              rDelta[i] = SPREAD * (y[i] - y[i + 1]);
              v[i + 1] += rDelta[i] * scale;
            }
          }
          for (let i = 0; i < SURFACE_POINTS; i++) {
            if (i > 0) y[i - 1] += lDelta[i] * scale;
            if (i < SURFACE_POINTS - 1) y[i + 1] += rDelta[i] * scale;
          }
        }
      }

      draw(ctx!);
      raf = requestAnimationFrame(step);
    }

    function draw(ctx: CanvasRenderingContext2D) {
      ctx.clearRect(0, 0, TANK_W, TANK_H);

      ctx.save();
      roundedRectPath(ctx, 0.5, 0.5, TANK_W - 1, TANK_H - 1, TANK_RADIUS);
      ctx.clip();

      const bg = ctx.createLinearGradient(0, 0, 0, TANK_H);
      bg.addColorStop(0, '#0e2230');
      bg.addColorStop(1, '#0a1820');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, TANK_W, TANK_H);

      const restNorm = fuelRef.current / MAX_FUEL;
      const restY = restYFromNorm(restNorm);
      const y = yRef.current;

      const surfaceAt = (i: number) => restY + y[i];
      const xAt = (i: number) =>
        innerLeft + (i / (SURFACE_POINTS - 1)) * innerW;

      // Liquid body
      ctx.beginPath();
      ctx.moveTo(innerLeft, innerBottom);
      ctx.lineTo(xAt(0), surfaceAt(0));
      for (let i = 1; i < SURFACE_POINTS; i++) {
        const xPrev = xAt(i - 1);
        const yPrev = surfaceAt(i - 1);
        const xCur = xAt(i);
        const yCur = surfaceAt(i);
        const mx = (xPrev + xCur) / 2;
        const my = (yPrev + yCur) / 2;
        ctx.quadraticCurveTo(xPrev, yPrev, mx, my);
      }
      ctx.lineTo(xAt(SURFACE_POINTS - 1), surfaceAt(SURFACE_POINTS - 1));
      ctx.lineTo(innerRight, innerBottom);
      ctx.closePath();

      const liquid = ctx.createLinearGradient(0, restY - 30, 0, innerBottom);
      liquid.addColorStop(0, '#6fd6ff');
      liquid.addColorStop(1, '#1772b0');
      ctx.fillStyle = liquid;
      ctx.fill();

      // Subtle inner shadow at top of liquid
      const shade = ctx.createLinearGradient(0, restY - 10, 0, restY + 40);
      shade.addColorStop(0, 'rgba(255,255,255,0.18)');
      shade.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shade;
      ctx.fill();

      // Surface highlight stroke
      ctx.beginPath();
      ctx.moveTo(xAt(0), surfaceAt(0));
      for (let i = 1; i < SURFACE_POINTS; i++) {
        const xPrev = xAt(i - 1);
        const yPrev = surfaceAt(i - 1);
        const xCur = xAt(i);
        const yCur = surfaceAt(i);
        const mx = (xPrev + xCur) / 2;
        const my = (yPrev + yCur) / 2;
        ctx.quadraticCurveTo(xPrev, yPrev, mx, my);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Outer rim
      roundedRectPath(ctx, 1, 1, TANK_W - 2, TANK_H - 2, TANK_RADIUS);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    raf = requestAnimationFrame(step);

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      lastPointerYRef.current = e.clientY;
      lastPointerTRef.current = performance.now();
      setFuel(fuelFromPointer(e.clientY));
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastPointerTRef.current) / 1000);
      const dy = e.clientY - lastPointerYRef.current;
      const vy = dy / dt;

      setFuel(fuelFromPointer(e.clientY));

      const rect = canvas.getBoundingClientRect();
      const localX = Math.max(
        innerLeft,
        Math.min(innerRight, e.clientX - rect.left),
      );
      // Pointer moving up (vy < 0) raises rest → splash should push surface
      // down to amplify lag, so flip sign.
      const impulse =
        -Math.sign(vy) * Math.min(SPLASH_MAX, Math.abs(vy) * SPLASH_GAIN);
      if (Math.abs(impulse) > 0.05) splash(localX, impulse);

      lastPointerYRef.current = e.clientY;
      lastPointerTRef.current = now;
    };

    const onPointerUp = (e: PointerEvent) => {
      draggingRef.current = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      <div className="text-xs uppercase tracking-[0.25em] text-white/50">
        Fuel
      </div>
      <div className="text-5xl font-light tabular-nums">
        {fuel.toFixed(1)}
        <span className="text-2xl text-white/40"> / {MAX_FUEL} L</span>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: TANK_W,
          height: TANK_H,
          touchAction: 'none',
          cursor: 'grab',
          borderRadius: TANK_RADIUS,
        }}
      />
      <div className="text-xs text-white/40">Drag inside the tank</div>
    </div>
  );
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
