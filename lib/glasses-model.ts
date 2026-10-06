import * as THREE from "three";

export type GlassesDimensions = {
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

export function buildGlassesModel({ lensWidth, lensHeight, bridge, temple, color }: GlassesDimensions) {
  const frame = new THREE.Group();
  frame.name = "Kinh_3D_AI";
  frame.userData = { unit: "millimeter", lensWidth, lensHeight, bridge, temple };

  const frameMaterial = new THREE.MeshPhysicalMaterial({
    name: "Frame material",
    color,
    metalness: 0.34,
    roughness: 0.24,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
  });
  const lensMaterial = new THREE.MeshPhysicalMaterial({
    name: "Lens material",
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
    const sideName = side === -1 ? "Left" : "Right";
    const rim = new THREE.Mesh(rimGeometry(lensWidth, lensHeight), frameMaterial);
    rim.name = `${sideName}_rim`;
    rim.position.set(side * halfSpan, 0, 0);
    frame.add(rim);

    const lens = new THREE.Mesh(new THREE.CircleGeometry(1, 72), lensMaterial);
    lens.name = `${sideName}_lens`;
    lens.scale.set(lensWidth / 2 - 2.8, lensHeight / 2 - 2.8, 1);
    lens.position.set(side * halfSpan, 0, 2.1);
    frame.add(lens);

    const templeMesh = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.4, temple), frameMaterial);
    templeMesh.name = `${sideName}_temple`;
    templeMesh.position.set(side * (halfSpan + lensWidth / 2 + 1.6), 2, -temple / 2 + 2);
    templeMesh.rotation.y = side * -0.035;
    frame.add(templeMesh);

    const hinge = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 7), frameMaterial);
    hinge.name = `${sideName}_hinge`;
    hinge.position.set(side * (halfSpan + lensWidth / 2 + 1), 1, -1.6);
    frame.add(hinge);
  }

  const bridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-bridge / 2 - 1, 1, 1.7),
    new THREE.Vector3(0, 6, 2.6),
    new THREE.Vector3(bridge / 2 + 1, 1, 1.7),
  ]);
  const bridgeMesh = new THREE.Mesh(new THREE.TubeGeometry(bridgeCurve, 32, 1.8, 12, false), frameMaterial);
  bridgeMesh.name = "Bridge";
  frame.add(bridgeMesh);

  const noseMaterial = new THREE.MeshPhysicalMaterial({
    name: "Nose pad material",
    color: "#d9fff1",
    transparent: true,
    opacity: 0.55,
    roughness: 0.28,
  });
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(2.7, 24, 16), noseMaterial);
    pad.name = side === -1 ? "Left_nose_pad" : "Right_nose_pad";
    pad.scale.set(0.65, 1.25, 0.4);
    pad.position.set(side * (bridge / 2 + 1.5), -5.5, -1.5);
    frame.add(pad);
  }

  return frame;
}

export function disposeGlassesModel(model: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      meshMaterials.forEach((material) => materials.add(material));
    }
  });
  materials.forEach((material) => material.dispose());
}
