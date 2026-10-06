"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { buildGlassesModel, disposeGlassesModel } from "@/lib/glasses-model";

type GlassesViewerProps = {
  lensWidth: number;
  lensHeight: number;
  bridge: number;
  temple: number;
  color: string;
};

export function GlassesViewer({ lensWidth, lensHeight, bridge, temple, color }: GlassesViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#07100e");
    scene.fog = new THREE.Fog("#07100e", 190, 360);

    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 1000);
    camera.position.set(0, 18, 265);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 175;
    controls.maxDistance = 420;
    controls.target.set(0, 0, -10);

    scene.add(new THREE.HemisphereLight("#dfffee", "#16352b", 2.5));
    const key = new THREE.DirectionalLight("#ffffff", 5);
    key.position.set(-70, 80, 100);
    scene.add(key);
    const edge = new THREE.DirectionalLight("#79e9cf", 3);
    edge.position.set(100, 10, -70);
    scene.add(edge);

    const frame = buildGlassesModel({ lensWidth, lensHeight, bridge, temple, color });
    frame.rotation.x = -0.04;
    frame.position.y = 1;
    frame.scale.setScalar(0.72);
    scene.add(frame);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(140, 96),
      new THREE.MeshBasicMaterial({ color: "#0b1b17", transparent: true, opacity: 0.8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -48;
    floor.position.z = -18;
    scene.add(floor);

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
      renderer.render(scene, camera);
      animation = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      disposeGlassesModel(frame);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [lensWidth, lensHeight, bridge, temple, color]);

  return <div ref={mountRef} className="h-full min-h-[430px] w-full" aria-label="Mô hình kính 3D có thể xoay" />;
}
