// Sky dome vertex shader.
//
// Passes the world-space view direction (from camera to vertex) to the
// fragment stage. Since the dome is a huge inverted sphere around the
// camera, this direction is effectively "where on the sky are we looking."
//
// The `z = w` trick pins the output depth to the far plane in NDC
// (z/w = 1.0), which guarantees:
//   (a) the sphere never gets clipped by camera.far, regardless of its
//       world-space radius — fixes the jagged "iceberg" silhouette that
//       appeared when the back hemisphere sat past the far plane;
//   (b) anything else in the scene naturally depth-tests in front of it.
// We still draw with depthWrite=false + renderOrder=-1000 so the sky is
// the first opaque draw of the frame and never shadows anything.

varying vec3 vWorldDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldDir = normalize(worldPos.xyz - cameraPosition);
  vec4 clip = projectionMatrix * viewMatrix * worldPos;
  clip.z = clip.w;
  gl_Position = clip;
}
