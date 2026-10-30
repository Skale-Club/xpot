import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/components/ui/button";

// The rotatable model of a version's 3D preview (print-pipeline/preview.py: x right, y up, the face toward +z,
// metres). Its own module so three.js loads only where a preview is shown (production-preview.tsx imports it lazily).
// It draws only when the view changes: nothing runs while the page just sits there.

export type PreviewState = "loading" | "ready" | "failed" | "no-webgl";

export default function Preview3D({ url, resetLabel, onState }: { url: string; resetLabel: string; onState: (state: PreviewState) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  // The parent's callback changes on every render; only a new url reloads the model.
  const report = useRef(onState);
  report.current = onState;

  useEffect(() => {
    const onState = (state: PreviewState) => report.current(state);
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onState("no-webgl");
      return;
    }
    let disposed = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Soft fill and one key light from the upper right: white PLA stays white and black PLA still reads black.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x303038, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(0.6, 0.8, 1.2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(-1, -0.4, -0.8);
    scene.add(key, rim);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    const draw = () => renderer.render(scene, camera);
    controls.addEventListener("change", draw);

    const resize = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      renderer.domElement.style.width = `${width}px`;
      renderer.domElement.style.height = `${height}px`;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    onState("loading");
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (disposed) return;
        scene.add(gltf.scene);
        // Frame the piece face-on, a little from above and to the side, at a distance that fits it.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) * 0.62;
        const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
        camera.position.copy(centre).add(new THREE.Vector3(0.28, 0.22, 1).normalize().multiplyScalar(distance));
        camera.near = distance / 100;
        camera.far = distance * 10;
        camera.updateProjectionMatrix();
        controls.target.copy(centre);
        controls.minDistance = distance * 0.3;
        controls.maxDistance = distance * 3;
        controls.update();
        controls.saveState();
        reset.current = () => controls.reset();
        resize();
        setReady(true);
        onState("ready");
      },
      undefined,
      () => {
        if (!disposed) onState("failed");
      },
    );

    return () => {
      disposed = true;
      observer.disconnect();
      controls.removeEventListener("change", draw);
      controls.dispose();
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="h-full w-full cursor-grab active:cursor-grabbing" data-testid="production-preview-canvas" />
      {ready ? (
        <Button type="button" variant="ghost" size="sm" className="absolute bottom-2 right-2 bg-black/40 backdrop-blur" onClick={() => reset.current()}>
          <RotateCcw />
          {resetLabel}
        </Button>
      ) : null}
    </div>
  );
}
