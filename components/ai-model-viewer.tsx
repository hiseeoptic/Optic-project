"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { disposeGlassesModel } from "@/lib/glasses-model";

export function AiModelViewer({ modelUrl }: { modelUrl: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let model: THREE.Group | null = null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#07100e");
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 2000);
    camera.position.set(0, 0.4, 3.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    scene.add(new THREE.HemisphereLight("#ffffff", "#17372d", 3.2));
    const light = new THREE.DirectionalLight("#ffffff", 5);
    light.position.set(-3, 5, 6);
    scene.add(light);

    new GLTFLoader().load(modelUrl, (gltf) => {
      if (disposed) {
        disposeGlassesModel(gltf.scene);
        return;
      }
      model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 2.25 / Math.max(size.x, size.y, size.z, 0.001);
      model.position.sub(center);
      model.scale.setScalar(scale);
      scene.add(model);
      setState("ready");
    }, undefined, () => setState("error"));

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    let animation = 0;
    const render = () => {
      controls.update();
      if (model) model.rotation.y += 0.0025;
      renderer.render(scene, camera);
      animation = requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      if (model) disposeGlassesModel(model);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [modelUrl]);

  return <div className="relative overflow-hidden rounded-3xl border border-white/10"><div ref={mountRef} className="h-[440px] w-full" /><div className="absolute left-4 top-4 rounded-full border border-white/10 bg-[#07110f]/80 px-3 py-2 text-xs text-[#c7d8d0] backdrop-blur-xl">{state === "loading" ? "Đang tải GLB" : state === "ready" ? "AI mesh · kéo để xoay" : "Không thể tải mô hình"}</div></div>;
}
