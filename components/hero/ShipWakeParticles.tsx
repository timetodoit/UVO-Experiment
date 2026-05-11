'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { shipState } from '@/lib/ship';
import { sampleOceanHeightAtWorld } from './utils/gerstner';
import { controls } from '@/lib/controls';

/**
 * Foam-spray wake particles rendered behind the ship.
 *
 * Runs as a fixed-capacity pool of GL_POINTS with a soft circular alpha
 * mask and a fade-in/fade-out over particle lifetime. Each particle:
 *   - Spawns ~3.4u aft of the ship's origin, with lateral jitter across
 *     the stern width, at the current wave height there.
 *   - Drifts slowly backward along -bowDir with small random nudges so
 *     the trail doesn't look like parallel bullets.
 *   - Is re-snapped to the wave surface each frame so it rides the water
 *     instead of flying through it.
 *   - Fades in quickly, then fades out over the back 50% of its life.
 *
 * Uses a circular buffer over the particle array (write-through without
 * a sort), which is fine because lifetime is fixed and spawn rate is
 * uniform — the oldest slot is always the one up for reuse.
 *
 * Cost: ~MAX_PARTICLES CPU updates per frame, each doing 2 Gerstner
 * evaluations (one for wave height). At MAX=256 and 6 waves, that's
 * ~3k trig ops per frame — negligible.
 */

const MAX_PARTICLES = 240;
const PARTICLE_LIFE = 2.6; // seconds
const SPAWN_PER_SECOND = 90;
const STERN_AFT_OFFSET = 3.4; // world units aft of ship origin
const STERN_WIDTH = 1.6; // lateral spread at spawn

export function ShipWakeParticles() {
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const spawnIndexRef = useRef(0);
  const spawnCarryRef = useRef(0);
  const timeRef = useRef(0);

  // Pre-allocated typed-array buffers — never re-allocated, just mutated
  // in-place and flagged `needsUpdate` each frame.
  const { positions, ages, sizes, velocities } = useMemo(() => {
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const ages = new Float32Array(MAX_PARTICLES);
    const sizes = new Float32Array(MAX_PARTICLES);
    const velocities = new Float32Array(MAX_PARTICLES * 2);
    // Start every particle dead (age > lifetime) so nothing renders
    // until the first real spawn.
    for (let i = 0; i < MAX_PARTICLES; i++) ages[i] = PARTICLE_LIFE + 1;
    return { positions, ages, sizes, velocities };
  }, []);

  const uniforms = useMemo(
    () => ({
      uLifetime: { value: PARTICLE_LIFE },
      uFoamColor: { value: new THREE.Color(controls.ocean.foamColor) },
    }),
    [],
  );

  useFrame((_, dt) => {
    const geom = geomRef.current;
    if (!geom) return;
    timeRef.current += dt;

    // Live foam color from the Leva picker.
    (uniforms.uFoamColor.value as THREE.Color).set(controls.ocean.foamColor);

    // Spawn — accumulate fractional counts between frames so the spawn
    // rate is frame-rate independent.
    spawnCarryRef.current += SPAWN_PER_SECOND * dt;
    const nSpawn = Math.floor(spawnCarryRef.current);
    spawnCarryRef.current -= nSpawn;

    const sx = shipState.x;
    const sz = shipState.z;
    const bx = shipState.bowDirX;
    const bz = shipState.bowDirZ;
    // Lateral basis perpendicular to the bow direction (port side).
    const px = -bz;
    const pz = bx;

    for (let k = 0; k < nSpawn; k++) {
      const i = spawnIndexRef.current;
      spawnIndexRef.current = (i + 1) % MAX_PARTICLES;

      const jitter = (Math.random() - 0.5) * STERN_WIDTH;
      const aftJitter = Math.random() * 0.6;
      const spawnX = sx - bx * (STERN_AFT_OFFSET + aftJitter) + px * jitter;
      const spawnZ = sz - bz * (STERN_AFT_OFFSET + aftJitter) + pz * jitter;
      const spawnY =
        sampleOceanHeightAtWorld(spawnX, spawnZ, timeRef.current) + 0.06;

      positions[i * 3 + 0] = spawnX;
      positions[i * 3 + 1] = spawnY;
      positions[i * 3 + 2] = spawnZ;
      ages[i] = 0;
      sizes[i] = 0.25 + Math.random() * 0.35;
      // Slow backward drift + small random nudge so the trail turbulates.
      velocities[i * 2 + 0] = -bx * 0.25 + (Math.random() - 0.5) * 0.45;
      velocities[i * 2 + 1] = -bz * 0.25 + (Math.random() - 0.5) * 0.45;
    }

    // Advance all live particles.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (ages[i] >= PARTICLE_LIFE) continue;
      ages[i] += dt;
      const newX = positions[i * 3 + 0] + velocities[i * 2 + 0] * dt;
      const newZ = positions[i * 3 + 2] + velocities[i * 2 + 1] * dt;
      positions[i * 3 + 0] = newX;
      positions[i * 3 + 2] = newZ;
      // Snap to water surface each frame — particles ride the waves.
      positions[i * 3 + 1] =
        sampleOceanHeightAtWorld(newX, newZ, timeRef.current) + 0.06;
    }

    (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.age as THREE.BufferAttribute).needsUpdate = true;
    (geom.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points frustumCulled={false} renderOrder={5}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute attach="attributes-age" args={[ages, 1]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={WAKE_VERT}
        fragmentShader={WAKE_FRAG}
      />
    </points>
  );
}

const WAKE_VERT = /* glsl */ `
  attribute float age;
  attribute float size;
  uniform float uLifetime;
  varying float vAlpha;

  void main() {
    float t = clamp(age / uLifetime, 0.0, 1.0);
    // Fade in fast (first 8%), fade out slow (last 50%).
    float fadeIn  = smoothstep(0.0, 0.08, t);
    float fadeOut = 1.0 - smoothstep(0.5, 1.0, t);
    vAlpha = fadeIn * fadeOut;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    // Grow slightly as particle ages (spray dispersing).
    float grow = mix(0.55, 1.75, t);
    // Perspective-aware size: points get smaller with distance.
    gl_PointSize = size * grow * 220.0 / max(-mvPos.z, 0.01);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const WAKE_FRAG = /* glsl */ `
  uniform vec3 uFoamColor;
  varying float vAlpha;

  void main() {
    // Soft circular falloff with a slightly brighter core.
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float disc = 1.0 - smoothstep(0.28, 0.5, d);
    if (disc < 0.01) discard;
    vec3 col = mix(uFoamColor * 0.85, uFoamColor * 1.05, disc);
    gl_FragColor = vec4(col, disc * vAlpha * 0.88);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
