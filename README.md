# Hydraoo Hero — 3D Supply Ship Prototype

Next.js + R3F hero: a procedural low-poly supply ship drifting on a Gerstner-wave ocean, mouse-driven heading changes, and a scroll-driven dithered reveal that transitions to the white page below.

## Quick start

```bash
npm install
npm run dev    # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## Stack

- Next.js 14 (App Router), TypeScript, React 18.3
- @react-three/fiber, @react-three/drei, three (custom ShaderMaterial for the water)
- @react-three/postprocessing + a custom `Effect` for the dither transition
- GSAP + ScrollTrigger, Lenis (smooth scroll, RAF driven by GSAP's ticker)
- Tailwind for the DOM overlay only
- leva for the dev tweak panel (gated on `NODE_ENV === 'development'`)

## File map

```
app/
  layout.tsx, page.tsx, globals.css
components/
  LenisProvider.tsx
  hero/
    Hero.tsx                   // 100vh section, DOM overlay, mounts SceneCanvas + ControlsPanel
    SceneCanvas.tsx            // <Canvas> + EffectComposer, frameloop suspension via IO
    Scene.tsx                  // R3F scene root: lights, fog, camera rig, ocean, ship
    CameraRig.tsx              // base pos + dolly + mouse parallax + idle float
    Ocean.tsx                  // 200×200 × 256² plane with custom ShaderMaterial
    Ship.tsx                   // procedural low-poly group; CPU-samples waves each frame
    DitherTransition.tsx       // custom postprocessing Effect (Bayer 4×4 reveal)
    ControlsPanel.tsx          // leva, dev-only
    shaders/
      ocean.vert.glsl
      ocean.frag.glsl
      dither.frag.glsl
    utils/
      gerstner.ts              // shared wave consts + CPU sampler (matches GLSL)
      useMouseParallax.ts      // window pointermove → shared refs
      useScrollProgress.ts     // ScrollTrigger → shared refs + camera dolly
sections/
  AfterHero.tsx                // white section below the hero
lib/
  lenis.ts                     // singleton + GSAP ticker wiring
  parallax.ts                  // mutable mouse state (no React state)
  scroll.ts                    // mutable scroll progress
  controls.ts                  // mutable leva-backed config
```

## Controls

### Mouse
The pointer drives three things via a shared smoothed signal (damping ~0.05/60fps):
- Camera offset: `x += mx * 0.4`, `y += my * 0.15`
- Ship yaw: `mx * 0.04 rad`, additionally lerped (slower, ~0.02/60fps)
- Ship path X: `mx * 0.3` — this is the “ship changes course depending on mouse” behavior

### Scroll
A single `ScrollTrigger` pinned to the hero (`start: 'top top'`, `end: '+=100%'`, `scrub: 0.8`) drives the full timeline:
- **0.0 → 0.4** — camera dollies in: `y: 4 → 1.5`, `z: 14 → 11`
- **0.2 → 0.5** — DOM overlay fades out (opacity only, never unmounted)
- **0.3 → 1.0** — dither `uProgress` ramps 0 → 1 via smoothstep. Below the Bayer threshold → white; above → scene color.

Once dither hits 1 the hero is effectively a white page; as the user continues scrolling the sticky hero unsticks and the `AfterHero` white section takes over seamlessly.

### Leva (dev only)

`npm run dev` shows a floating panel with:

| Folder | Controls |
| --- | --- |
| **Ocean** | per-wave steepness + speed (3 waves) |
| **Ship** | drift speed, `mouse → yaw`, `mouse → path X` |
| **Camera** | `mouse → X/Y` gains, base X/Y/Z, `dolly Y end`, `dolly Z end` |
| **Dither** | start / end of the smoothstep reveal window |

Values write directly into the shared `controls` object / `OCEAN_WAVES` array via leva `onChange` — no React state, no rerenders. Consumers read them each frame.

## Swapping the procedural ship for a real GLB

`<Ship>` accepts an optional `model?: THREE.Group` prop. Example:

```tsx
import { useGLTF } from '@react-three/drei';
import { Ship } from '@/components/hero/Ship';

function MyScene() {
  const { scene } = useGLTF('/models/supply-ship.glb');
  return <Ship model={scene} />;
}
```

When `model` is provided the procedural geometry is skipped and your group is rendered in its place. The bob/pitch/roll math still runs on the outer group, so your GLB should be oriented so that:
- **+X is the bow**
- **Y = 0 is the waterline**
- the model is centered on the origin in the XZ plane

Hull length / width constants (`HULL_LENGTH`, `HULL_WIDTH` in [components/hero/Ship.tsx](components/hero/Ship.tsx)) drive the bow/stern/port/starboard wave-sample offsets — tune them to match your model's bounding box if it's a different size.

## Performance notes

- DPR clamped to `[1, 1.5]` (`<Canvas dpr={[1, 1.5]}>`)
- Procedural ship ≈ ~300 tris total
- Ocean: single draw call, no reflection probe; custom fog in the fragment shader matches the scene's linear fog (near 10, far 60)
- Only one postprocess pass (dither); no bloom/DoF
- `useFrame` callbacks reuse pre-allocated `Vector3`/`Vector2` refs — no per-frame allocations
- `frameloop` on the Canvas flips to `'demand'` when the hero leaves the viewport (IntersectionObserver on the canvas wrapper)

### Known bundle cost

leva is currently statically imported from `ControlsPanel`. The component returns `null` in production, but the leva code still ships in the client bundle. If this matters for you, wrap it with `next/dynamic` + `ssr: false` and gate the dynamic import on `process.env.NODE_ENV`.

## Gerstner / CPU-GPU parity

The shared wave definition lives in [components/hero/utils/gerstner.ts](components/hero/utils/gerstner.ts). Both the GPU vertex shader ([components/hero/shaders/ocean.vert.glsl](components/hero/shaders/ocean.vert.glsl)) and the CPU ship sampler implement the same math:

```
A = steepness * λ / (2π)
Q = 0.5
w = 2π / λ,   φ = speed * w
k = w · (D · xz0) + φ · t
disp.x = Q · A · D.x · cos(k)
disp.z = Q · A · D.y · cos(k)
disp.y =       A      · sin(k)
```

The ship samples this field at bow, stern, port, starboard, and midship each frame, then:

- `position.y = midship`
- `rotation.z =  atan2(bowY - sternY, length)`    (pitch, +X forward)
- `rotation.x = -atan2(starY - portY, width)`     (roll)

If you change the shader math, mirror it in `gerstner.ts` or the ship will clip through the waves.
