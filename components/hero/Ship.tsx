'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sampleOceanHeightAtWorld } from './utils/gerstner';
import { parallaxState } from '@/lib/parallax';
import { controls } from '@/lib/controls';
import { shipState } from '@/lib/ship';

// Ship hull footprint. Kept as module constants so the CPU wave sampler can
// reuse them for bow/stern/port/starboard sample points.
const HULL_LENGTH = 6.2;
const HULL_WIDTH = 2.0;
const HULL_HEIGHT = 1.15;
const HALF_LEN = HULL_LENGTH / 2;
const HALF_WIDTH = HULL_WIDTH / 2;

// Waterline: bottom 30% red, top 70% white.
const WATERLINE_FROM_KEEL = HULL_HEIGHT * 0.3;
const RED_HEIGHT = WATERLINE_FROM_KEEL;
const WHITE_HEIGHT = HULL_HEIGHT - WATERLINE_FROM_KEEL;
const DECK_Y = WHITE_HEIGHT;

// Base yaw so the bow points roughly toward the camera (+Z). +0.18 rad gives
// a slight 3/4 angle so the starboard side and bridge read clearly instead of
// a flat head-on silhouette.
const BASE_YAW = -Math.PI / 2 + 0.18;

// Drift is measured as forward progress along the bow direction. Start value
// puts the ship mid-stage on mount; wrap resets it behind start once it
// passes the camera.
const START_POS_X = -1.0;
const START_POS_Z = -10.0;
const DRIFT_INITIAL = 8.0;
const DRIFT_WRAP = 22.0;
const DRIFT_RESET = 0.0;

const YAW_LAMBDA = 1.2; // ~0.83s time constant — slower than camera smoothing

type Palette = {
  hullRed: string;
  hullWhite: string;
  deck: string;
  deckDark: string;
  crane: string;
  craneCab: string;
  accent: string;
  window: string;
  funnel: string;
  funnelBand: string;
  radar: string;
  antenna: string;
};

const PALETTE: Palette = {
  hullRed: '#8B1E1E',
  hullWhite: '#E8E2D6',
  deck: '#2C2E30',
  deckDark: '#1E2022',
  crane: '#D4A017',
  craneCab: '#C59412',
  accent: '#8B1E1E',
  window: '#0C1620',
  funnel: '#3A3A3C',
  funnelBand: '#A01E1E',
  radar: '#D8D4CC',
  antenna: '#DCD8D0',
};

export type ShipProps = {
  /**
   * Optional pre-authored hull model. If provided, the procedural geometry
   * is skipped and this Group is rendered in its place. The group should be
   * oriented so +X is forward (bow) and Y=0 is the waterline — the bob/
   * pitch/roll logic assumes that convention.
   */
  model?: THREE.Group;
};

/**
 * Procedural low-poly supply ship, bow facing the camera.
 *
 * Motion:
 *  - Outer group carries world position + yaw. Yaw = BASE_YAW + mouse-driven
 *    offset (damped). Drift advances along the bow direction; lateral
 *    mouse-X nudges the course sideways.
 *  - Inner group carries pitch + roll in ship-local coordinates (so Euler
 *    composition is unambiguous regardless of yaw).
 *  - Pitch/roll come from CPU-sampling the shared Gerstner field at
 *    bow/stern/port/starboard each frame.
 *  - World position + bow direction are mirrored into the shared `shipState`
 *    so the ocean shader can render the wake in the right place.
 */
export function Ship({ model }: ShipProps) {
  const outerRef = useRef<THREE.Group>(null);
  const innerRef = useRef<THREE.Group>(null);

  // Mutable simulation state, kept off React state to avoid rerenders.
  const sim = useRef({
    t: 0,
    driftDist: DRIFT_INITIAL,
    yaw: BASE_YAW,
  });

  const [hullLowerGeo, hullUpperGeo] = useMemo(
    () => [buildHullGeometry(RED_HEIGHT), buildHullGeometry(WHITE_HEIGHT)],
    [],
  );

  useFrame((_, dt) => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const s = sim.current;
    s.t += dt;
    s.driftDist += controls.ship.driftSpeed * dt;
    if (s.driftDist > DRIFT_WRAP) s.driftDist = DRIFT_RESET;

    // Mouse yaw is an offset added on top of the fixed BASE_YAW. Damped
    // separately so the ship feels heavier than the camera.
    const yawTarget = BASE_YAW + parallaxState.smoothedX * controls.ship.yawGain;
    s.yaw = THREE.MathUtils.damp(s.yaw, yawTarget, YAW_LAMBDA, dt);

    const yaw = s.yaw;
    const cY = Math.cos(yaw);
    const sY = Math.sin(yaw);

    // Ship-local → world rotation about Y:
    //   wx =  cY*lx + sY*lz
    //   wz = -sY*lx + cY*lz
    // Bow direction (ship-local forward = +X):
    const bowDirX = cY;
    const bowDirZ = -sY;
    // Port side vector (perpendicular to bow, ship-local -Z):
    const portDirX = -bowDirZ;
    const portDirZ = bowDirX;

    // Lateral mouse-X nudge: pushes the course off to the side of the bow
    // direction so the ship visibly "changes path" with the pointer.
    const lateralOffset = parallaxState.smoothedX * controls.ship.pathXGain;

    const shipX = START_POS_X + bowDirX * s.driftDist + portDirX * lateralOffset;
    const shipZ = START_POS_Z + bowDirZ * s.driftDist + portDirZ * lateralOffset;

    // Sample the wave field at bow / stern / port / starboard / midship.
    const bowX = shipX + cY * HALF_LEN;
    const bowZ = shipZ - sY * HALF_LEN;
    const sternX = shipX - cY * HALF_LEN;
    const sternZ = shipZ + sY * HALF_LEN;
    const portX = shipX + sY * -HALF_WIDTH;
    const portZ = shipZ + cY * -HALF_WIDTH;
    const starX = shipX + sY * HALF_WIDTH;
    const starZ = shipZ + cY * HALF_WIDTH;

    // sampleOceanHeightAtWorld inverts the Gerstner horizontal drift so
    // the ship bobs on the water that's visibly under it — not on the
    // wave whose undisplaced coords happen to match. This is the fix for
    // the "ship floating in the air / buried in the wave" issue.
    const t = s.t;
    const bowY = sampleOceanHeightAtWorld(bowX, bowZ, t);
    const sternY = sampleOceanHeightAtWorld(sternX, sternZ, t);
    const portY = sampleOceanHeightAtWorld(portX, portZ, t);
    const starY = sampleOceanHeightAtWorld(starX, starZ, t);
    const midY = sampleOceanHeightAtWorld(shipX, shipZ, t);

    // Submerge offset — sinks the hull into the water by a fixed fraction
    // of hull height. A small value hides residual Gerstner sample error
    // and matches the visual of a loaded-down supply ship.
    const shipY = midY - controls.ship.submerge;
    outer.position.set(shipX, shipY, shipZ);
    outer.rotation.y = yaw;

    // Pitch (rotation about ship-local Z, since +X is forward): +bow/-stern.
    // Roll (rotation about ship-local X, since +Z is starboard): negate so
    // starboard-up rolls the deck visually toward port.
    inner.rotation.z = Math.atan2(bowY - sternY, HULL_LENGTH);
    inner.rotation.x = -Math.atan2(starY - portY, HULL_WIDTH);

    // Share with the ocean shader + DoF focus target.
    shipState.x = shipX;
    shipState.y = shipY;
    shipState.z = shipZ;
    shipState.bowDirX = bowDirX;
    shipState.bowDirZ = bowDirZ;
  });

  if (model) {
    return (
      <group ref={outerRef}>
        <group ref={innerRef}>
          <primitive object={model} />
        </group>
      </group>
    );
  }

  return (
    <group ref={outerRef}>
      <group ref={innerRef}>
        {/* Hull — lower red (keel → waterline) */}
        <mesh
          geometry={hullLowerGeo}
          position={[0, -WATERLINE_FROM_KEEL, 0]}
          castShadow
        >
          <meshStandardMaterial
            color={PALETTE.hullRed}
            roughness={0.72}
            metalness={0.08}
            flatShading
          />
        </mesh>

        {/* Hull — upper white (waterline → deck) */}
        <mesh geometry={hullUpperGeo} position={[0, 0, 0]} castShadow>
          <meshStandardMaterial
            color={PALETTE.hullWhite}
            roughness={0.68}
            metalness={0.08}
            flatShading
          />
        </mesh>

        {/* Deck plate */}
        <mesh position={[-0.1, DECK_Y + 0.01, 0]}>
          <boxGeometry args={[HULL_LENGTH - 0.8, 0.02, HULL_WIDTH - 0.22]} />
          <meshStandardMaterial
            color={PALETTE.deck}
            roughness={0.9}
            metalness={0.05}
            flatShading
          />
        </mesh>

        {/* Forecastle — small raised block near the bow, slightly chamfered */}
        <Forecastle />

        {/* Superstructure amidships: bridge, wheelhouse, funnel, radar */}
        <Superstructure />

        {/* Aft deck crane */}
        <Crane />
      </group>
    </group>
  );
}

/**
 * Raised forecastle: small white step near the bow housing the anchor
 * windlass. Plus a squat fairlead block right at the tip.
 */
function Forecastle() {
  return (
    <group position={[HALF_LEN - 1.2, DECK_Y, 0]}>
      {/* Raised forward deck */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[1.2, 0.24, HULL_WIDTH - 0.3]} />
        <meshStandardMaterial
          color={PALETTE.hullWhite}
          roughness={0.7}
          metalness={0.08}
          flatShading
        />
      </mesh>
      {/* Anchor windlass — short dark capstan */}
      <mesh position={[0.25, 0.32, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.16, 8]} />
        <meshStandardMaterial
          color={PALETTE.deckDark}
          roughness={0.85}
          metalness={0.2}
          flatShading
        />
      </mesh>
    </group>
  );
}

/**
 * Two-block bridge (with a dark window strip between stories), funnel behind
 * it with a red band, radar arch, and topmast. Sits amidships-ish, shifted
 * slightly toward the stern so the cargo deck forward of it reads.
 */
function Superstructure() {
  // Ship-local X position of the superstructure block. Slightly aft of
  // midships so the cargo deck and forecastle take the foreground.
  const baseX = -0.6;

  return (
    <group position={[baseX, DECK_Y, 0]}>
      {/* Lower bridge block */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.5, 0.9, 1.7]} />
        <meshStandardMaterial
          color={PALETTE.hullWhite}
          roughness={0.68}
          metalness={0.08}
          flatShading
        />
      </mesh>
      {/* Continuous dark window strip wrapping around the lower block */}
      <mesh position={[0, 0.78, 0]}>
        <boxGeometry args={[1.504, 0.12, 1.704]} />
        <meshStandardMaterial
          color={PALETTE.window}
          roughness={0.25}
          metalness={0.4}
        />
      </mesh>

      {/* Upper wheelhouse (stepped back, shorter) */}
      <mesh position={[0.1, 1.1, 0]} castShadow>
        <boxGeometry args={[1.05, 0.55, 1.35]} />
        <meshStandardMaterial
          color={PALETTE.hullWhite}
          roughness={0.68}
          metalness={0.08}
          flatShading
        />
      </mesh>
      {/* Wheelhouse window strip */}
      <mesh position={[0.1, 1.28, 0]}>
        <boxGeometry args={[1.054, 0.16, 1.354]} />
        <meshStandardMaterial
          color={PALETTE.window}
          roughness={0.25}
          metalness={0.4}
        />
      </mesh>
      {/* Roof cap */}
      <mesh position={[0.1, 1.42, 0]}>
        <boxGeometry args={[1.1, 0.04, 1.4]} />
        <meshStandardMaterial
          color={PALETTE.deck}
          roughness={0.85}
          metalness={0.1}
          flatShading
        />
      </mesh>

      {/* Funnel (aft of bridge) */}
      <group position={[-0.95, 0, 0]}>
        <mesh position={[0, 0.75, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.26, 1.5, 10]} />
          <meshStandardMaterial
            color={PALETTE.funnel}
            roughness={0.7}
            metalness={0.15}
            flatShading
          />
        </mesh>
        {/* Red band */}
        <mesh position={[0, 1.15, 0]}>
          <cylinderGeometry args={[0.235, 0.235, 0.18, 10]} />
          <meshStandardMaterial
            color={PALETTE.funnelBand}
            roughness={0.65}
            metalness={0.1}
            flatShading
          />
        </mesh>
        {/* Funnel cap */}
        <mesh position={[0, 1.52, 0]}>
          <cylinderGeometry args={[0.26, 0.23, 0.06, 10]} />
          <meshStandardMaterial
            color={PALETTE.deckDark}
            roughness={0.9}
            metalness={0.1}
            flatShading
          />
        </mesh>
      </group>

      {/* Radar arch — two legs + a cross beam on top of the wheelhouse */}
      <group position={[0.1, 1.44, 0]}>
        <mesh position={[0, 0.3, 0.55]}>
          <cylinderGeometry args={[0.04, 0.04, 0.6, 6]} />
          <meshStandardMaterial
            color={PALETTE.antenna}
            roughness={0.6}
            metalness={0.25}
            flatShading
          />
        </mesh>
        <mesh position={[0, 0.3, -0.55]}>
          <cylinderGeometry args={[0.04, 0.04, 0.6, 6]} />
          <meshStandardMaterial
            color={PALETTE.antenna}
            roughness={0.6}
            metalness={0.25}
            flatShading
          />
        </mesh>
        <mesh position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 1.1, 6]} />
          <meshStandardMaterial
            color={PALETTE.antenna}
            roughness={0.6}
            metalness={0.25}
            flatShading
          />
        </mesh>
        {/* Radar dome */}
        <mesh position={[0, 0.72, 0]}>
          <sphereGeometry args={[0.16, 10, 8]} />
          <meshStandardMaterial
            color={PALETTE.radar}
            roughness={0.5}
            metalness={0.2}
            flatShading
          />
        </mesh>
        {/* Mast */}
        <mesh position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.9, 6]} />
          <meshStandardMaterial
            color={PALETTE.antenna}
            roughness={0.6}
            metalness={0.25}
            flatShading
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Yellow deck crane: vertical post, angled boom, operator cab at the base,
 * dangling hook. Sits between the forecastle and the bridge on the open
 * cargo deck.
 */
function Crane() {
  return (
    <group position={[1.2, DECK_Y, 0.35]}>
      {/* Cab */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.7, 0.5, 0.6]} />
        <meshStandardMaterial
          color={PALETTE.craneCab}
          roughness={0.7}
          metalness={0.12}
          flatShading
        />
      </mesh>
      {/* Cab window strip */}
      <mesh position={[0.3, 0.42, 0]}>
        <boxGeometry args={[0.12, 0.22, 0.55]} />
        <meshStandardMaterial
          color={PALETTE.window}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>
      {/* Vertical post */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.1, 1.6, 8]} />
        <meshStandardMaterial
          color={PALETTE.crane}
          roughness={0.7}
          metalness={0.12}
          flatShading
        />
      </mesh>
      {/* Angled boom (pivots up toward bow) */}
      <mesh position={[0.9, 1.7, 0]} rotation={[0, 0, -Math.PI / 3.2]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 2.1, 8]} />
        <meshStandardMaterial
          color={PALETTE.crane}
          roughness={0.7}
          metalness={0.12}
          flatShading
        />
      </mesh>
      {/* Boom tip bracket */}
      <mesh position={[1.7, 2.3, 0]}>
        <boxGeometry args={[0.14, 0.14, 0.14]} />
        <meshStandardMaterial
          color={PALETTE.craneCab}
          roughness={0.7}
          metalness={0.12}
          flatShading
        />
      </mesh>
      {/* Hook cable */}
      <mesh position={[1.7, 1.7, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 1.1, 4]} />
        <meshStandardMaterial
          color={PALETTE.deckDark}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
      {/* Hook block */}
      <mesh position={[1.7, 1.14, 0]}>
        <boxGeometry args={[0.1, 0.12, 0.1]} />
        <meshStandardMaterial
          color={PALETTE.deckDark}
          roughness={0.6}
          metalness={0.5}
          flatShading
        />
      </mesh>
    </group>
  );
}

/**
 * Curved-bow hull outline extruded to `height`. The shape is drawn in
 * top-down XZ: a rectangle amidships narrowing into a tapered, rounded bow at
 * +X. quadraticCurveTo gives the bow cheeks a gentle curve instead of a
 * sharp chamfer, which reads much more like a real hull at low poly.
 */
function buildHullGeometry(height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();

  // Stern (transom), square
  shape.moveTo(-HALF_LEN, -HALF_WIDTH);
  shape.lineTo(-HALF_LEN, HALF_WIDTH);

  // Port side running aft → fwd
  shape.lineTo(HALF_LEN - 1.6, HALF_WIDTH);
  // Port bow cheek — curve in
  shape.quadraticCurveTo(
    HALF_LEN - 0.6, HALF_WIDTH,
    HALF_LEN - 0.15, HALF_WIDTH - 0.6,
  );
  // Bow tip (pointed but not sharp)
  shape.quadraticCurveTo(
    HALF_LEN, HALF_WIDTH - 0.85,
    HALF_LEN, 0,
  );
  shape.quadraticCurveTo(
    HALF_LEN, -(HALF_WIDTH - 0.85),
    HALF_LEN - 0.15, -(HALF_WIDTH - 0.6),
  );
  // Starboard bow cheek back to straight side
  shape.quadraticCurveTo(
    HALF_LEN - 0.6, -HALF_WIDTH,
    HALF_LEN - 1.6, -HALF_WIDTH,
  );
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 6,
    steps: 1,
  });

  // Extrude is along local +Z. Rotate so extrusion axis becomes world +Y and
  // the shape lies flat in X/Z (width along Z, length along X).
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}
