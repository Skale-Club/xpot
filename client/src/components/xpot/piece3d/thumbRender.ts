import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Draws a piece's 3D preview (print-pipeline/preview.py) into a strip of small transparent turntable frames for the
// lists and headers that show pieces (PieceThumb3D), which turns it by dragging: frame 0 is the front. One
// WebGL renderer serves every picture, one at a time: a list of 30 pieces would otherwise open 30 contexts and the
// browser drops the oldest after ~16. Same light and angle as the rotatable view (pages/admin/tags/
// production-preview-3d.tsx), so a piece looks the same small and large. Its own module so three.js loads only
// where a picture is drawn.

let renderer: THREE.WebGLRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();

function sharedRenderer(): THREE.WebGLRenderer {
  if (renderer && !renderer.getContext().isContextLost()) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

// From a little above and to the side, like the rotatable view's first frame.
const FRONT = new THREE.Vector3(0.28, 0.22, 1).normalize();
const UP = new THREE.Vector3(0, 1, 0);
/** Share of the square the piece's box may fill: the rest is margin. */
const FILL = 0.94;

function newScene(root: THREE.Object3D): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x303038, 1.3));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(0.6, 0.8, 1.2);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(-1, -0.4, -0.8);
  scene.add(key, rim, root);
  return scene;
}

function point(camera: THREE.PerspectiveCamera, centre: THREE.Vector3, direction: THREE.Vector3, distance: number) {
  camera.position.copy(centre).addScaledVector(direction, distance);
  camera.near = distance / 100;
  camera.far = distance * 10;
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** How far back the camera must be, looking along `direction`, for the whole box to fit in the square. */
function fitDistance(camera: THREE.PerspectiveCamera, box: THREE.Box3, direction: THREE.Vector3): number {
  const centre = box.getCenter(new THREE.Vector3());
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
    new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  let distance = box.getSize(new THREE.Vector3()).length() / 2 / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  for (let pass = 0; pass < 3; pass++) {
    point(camera, centre, direction, distance);
    let widest = 0;
    for (const corner of corners) {
      const p = corner.clone().project(camera);
      widest = Math.max(widest, Math.abs(p.x), Math.abs(p.y));
    }
    distance *= widest / FILL;
  }
  return distance;
}

function release(scene: THREE.Scene) {
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  });
}

/** One lap around the piece as a single row of `frames` squares, `px` wide each (the camera turns, the piece stays). */
async function drawTurntable(url: string, px: number, frames: number): Promise<string> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const gl = sharedRenderer();
  gl.setSize(px, px, false);
  const scene = newScene(gltf.scene);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 10);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const centre = box.getCenter(new THREE.Vector3());
  const directions = Array.from({ length: frames }, (_, i) => FRONT.clone().applyAxisAngle(UP, (i / frames) * Math.PI * 2));
  // One distance for the whole lap (the widest turn), so the piece does not pulse in and out as it spins.
  const distance = Math.max(...directions.map((direction) => fitDistance(camera, box, direction)));
  const strip = document.createElement("canvas");
  strip.width = px * frames;
  strip.height = px;
  const ctx = strip.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  directions.forEach((direction, i) => {
    point(camera, centre, direction, distance);
    gl.render(scene, camera);
    ctx.drawImage(gl.domElement, i * px, 0);
  });
  release(scene);
  // WebP keeps the transparency at a fraction of the size; a browser without it hands back a PNG.
  return strip.toDataURL("image/webp", 0.9);
}

/** The turntable strip of the GLB at `url`: `frames` pictures of `px` square side by side, one lap. */
export function renderPieceTurntable(url: string, px: number, frames: number): Promise<string> {
  const job = queue.then(() => drawTurntable(url, px, frames));
  queue = job.catch(() => undefined);
  return job;
}
