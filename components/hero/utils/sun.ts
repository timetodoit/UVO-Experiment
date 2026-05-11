import * as THREE from 'three';
import { controls } from '@/lib/controls';

/**
 * Convert the sun azimuth/elevation controls into a normalized world-space
 * direction (light → origin), write into `out`, and return it.
 *
 * Azimuth is degrees clockwise from +Z (camera-facing). Elevation is
 * degrees above the horizon.
 *
 *   azimuth  0 → sun behind the camera (+Z)
 *   azimuth 90 → sun to the camera's right (+X)
 *   azimuth 180 → sun in front of the camera (-Z)
 *   azimuth 270 → sun to the camera's left (-X)
 *
 * KeyLight, Ocean, and SkyDome all call this each frame so dragging the
 * sun sliders moves every dependent source simultaneously.
 */
const DEG = Math.PI / 180;

export function getSunDir(out: THREE.Vector3): THREE.Vector3 {
  const az = controls.sun.azimuth * DEG;
  const el = controls.sun.elevation * DEG;
  const cosEl = Math.cos(el);
  out.set(cosEl * Math.sin(az), Math.sin(el), cosEl * Math.cos(az));
  return out.normalize();
}

// Warmth=0: neutral midday white. Warmth=1: deep golden-hour amber. The
// non-linear lerp concentrates most of the change in the top half of the
// slider so subtle warmth is easy to dial in.
const SUN_WHITE = new THREE.Color('#fff6e6');
const SUN_AMBER = new THREE.Color('#ff9e55');

export function getSunColor(out: THREE.Color): THREE.Color {
  const w = controls.sun.warmth;
  out.copy(SUN_WHITE).lerp(SUN_AMBER, w * w);
  return out;
}
