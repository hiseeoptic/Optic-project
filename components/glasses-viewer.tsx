"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type GlassesViewerProps = {
  lensWidth: number;
  lensHeight: number;
  bridge: number;
  temple: number;
  color: string;
};

function rimGeometry(width: number, height: number) {
  const outer = new THREE.Shape();
  outer.absellipse(0, 0, width / 2, height / 2, 0, Math.PI * 2, false, 0);
  const inner = new THREE.Path();
  inner.absellipse(0, 0, width / 2 - 2.7, height / 2 - 2.7, 0, Math.PI * 2, true, 0);
  outer.holes.push(inner);
  return new THREE.ExtrudeGeometry(outer, {
    depth: 3.2,
    bevelEnabled: true,
    bevelSize: 0.7,
    bevelThickness: 0.7,
    bevelSegments: 3,
    curveSegments: 64,
  });
}

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

    const frame = new THREE.Group();
    const frameMaterial = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.34,
      roughness: 0.24,
      clearcoat: 0.8,
      clearcoatRoughness: 0.16,
    });
    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color: "#b9e6e5",
      roughness: 0.04,
      metalness: 0,
      transmission: 0.92,
      transparent: true,
      opacity: 0.34,
      thickness: 1.2,
      side: THREE.DoubleSide,
    });

    const halfSpan = (lensWidth + bridge) / 2;
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(rimGeometry(lensWidth, lensHeight), frameMaterial);
      rim.position.set(side * halfSpan, 0, 0);
      frame.add(rim);

      const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 72), lensMaterial);
      lens.scale.set(lensWidth / 2 - 2.8, lensHeight / 2 - 2.8, 1);
      lens.position.set(side * halfSpan, 0, 2.1);
      frame.add(lens);

      const templeMesh = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.4, temple), frameMaterial);
      templeMesh.position.set(side * (halfSpan + lensWidth / 2 + 1.6), 2, -temple / 2 + 2);
      templeMesh.rotation.y = side * -0.035;
      frame.add(templeMesh);

      const hinge = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 7), frameMaterial);
      hinge.position.set(side * (halfSpan + lensWidth / 2 + 1), 1, -1.6);
      frame.add(hinge);
    }

    const bridgeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-bridge / 2 - 1, 1, 1.7),
      new THREE.Vector3(0, 6, 2.6),
      new THREE.Vector3(bridge / 2 + 1, 1, 1.7),
    ]);
    frame.add(new THREE.Mesh(new THREE.TubeGeometry(bridgeCurve, 32, 1.8, 12, false), frameMaterial));

    const noseMaterial = new THREE.MeshPhysicalMaterial({ color: "#d9fff1", transparent: true, opacity: 0.55, roughness: 0.28 });
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(2.7, 24, 16), noseMaterial);
      pad.scale.set(0.65, 1.25, 0.4);
      pad.position.set(side * (bridge / 2 + 1.5), -5.5, -1.5);
      frame.add(pad);
    }

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
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [lensWidth, lensHeight, bridge, temple, color]);

  return <div ref={mountRef} className="h-full min-h-[430px] w-full" aria-label="Mô hình kính 3D có thể xoay" />;
}
