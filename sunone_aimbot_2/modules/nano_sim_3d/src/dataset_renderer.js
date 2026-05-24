import * as THREE from "three";

import { SIM_POSE_ANCHORS, createRng } from "./yolo_dataset.js";

const canvas = document.getElementById("renderCanvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true
});
renderer.setClearColor(0x15181b, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x15181b, 9, 26);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 1.5, 8);
camera.lookAt(0, 1.25, 0);

const ambient = new THREE.HemisphereLight(0xddeeff, 0x27313a, 1.0);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(2.5, 5.0, 4.0);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x9fd2ff, 0.55);
fillLight.position.set(-3, 2, 5);
scene.add(fillLight);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x26313a, roughness: 0.82 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.035, 18), floorMaterial);
floor.position.set(0, -0.04, -3.0);
scene.add(floor);

const grid = new THREE.GridHelper(18, 18, 0x53606c, 0x2d343b);
grid.position.y = -0.018;
scene.add(grid);

const targetGroup = new THREE.Group();
const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.45 });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.25, 8, 16), bodyMaterial);
body.position.y = 0.82;
targetGroup.add(body);

const coreMaterial = new THREE.MeshStandardMaterial({
  color: 0x49f2a8,
  emissive: 0x124b34,
  roughness: 0.25
});
const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), coreMaterial);
core.position.y = 1.55;
targetGroup.add(core);

for (const anchor of SIM_POSE_ANCHORS) {
  targetGroup.add(createPoseAnchorMesh(anchor));
}
scene.add(targetGroup);

window.nanoYoloRenderer = {
  renderSample
};

function renderSample(options = {}) {
  const width = Math.max(128, Number(options.width) || 640);
  const height = Math.max(128, Number(options.height) || 640);
  const seed = Number(options.seed) || 1337;
  const index = Number(options.index) || 0;
  const rng = createRng(seed + index * 7919);

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = lerp(47, 62, rng());
  camera.position.set(lerp(-0.24, 0.24, rng()), lerp(1.36, 1.72, rng()), 8);
  camera.lookAt(lerp(-0.18, 0.18, rng()), lerp(1.12, 1.42, rng()), lerp(-1.1, 0.2, rng()));
  camera.updateProjectionMatrix();

  const z = -lerp(0.45, 7.8, rng());
  const xLimit = lerp(0.8, 3.9, rng());
  targetGroup.position.set(lerp(-xLimit, xLimit, rng()), lerp(-0.08, 0.18, rng()), z);
  targetGroup.rotation.set(
    lerp(-0.34, 0.34, rng()),
    lerp(-0.85, 0.85, rng()),
    lerp(-0.30, 0.30, rng()),
    "XYZ"
  );

  const scale = lerp(0.72, 1.35, rng());
  targetGroup.scale.set(scale * lerp(0.88, 1.14, rng()), scale * lerp(0.9, 1.16, rng()), scale);

  bodyMaterial.color.setHSL(lerp(0.10, 0.15, rng()), lerp(0.70, 0.92, rng()), lerp(0.48, 0.64, rng()));
  coreMaterial.color.setHSL(lerp(0.36, 0.47, rng()), lerp(0.68, 0.92, rng()), lerp(0.52, 0.68, rng()));
  floorMaterial.color.setHSL(lerp(0.54, 0.62, rng()), 0.14, lerp(0.13, 0.24, rng()));
  keyLight.intensity = lerp(1.4, 2.7, rng());
  fillLight.intensity = lerp(0.25, 0.8, rng());

  targetGroup.updateMatrixWorld(true);
  renderer.render(scene, camera);

  const box = projectObjectBox(targetGroup, width, height);
  const anchors = projectAnchorBoxes(targetGroup, width, height);
  const pose = {
    x: targetGroup.position.x,
    y: targetGroup.position.y,
    z: targetGroup.position.z,
    a: targetGroup.rotation.x,
    b: targetGroup.rotation.y,
    c: targetGroup.rotation.z
  };
  return {
    width,
    height,
    bodyBox: box,
    box,
    anchors,
    pose,
    world: {
      ...pose,
      scale
    }
  };
}

function projectObjectBox(object, imageWidth, imageHeight) {
  const worldBox = new THREE.Box3().setFromObject(object);
  const corners = [
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.min.x, worldBox.max.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.min.y, worldBox.max.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.min.z),
    new THREE.Vector3(worldBox.max.x, worldBox.max.y, worldBox.max.z)
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const corner of corners) {
    const projected = corner.project(camera);
    const x = (projected.x * 0.5 + 0.5) * imageWidth;
    const y = (-projected.y * 0.5 + 0.5) * imageHeight;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const padding = Math.max(2, Math.min(imageWidth, imageHeight) * 0.012);
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function projectAnchorBoxes(object, imageWidth, imageHeight) {
  const anchors = {};
  for (const definition of SIM_POSE_ANCHORS) {
    anchors[definition.name] = projectAnchorBox(object, definition, imageWidth, imageHeight);
  }
  return anchors;
}

function projectAnchorBox(object, definition, imageWidth, imageHeight) {
  const center = new THREE.Vector3(definition.local.x, definition.local.y, definition.local.z);
  const worldCenter = object.localToWorld(center.clone());
  const projectedCenter = worldCenter.clone().project(camera);
  const halfSize = definition.halfSize;
  const corners = [];

  for (const dx of [-halfSize, halfSize]) {
    for (const dy of [-halfSize, halfSize]) {
      for (const dz of [-halfSize, halfSize]) {
        const local = center.clone().add(new THREE.Vector3(dx, dy, dz));
        corners.push(object.localToWorld(local).project(camera));
      }
    }
  }

  const xs = corners.map((corner) => (corner.x * 0.5 + 0.5) * imageWidth);
  const ys = corners.map((corner) => (-corner.y * 0.5 + 0.5) * imageHeight);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const padding = Math.max(1, Math.min(imageWidth, imageHeight) * 0.004);

  return {
    name: definition.name,
    className: definition.className,
    classId: definition.classId,
    x: (projectedCenter.x * 0.5 + 0.5) * imageWidth,
    y: (-projectedCenter.y * 0.5 + 0.5) * imageHeight,
    z: projectedCenter.z,
    box: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      width: Math.max(1, maxX - minX + padding * 2),
      height: Math.max(1, maxY - minY + padding * 2)
    },
    world: {
      x: worldCenter.x,
      y: worldCenter.y,
      z: worldCenter.z
    },
    visible: projectedCenter.z >= -1 && projectedCenter.z <= 1
  };
}

function createPoseAnchorMesh(definition) {
  const colors = {
    front: 0x64b6ff,
    top: 0xffffff,
    left: 0xff6b6b,
    right: 0xa8f25a
  };
  const material = new THREE.MeshStandardMaterial({
    color: colors[definition.name] ?? 0x49f2a8,
    emissive: colors[definition.name] ?? 0x49f2a8,
    emissiveIntensity: 0.45,
    roughness: 0.22,
    depthTest: false,
    depthWrite: false
  });
  const size = definition.halfSize * 2.0;
  const marker = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), material);
  marker.position.set(definition.local.x, definition.local.y, definition.local.z);
  marker.name = `pose_anchor_${definition.name}`;
  marker.renderOrder = 5;
  return marker;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
