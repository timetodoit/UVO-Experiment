'use client';

import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { button, useControls } from 'leva';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Ocean } from './Ocean';
import { ShipModel } from './ShipModel';
import { ShipWakeParticles } from './ShipWakeParticles';
import { CameraRig } from './CameraRig';
import { controls } from '@/lib/controls';
import { getSunColor, getSunDir } from './utils/sun';
import { OCEAN_WAVES, OCEAN_WAVE_COUNT } from './utils/gerstner';
import skyVert from './shaders/sky.vert.glsl';
import skyFrag from './shaders/sky.frag.glsl';

// Module-level scratch — reused by every frame of every component that
// needs a fresh sun direction/color, so we don't allocate Vectors/Colors
// every tick.
const sunDirScratch = new THREE.Vector3();
const sunColorScratch = new THREE.Color();

/**
 * Scene root.
 *
 * Lighting: pure analytical rig (no IBL / HDR environment). A warm key sun
 * from the upper-left matches the ocean shader's uSunDir; a cool fill on the
 * opposite side and a back-rim provide silhouette separation. An ambient
 * floor plus a sky/ground hemisphere keep shadowed areas off pitch-black.
 * Every intensity — plus the canvas tone-mapping exposure — is read each
 * frame from `controls.lights`, so leva sliders tweak them live without
 * triggering rerenders.
 *
 * The ocean uses a custom ShaderMaterial so three.js built-in fog (set via
 * <fog />) doesn't apply to it — the ocean shader handles its own distance
 * fog with matching uniforms. The <fog> tag still tints the ship meshes,
 * which use standard PBR materials from the GLB.
 *
 * CameraRig is mounted first so its useFrame runs before Ship's, letting
 * Ship read post-smoothing parallax values.
 */
export function Scene() {
  return (
    <>
      {/* Solid fallback color in case the SkyDome fails to render; also
          the clear color behind the scene. Matches the horizon band so the
          seam is invisible. */}
      <color attach="background" args={['#dbe8f0']} />
      {/* Linear fog fades distant objects into the horizon band color so
          the ocean dissolves into the sky without a visible line. */}
      <fog attach="fog" args={['#dbe8f0', 14, 70]} />

      <SkyDome />

      <ExposureSync />
      <Ambient />
      <HemiFill />
      <KeyLight />
      <FillLight />
      <RimLight />

      <CameraRig />
      <FreeCameraToggle />
      <Ocean />
      <ShadowCatcher />
      <ShipModel />
      <ShipWakeParticles />
    </>
  );
}

/* ─── Free-camera toggle ───────────────────────────────────────────────── */

/**
 * Watches `controls.camera.freeCamera` and mounts <OrbitControls /> while
 * the flag is on. Polls the mutable flag each frame rather than taking a
 * reactive Leva value because the flag is flipped via the Leva onChange
 * shared-state pattern (no rerender). The poll is one integer compare per
 * frame — not worth optimizing further.
 *
 * Also exposes a Leva "Camera / free look" group with the on/off toggle
 * and a "save current as default" button. The button reads the live
 * camera position (via useThree) and writes it into `controls.camera
 * .baseX/Y/Z` — so once the user frames a shot they like, one click
 * turns it into the scene's default camera for next reload. We put this
 * UI inside Scene.tsx (not ControlsPanel.tsx) specifically because the
 * "save" action needs Canvas context to reach the camera.
 */
function FreeCameraToggle() {
  // Gate the whole Leva group on dev mode so useControls doesn't
  // auto-mount the panel in production. The <OrbitControls /> still
  // hangs off the `controls.camera.freeCamera` flag so it works even
  // without the Leva UI (e.g. if the flag is flipped programmatically).
  const dev = process.env.NODE_ENV === 'development';
  const [free, setFree] = useState(controls.camera.freeCamera);
  useFrame(() => {
    if (controls.camera.freeCamera !== free) setFree(controls.camera.freeCamera);
  });
  return (
    <>
      {dev && <FreeCameraLevaPanel />}
      {free && (
        <OrbitControls
          enableDamping
          makeDefault
          target={[0, 0, 0]}
          minDistance={3}
          maxDistance={80}
        />
      )}
    </>
  );
}

/**
 * Dev-only Leva group: free-camera toggle + save-current-as-default button.
 * Mounted only in development so the leva bundle never renders in prod.
 */
function FreeCameraLevaPanel() {
  const { camera } = useThree();
  useControls('Camera / free look', {
    freeCamera: {
      label: 'free camera',
      value: controls.camera.freeCamera,
      onChange: (v: boolean) => {
        controls.camera.freeCamera = v;
      },
    },
    saveAsDefault: button(() => {
      controls.camera.baseX = camera.position.x;
      controls.camera.baseY = camera.position.y;
      controls.camera.baseZ = camera.position.z;
      // Echo to the console so the user can copy these numbers into
      // `lib/controls.ts` if they want them persisted across HMR resets.
      // eslint-disable-next-line no-console
      console.info(
        `[camera] saved default: baseX=${camera.position.x.toFixed(
          2,
        )}, baseY=${camera.position.y.toFixed(
          2,
        )}, baseZ=${camera.position.z.toFixed(2)}`,
      );
    }),
  });
  return null;
}

/* ─── Sky ──────────────────────────────────────────────────────────────── */

function SkyDome() {
  // Huge inverted sphere centered on the origin. Camera moves during dolly
  // but stays within a ~20-unit box — well inside this 180-unit dome — so
  // parallax against the sky is negligible (as it should be, it's "far").
  //
  // depthWrite=false + depthTest=false + renderOrder=-1000 means the dome
  // is drawn first and never occludes anything, acting as a background
  // only. BackSide so we see the inside of the sphere.
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      // Horizon: pale cool haze, matches <fog> color so the ocean fades
      // into the sky without a seam.
      uHorizon: { value: new THREE.Color('#dbe8f0') },
      // Zenith: rich cyan-blue — real atmosphere darkens with altitude as
      // Rayleigh scattering thins out in the line of sight.
      uZenith: { value: new THREE.Color('#1f6fad') },
      uHazeTint: { value: new THREE.Color('#eef5f9') },
      uExponent: { value: 1.5 },
      uHazeStrength: { value: 0.4 },
      // Sun position + tint come from the shared controls.sun. Updated
      // in useFrame below so the same leva slider moves the sun disc in
      // the sky AND the key light in the scene.
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff6e6') },
      // Cloud layer — shared logic with ocean.frag.glsl so the shadow
      // cast on the water lines up with the cloud overhead.
      uCloudCoverage: { value: controls.clouds.coverage },
      uCloudScale: { value: controls.clouds.scale },
      uCloudSpeed: { value: controls.clouds.speed },
      uCloudOpacity: { value: controls.clouds.opacity },
      uGodRays: { value: controls.clouds.godRays },
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((_, dt) => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uTime.value += dt;
    // Sun + clouds live-editable.
    getSunDir(m.uniforms.uSunDir.value as THREE.Vector3);
    getSunColor(m.uniforms.uSunColor.value as THREE.Color);
    m.uniforms.uCloudCoverage.value = controls.clouds.coverage;
    m.uniforms.uCloudScale.value = controls.clouds.scale;
    m.uniforms.uCloudSpeed.value = controls.clouds.speed;
    m.uniforms.uCloudOpacity.value = controls.clouds.opacity;
    m.uniforms.uGodRays.value = controls.clouds.godRays;
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[180, 32, 16]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={skyVert}
        fragmentShader={skyFrag}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
      />
    </mesh>
  );
}

/* ─── Tone mapping ─────────────────────────────────────────────────────── */

function ExposureSync() {
  // three's tone-mapping exposure is a renderer property, not a scene node.
  // Pull gl from context and write it each frame so the leva slider is live.
  const { gl } = useThree();
  useFrame(() => {
    gl.toneMappingExposure = controls.lights.exposure;
  });
  return null;
}

/* ─── Lights ───────────────────────────────────────────────────────────── */

function Ambient() {
  const ref = useRef<THREE.AmbientLight>(null);
  useFrame(() => {
    if (ref.current) ref.current.intensity = controls.lights.ambientIntensity;
  });
  // Cool daylight ambient — slightly blue, not warm dawn anymore.
  return <ambientLight ref={ref} color="#c2d4ee" intensity={0.25} />;
}

function HemiFill() {
  const ref = useRef<THREE.HemisphereLight>(null);
  useFrame(() => {
    if (ref.current) ref.current.intensity = controls.lights.hemiIntensity;
  });
  // Bright daytime sky / deep navy ground — the hemisphere gradient reads
  // as an open sky dome on the upper hull, deep water on the underside.
  return <hemisphereLight ref={ref} args={['#dbe8f0', '#1a2838', 0.6]} />;
}

function KeyLight() {
  // The one and only directional caster in the scene. Position, color,
  // and intensity are derived each frame from `controls.sun` — so the
  // azimuth/elevation/warmth/intensity sliders move this light, the
  // ocean's specular highlight, and the sky's sun disc in lockstep.
  //
  // All shadow parameters live on `controls.lights` and drive PCFSoft
  // sampling on the single shadow map (2048²).
  const ref = useRef<THREE.DirectionalLight>(null);
  const SUN_DISTANCE = 12;

  useFrame(() => {
    const l = ref.current;
    if (!l) return;
    // Derive light world position from sun direction * distance.
    getSunDir(sunDirScratch);
    l.position.copy(sunDirScratch).multiplyScalar(SUN_DISTANCE);
    // The DirectionalLight keeps its default target at (0, 0, 0), so the
    // light vector (position → target) naturally points along −sunDir;
    // lighting equations use the light-to-surface direction, which is
    // exactly what we want for a sun at that azimuth/elevation.
    getSunColor(sunColorScratch);
    l.color.copy(sunColorScratch);
    l.intensity = controls.sun.intensity;
    l.shadow.radius = controls.lights.shadowRadius;
    l.shadow.blurSamples = controls.lights.shadowBlurSamples;
    l.shadow.bias = controls.lights.shadowBias;
    l.shadow.normalBias = controls.lights.shadowNormalBias;
  });
  return (
    <directionalLight
      ref={ref}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-near={0.5}
      shadow-camera-far={30}
      shadow-camera-left={-10}
      shadow-camera-right={10}
      shadow-camera-top={10}
      shadow-camera-bottom={-10}
    />
  );
}

function FillLight() {
  // Cool sky-blue bounce from the shadow side — counters the warm key.
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    if (ref.current) ref.current.intensity = controls.lights.fillIntensity;
  });
  return (
    <directionalLight
      ref={ref}
      position={[6, 3, -2]}
      intensity={0.9}
      color="#c4dcef"
    />
  );
}

function RimLight() {
  // Subtle warm back-rim for silhouette separation against the sky. The
  // tint is much cooler than the dawn rim — midday rim light is near-
  // white with a hint of warmth, not golden.
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    if (ref.current) ref.current.intensity = controls.lights.rimIntensity;
  });
  return (
    <directionalLight
      ref={ref}
      position={[3, 5, -10]}
      intensity={1.6}
      color="#fff1dc"
    />
  );
}

/* ─── Shadow catcher ───────────────────────────────────────────────────── */

function ShadowCatcher() {
  // Receives the ship's shadow. Ocean uses a custom ShaderMaterial so it
  // can't sample the shadow map directly — a dedicated ShadowMaterial plane
  // at the waterline is the pragmatic alternative.
  //
  // Previously this was a flat plane at y=0.02 — but wave crests above that
  // y punched through the shadow from the front, making the silhouette
  // look like it was clipped off. Fix: displace the catcher with the same
  // 6-wave Gerstner math as `ocean.vert.glsl` so the shadow lands on the
  // actual water surface under the ship, wave troughs and crests included.
  //
  // The displacement is injected into THREE.ShadowMaterial's vertex shader
  // via onBeforeCompile — overriding `#include <begin_vertex>` so the
  // displaced `transformed` propagates through `worldpos_vertex` into the
  // shadow sampling in `shadowmap_vertex`.
  const mat = useRef<THREE.ShadowMaterial>(null);

  // Uniforms live on a ref so onBeforeCompile and useFrame share one set.
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
      uWaveFalloffNear: { value: controls.ocean.waveFalloffNear },
      uWaveFalloffFar: { value: controls.ocean.waveFalloffFar },
    };
  }, []);

  const onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uDir = uniforms.uDir;
    shader.uniforms.uWavelength = uniforms.uWavelength;
    shader.uniforms.uSteepness = uniforms.uSteepness;
    shader.uniforms.uSpeed = uniforms.uSpeed;
    shader.uniforms.uWaveFalloffNear = uniforms.uWaveFalloffNear;
    shader.uniforms.uWaveFalloffFar = uniforms.uWaveFalloffFar;

    // Declare our uniforms, then replace begin_vertex with Gerstner.
    // Math MUST match components/hero/shaders/ocean.vert.glsl exactly,
    // or the shadow drifts relative to the water it's supposed to sit on.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec2  uDir[6];
        uniform float uWavelength[6];
        uniform float uSteepness[6];
        uniform float uSpeed[6];
        uniform float uWaveFalloffNear;
        uniform float uWaveFalloffFar;`,
      )
      .replace(
        '#include <begin_vertex>',
        `
        vec4 _scWorldPos = modelMatrix * vec4(position, 1.0);
        float _scX0 = _scWorldPos.x;
        float _scZ0 = _scWorldPos.z;
        vec3 _scDisp = vec3(0.0);
        const float _SC_TAU = 6.28318530718;
        const float _SC_Q = 0.5;
        for (int i = 0; i < 6; i++) {
          vec2  D      = uDir[i];
          float lambda = uWavelength[i];
          float S      = uSteepness[i];
          float speed  = uSpeed[i];
          float omega  = _SC_TAU / lambda;
          float A      = S * lambda / _SC_TAU;
          float phi    = speed * omega;
          float k      = omega * dot(D, vec2(_scX0, _scZ0)) + phi * uTime;
          _scDisp.x += _SC_Q * A * D.x * cos(k);
          _scDisp.z += _SC_Q * A * D.y * cos(k);
          _scDisp.y += A * sin(k);
        }
        // Match the ocean's distance-based wave falloff so the shadow
        // receiver stays co-planar with the water at the horizon.
        float _scDist = length(vec2(_scX0, _scZ0));
        float _scFalloff = 1.0 - smoothstep(uWaveFalloffNear, uWaveFalloffFar, _scDist);
        _scDisp *= _scFalloff;
        // Convert world-space displacement to local-space so the standard
        // chunks downstream (project_vertex, worldpos_vertex) see a
        // displaced 'transformed' and compute the correct world position.
        vec3 _scLocalDisp = (inverse(modelMatrix) * vec4(_scDisp, 0.0)).xyz;
        vec3 transformed = position + _scLocalDisp;
        `,
      );
  };

  useFrame((_, dt) => {
    if (mat.current) mat.current.opacity = controls.lights.shadowOpacity;
    uniforms.uTime.value += dt;
    // Pull any live leva edits to steepness/speed off the shared array.
    const steepArr = uniforms.uSteepness.value;
    const speedArr = uniforms.uSpeed.value;
    for (let i = 0; i < OCEAN_WAVE_COUNT; i++) {
      steepArr[i] = OCEAN_WAVES[i].steepness;
      speedArr[i] = OCEAN_WAVES[i].speed;
    }
    uniforms.uWaveFalloffNear.value = controls.ocean.waveFalloffNear;
    uniforms.uWaveFalloffFar.value = controls.ocean.waveFalloffFar;
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.0, 0]}
      receiveShadow
      frustumCulled={false}
    >
      {/* 80u plane is enough margin for the key light's ±10u shadow cam at
          its shallowest angle. Subdivisions match the ocean's 0.3-unit cell
          so fine waves (λ=2.3) resolve without aliasing the shadow edge. */}
      <planeGeometry args={[80, 80, 256, 256]} />
      <shadowMaterial
        ref={mat}
        transparent
        opacity={0.45}
        onBeforeCompile={onBeforeCompile}
      />
    </mesh>
  );
}
