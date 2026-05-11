'use client';

import { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { Ship } from './Ship';

const MODEL_URL = '/models/vessel.glb';

// ─── Orientation knobs ──────────────────────────────────────────────────────
// Ship.tsx expects the inbound model to be oriented with +X = bow and
// Y = 0 at the waterline. Tweak these constants if the ship ends up facing
// the wrong way or sitting too high/low in the water.

// Target hull length in world units — matches the HULL_LENGTH constant used
// by the CPU wave sampler in Ship.tsx so bow/stern bobbing lines up with
// the visible model.
const TARGET_LENGTH = 6.4;

// Fraction of the model's overall height that should sit below Y=0.
// 0 = keel at waterline (too high), 0.3 = aggressively submerged.
const SUBMERGE_FRAC = 0.16;

// Extra yaw offset applied in model-local frame, in radians. Change this
// (by ±π/2 or ±π) if the auto-orient ends up broadside/backwards.
const YAW_OFFSET = Math.PI / 2;

useGLTF.preload(MODEL_URL);

function LoadedShip() {
  const { scene } = useGLTF(MODEL_URL) as unknown as {
    scene: THREE.Group;
  };

  const oriented = useMemo(() => {
    // Reset so HMR re-applies transforms idempotently.
    scene.rotation.set(0, 0, 0);
    scene.scale.setScalar(1);
    scene.position.set(0, 0, 0);

    // Rotate to +X-forward.
    scene.rotation.y = YAW_OFFSET;

    // Size against the longer horizontal axis of the post-rotation bbox.
    let bbox = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const longestHoriz = Math.max(size.x, size.z, 1e-6);
    const s = TARGET_LENGTH / longestHoriz;
    scene.scale.setScalar(s);

    // Center horizontally and sink to waterline.
    bbox = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    scene.position.x = -center.x;
    scene.position.z = -center.z;
    const height = bbox.max.y - bbox.min.y;
    scene.position.y = -bbox.min.y - height * SUBMERGE_FRAC;

    // PBR polish: flag every mesh for shadows (picked up if Canvas shadows
    // are enabled later) and clamp any double-sided materials that tend to
    // show z-fighting on thin hull plating.
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });

    return scene;
  }, [scene]);

  return <Ship model={oriented} />;
}

/**
 * GLB-backed ship with the procedural silhouette as a Suspense fallback so
 * that the ocean's wake shader has a populated `shipState` from frame 1,
 * even while the 30MB model downloads.
 */
export function ShipModel() {
  return (
    <Suspense fallback={<Ship />}>
      <LoadedShip />
    </Suspense>
  );
}
