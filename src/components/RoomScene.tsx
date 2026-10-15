import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./RoomScene.css";

export interface RoomSceneProps {
  power: boolean;
  brightness: number;
  color: string;
  room?: "quarto" | "banheiro";
  onToggle?: () => void;
  unknown?: boolean;
}

type RoomKind = NonNullable<RoomSceneProps["room"]>;
type RenderMode = "starting" | "webgl" | "fallback";

interface LightTarget {
  light: THREE.PointLight;
  maxIntensity: number;
}

interface EmissiveTarget {
  material: THREE.MeshStandardMaterial;
  maxIntensity: number;
}

interface RoomModel {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  lights: LightTarget[];
  emissive: EmissiveTarget[];
}

interface SceneHandle extends RoomModel {
  renderer: THREE.WebGLRenderer;
  render: () => void;
}

const DEFAULT_TINT = "#48cfff";

function clampBrightness(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function parseTint(value: string): THREE.Color {
  try {
    return new THREE.Color(value || DEFAULT_TINT);
  } catch {
    return new THREE.Color(DEFAULT_TINT);
  }
}

function standardMaterial(
  color: THREE.ColorRepresentation,
  options: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.02,
    ...options,
  });
}

function addBox(
  scene: THREE.Scene,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  castShadow = true,
  receiveShadow = true,
): THREE.Mesh<THREE.BoxGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  scene.add(mesh);
  return mesh;
}

function roundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
): THREE.ExtrudeGeometry {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corner = Math.min(radius, halfWidth * 0.45, halfHeight * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + corner, -halfHeight);
  shape.lineTo(halfWidth - corner, -halfHeight);
  shape.absarc(halfWidth - corner, -halfHeight + corner, corner, -Math.PI / 2, 0);
  shape.lineTo(halfWidth, halfHeight - corner);
  shape.absarc(halfWidth - corner, halfHeight - corner, corner, 0, Math.PI / 2);
  shape.lineTo(-halfWidth + corner, halfHeight);
  shape.absarc(-halfWidth + corner, halfHeight - corner, corner, Math.PI / 2, Math.PI);
  shape.lineTo(-halfWidth, -halfHeight + corner);
  shape.absarc(-halfWidth + corner, -halfHeight + corner, corner, Math.PI, Math.PI * 1.5);

  const bevel = Math.min(0.025, depth * 0.12, corner * 0.22);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0.003,
    bevelSegments: 2,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function addRoundedBox(
  scene: THREE.Scene,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  radius = 0.08,
): THREE.Mesh<THREE.ExtrudeGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(roundedBoxGeometry(width, height, depth, radius), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addCylinder(
  scene: THREE.Scene,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments = 24,
): THREE.Mesh<THREE.CylinderGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addSphere(
  scene: THREE.Scene,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  segments = 20,
): THREE.Mesh<THREE.SphereGeometry, THREE.Material> {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(12, segments - 4)), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(scaleX, scaleY, scaleZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addLightSource(
  scene: THREE.Scene,
  x: number,
  y: number,
  z: number,
  maxIntensity: number,
  lights: LightTarget[],
  emissive: EmissiveTarget[],
): THREE.MeshStandardMaterial {
  const bulbMaterial = standardMaterial(0xeafaff, {
    roughness: 0.22,
    emissive: DEFAULT_TINT,
    emissiveIntensity: 0.9,
  });
  const bulb = addSphere(scene, bulbMaterial, x, y, z, 0.09, 0.12, 0.09, 18);
  bulb.castShadow = false;

  const light = new THREE.PointLight(0xffffff, maxIntensity, 7, 2);
  light.position.set(x, y, z);
  scene.add(light);
  lights.push({ light, maxIntensity });
  emissive.push({ material: bulbMaterial, maxIntensity: 1.15 });
  return bulbMaterial;
}

function addShell(
  scene: THREE.Scene,
  wallColor: number,
  sideWallColor: number,
  floorBaseColor: number,
): void {
  const slab = standardMaterial(0x101821, { roughness: 0.9 });
  const rearWall = standardMaterial(wallColor, { roughness: 0.92 });
  const sideWall = standardMaterial(sideWallColor, { roughness: 0.92 });
  const trim = standardMaterial(0x805d49, { roughness: 0.68 });
  const cutEdge = standardMaterial(0x9a755c, { roughness: 0.64, metalness: 0.08 });

  addBox(scene, slab, 0, -0.17, 0, 6.02, 0.28, 4.82, false, true);
  addBox(scene, rearWall, 0, 1.54, -2.4, 6.02, 3.08, 0.18, false, true);
  addBox(scene, sideWall, -3.0, 1.54, 0, 0.18, 3.08, 4.82, false, true);

  addBox(scene, trim, 0, 0.135, -2.285, 5.92, 0.27, 0.10, false, true);
  addBox(scene, trim, -2.885, 0.135, 0, 0.10, 0.27, 4.62, false, true);
  addBox(scene, cutEdge, 3.015, 1.54, -2.4, 0.09, 3.08, 0.22, false, true);
  addBox(scene, cutEdge, -3.0, 1.54, 2.405, 0.22, 3.08, 0.09, false, true);

  const floorBase = standardMaterial(floorBaseColor, { roughness: 0.92 });
  addBox(scene, floorBase, 0, -0.015, 0, 5.86, 0.05, 4.64, false, true);
}

function addBedroomFloor(scene: THREE.Scene): void {
  const boards = [0x704b38, 0x79513a, 0x835840, 0x744b35, 0x8a5d43].map((color) =>
    standardMaterial(color, { roughness: 0.84 }),
  );
  const seamMaterial = standardMaterial(0x3c2b26, { roughness: 0.96 });
  const boardWidth = 0.36;
  const boardDepth = 4.56;
  const count = 16;

  for (let index = 0; index < count; index += 1) {
    const x = -2.7 + boardWidth * index + boardWidth / 2;
    addBox(scene, boards[(index * 3 + Math.floor(index / 4)) % boards.length], x, 0.018, 0, boardWidth - 0.014, 0.034, boardDepth, false, true);
    const seamZ = index % 2 === 0 ? -0.76 : 0.68;
    addBox(scene, seamMaterial, x, 0.036, seamZ, boardWidth - 0.014, 0.004, 0.015, false, false);
  }
}

function addBathroomFloor(scene: THREE.Scene): void {
  const grout = standardMaterial(0x273543, { roughness: 0.9 });
  const tiles = [0x3b5264, 0x40596b, 0x354b5c].map((color) =>
    standardMaterial(color, { roughness: 0.72 }),
  );
  addBox(scene, grout, 0, 0.017, 0, 5.82, 0.04, 4.58, false, true);
  const tileSize = 0.72;
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const x = -2.53 + column * 0.75;
      const z = -1.98 + row * 0.76;
      addBox(scene, tiles[(column + row * 2) % tiles.length], x, 0.047, z, tileSize, 0.035, tileSize, false, true);
    }
  }
}

function addBedroomArt(scene: THREE.Scene): void {
  const frameMaterial = standardMaterial(0x493d3b, { roughness: 0.55, metalness: 0.08 });
  const canvasMaterial = standardMaterial(0x12233a, { roughness: 0.98 });
  const coral = standardMaterial(0xd28a72, { roughness: 0.8 });
  const moon = standardMaterial(0x89b8c6, { roughness: 0.55 });
  const art = new THREE.Group();
  art.position.set(-2.77, 2.02, 0.62);
  art.rotation.y = Math.PI / 2;
  scene.add(art);

  const frame = new THREE.Mesh(roundedBoxGeometry(1.08, 0.82, 0.09, 0.035), frameMaterial);
  frame.castShadow = true;
  art.add(frame);
  const canvas = new THREE.Mesh(roundedBoxGeometry(0.94, 0.68, 0.018, 0.02), canvasMaterial);
  canvas.position.z = 0.058;
  art.add(canvas);
  const arch = new THREE.Mesh(new THREE.CircleGeometry(0.23, 28), coral);
  arch.position.set(-0.13, -0.05, 0.073);
  art.add(arch);
  const smallMoon = new THREE.Mesh(new THREE.CircleGeometry(0.13, 28), moon);
  smallMoon.position.set(0.2, 0.14, 0.077);
  art.add(smallMoon);
}

function addPlant(
  scene: THREE.Scene,
  x: number,
  z: number,
  potColor: number,
  leafColor: number,
): void {
  const pot = standardMaterial(potColor, { roughness: 0.74 });
  const soil = standardMaterial(0x382e2b, { roughness: 1 });
  const leaves = standardMaterial(leafColor, { roughness: 0.8 });
  addCylinder(scene, pot, x, 0.23, z, 0.2, 0.15, 0.36, 24);
  addCylinder(scene, soil, x, 0.414, z, 0.154, 0.154, 0.025, 24);
  addCylinder(scene, standardMaterial(0x516a4c, { roughness: 0.9 }), x, 0.82, z, 0.027, 0.035, 0.82, 10);

  const placements: Array<[number, number, number, number]> = [
    [-0.2, 0.91, 0.03, -0.7],
    [0.2, 1.03, 0.03, 0.7],
    [-0.18, 1.25, -0.01, -0.4],
    [0.17, 1.38, -0.02, 0.45],
    [0, 1.5, -0.02, 0.05],
  ];
  for (const [offsetX, height, offsetZ, rotation] of placements) {
    const leaf = addSphere(scene, leaves, x + offsetX, height, z + offsetZ, 0.13, 0.34, 0.075, 16);
    leaf.rotation.z = rotation;
  }
}

function addBedroom(scene: THREE.Scene, lights: LightTarget[], emissive: EmissiveTarget[]): void {
  addBedroomFloor(scene);
  addBedroomArt(scene);

  const wood = standardMaterial(0x523c35, { roughness: 0.68 });
  const woodLight = standardMaterial(0x89654c, { roughness: 0.62 });
  const upholstery = standardMaterial(0x263b52, { roughness: 0.95 });
  const mattress = standardMaterial(0xc2ccd2, { roughness: 0.96 });
  const duvet = standardMaterial(0x344d65, { roughness: 0.94 });
  const pillow = standardMaterial(0xe0ded4, { roughness: 1 });
  const rug = standardMaterial(0x38414a, { roughness: 1 });
  const darkDetail = standardMaterial(0x1b2837, { roughness: 0.86 });

  addRoundedBox(scene, rug, 0.95, 0.035, 0.52, 3.18, 0.045, 3.56, 0.13);

  // Bed frame, upholstered headboard, layered linen, pillows, and a folded throw.
  addRoundedBox(scene, wood, 1.02, 0.22, 0.48, 2.72, 0.38, 3.08, 0.11);
  for (const x of [-0.12, 2.16]) {
    for (const z of [-0.82, 1.78]) addBox(scene, wood, x, 0.065, z, 0.15, 0.17, 0.16);
  }
  addRoundedBox(scene, upholstery, 1.02, 0.88, -1.105, 2.82, 1.16, 0.19, 0.12);
  for (const x of [0.08, 0.56, 1.04, 1.52, 2.0]) {
    addBox(scene, standardMaterial(0x304860, { roughness: 0.98 }), x, 0.88, -0.998, 0.018, 0.95, 0.012, false, false);
  }
  addRoundedBox(scene, mattress, 1.02, 0.47, 0.48, 2.58, 0.33, 2.89, 0.14);
  addRoundedBox(scene, duvet, 1.02, 0.655, 0.63, 2.47, 0.12, 2.35, 0.13);
  addRoundedBox(scene, standardMaterial(0x536b7e, { roughness: 0.96 }), 1.02, 0.737, 1.48, 2.45, 0.085, 0.62, 0.09);
  addRoundedBox(scene, pillow, 0.42, 0.68, -0.48, 1.02, 0.18, 0.66, 0.14);
  addRoundedBox(scene, pillow, 1.62, 0.68, -0.48, 1.02, 0.18, 0.66, 0.14);

  const bedside = standardMaterial(0x5b4038, { roughness: 0.72 });
  addRoundedBox(scene, bedside, -0.61, 0.405, -1.14, 0.76, 0.66, 0.67, 0.07);
  addRoundedBox(scene, woodLight, -0.61, 0.77, -1.14, 0.82, 0.09, 0.72, 0.045);
  addRoundedBox(scene, standardMaterial(0x684d41, { roughness: 0.7 }), -0.61, 0.48, -0.79, 0.58, 0.18, 0.035, 0.025);
  addSphere(scene, standardMaterial(0xc99b70, { metalness: 0.36, roughness: 0.35 }), -0.61, 0.48, -0.76, 0.035, 0.035, 0.026, 14);

  const lampBase = standardMaterial(0x9f8269, { metalness: 0.52, roughness: 0.35 });
  addCylinder(scene, lampBase, -0.61, 0.86, -1.15, 0.12, 0.14, 0.075, 24);
  addCylinder(scene, lampBase, -0.61, 1.045, -1.15, 0.022, 0.022, 0.31, 16);
  addCylinder(scene, standardMaterial(0xd7c1a1, { roughness: 0.87 }), -0.61, 1.25, -1.15, 0.14, 0.24, 0.28, 28);
  addLightSource(scene, -0.61, 1.31, -1.15, 10, lights, emissive);

  // Narrow desk and monitor tucked into the back-left corner.
  addRoundedBox(scene, woodLight, -1.78, 0.82, -1.63, 1.62, 0.12, 0.78, 0.045);
  for (const x of [-2.43, -1.13]) {
    for (const z of [-1.91, -1.37]) addBox(scene, wood, x, 0.42, z, 0.075, 0.78, 0.075);
  }
  addRoundedBox(scene, darkDetail, -1.78, 1.35, -2.13, 1.05, 0.67, 0.09, 0.045);
  const screenMaterial = standardMaterial(0x0d1c29, { roughness: 0.32, metalness: 0.08 });
  addRoundedBox(scene, screenMaterial, -1.78, 1.35, -2.075, 0.91, 0.53, 0.015, 0.025);
  const screenGlow = standardMaterial(0x27566a, { roughness: 0.38, emissive: 0x1a7890, emissiveIntensity: 0.24 });
  addRoundedBox(scene, screenGlow, -1.78, 1.38, -2.064, 0.79, 0.39, 0.008, 0.025);
  emissive.push({ material: screenGlow, maxIntensity: 0.24 });
  addRoundedBox(scene, darkDetail, -1.78, 0.99, -2.01, 0.075, 0.28, 0.055, 0.02);
  addRoundedBox(scene, woodLight, -1.78, 0.855, -1.99, 0.43, 0.045, 0.22, 0.02);

  // A compact chair, air conditioner, and quiet plant detail.
  addRoundedBox(scene, standardMaterial(0x233d54, { roughness: 0.92 }), -1.78, 0.52, -0.86, 0.62, 0.15, 0.58, 0.09);
  addRoundedBox(scene, upholstery, -1.78, 0.91, -0.59, 0.58, 0.68, 0.14, 0.1);
  for (const x of [-2.0, -1.56]) addBox(scene, wood, x, 0.27, -0.72, 0.055, 0.46, 0.055);

  const ac = standardMaterial(0xd8e1e4, { roughness: 0.6 });
  addRoundedBox(scene, ac, 1.9, 2.53, -2.16, 1.42, 0.38, 0.22, 0.11);
  addBox(scene, standardMaterial(0x8ea1a8, { roughness: 0.52 }), 1.9, 2.415, -2.032, 1.15, 0.018, 0.022, false, false);
  addPlant(scene, 2.43, -1.76, 0x8c6253, 0x58775c);

  const stripMaterial = standardMaterial(0xffffff, {
    roughness: 0.32,
    emissive: DEFAULT_TINT,
    emissiveIntensity: 0.75,
  });
  addRoundedBox(scene, stripMaterial, 1.02, 1.46, -1.0, 2.48, 0.035, 0.035, 0.015);
  emissive.push({ material: stripMaterial, maxIntensity: 0.86 });
}

function addBathroomTiles(scene: THREE.Scene): void {
  const backTiles = [0x3b5263, 0x435b6b, 0x354b5b].map((color) =>
    standardMaterial(color, { roughness: 0.62 }),
  );
  const sideTiles = [0x33495a, 0x3b5263, 0x304556].map((color) =>
    standardMaterial(color, { roughness: 0.66 }),
  );

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      addBox(
        scene,
        backTiles[(row + column) % backTiles.length],
        -2.72 + column * 0.6,
        0.43 + row * 0.58,
        -2.292,
        0.575,
        0.555,
        0.025,
        false,
        true,
      );
    }
  }
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      addBox(
        scene,
        sideTiles[(row + column * 2) % sideTiles.length],
        -2.89,
        0.43 + row * 0.58,
        -2.1 + column * 0.59,
        0.025,
        0.555,
        0.565,
        false,
        true,
      );
    }
  }
}

function addBathroom(scene: THREE.Scene, lights: LightTarget[], emissive: EmissiveTarget[]): void {
  addBathroomFloor(scene);
  addBathroomTiles(scene);

  const walnut = standardMaterial(0x4b3935, { roughness: 0.72 });
  const counter = standardMaterial(0x9caeb2, { roughness: 0.45, metalness: 0.08 });
  const porcelain = standardMaterial(0xdce4e4, { roughness: 0.34 });
  const chrome = standardMaterial(0x94aeb6, { roughness: 0.24, metalness: 0.7 });
  const mirrorFrame = standardMaterial(0xb18b65, { roughness: 0.36, metalness: 0.44 });

  // Floating vanity and round mirror.
  addRoundedBox(scene, walnut, -1.83, 0.47, -1.64, 1.42, 0.76, 0.68, 0.08);
  addRoundedBox(scene, counter, -1.83, 0.88, -1.64, 1.56, 0.12, 0.78, 0.055);
  addRoundedBox(scene, standardMaterial(0x594540, { roughness: 0.68 }), -1.83, 0.56, -1.278, 1.14, 0.21, 0.035, 0.025);
  addSphere(scene, mirrorFrame, -1.83, 1.92, -2.23, 0.55, 0.55, 0.055, 28);
  addSphere(scene, standardMaterial(0x456477, { roughness: 0.2, metalness: 0.2 }), -1.83, 1.92, -2.164, 0.48, 0.48, 0.025, 28);
  addSphere(scene, standardMaterial(0x6b8992, { roughness: 0.3, metalness: 0.08 }), -1.99, 2.03, -2.135, 0.11, 0.31, 0.012, 18);

  // Vessel basin and a simple metal tap.
  addSphere(scene, porcelain, -1.83, 0.98, -1.64, 0.42, 0.14, 0.27, 24);
  addSphere(scene, standardMaterial(0x526976, { roughness: 0.42 }), -1.83, 1.035, -1.64, 0.31, 0.075, 0.19, 22);
  addCylinder(scene, chrome, -1.83, 1.08, -1.88, 0.025, 0.035, 0.2, 16);
  addCylinder(scene, chrome, -1.83, 1.17, -1.78, 0.025, 0.025, 0.19, 16).rotation.x = Math.PI / 2;

  // Porcelain tub with a quiet glass shower screen.
  addRoundedBox(scene, porcelain, 1.42, 0.38, -0.25, 1.64, 0.64, 2.4, 0.18);
  addRoundedBox(scene, standardMaterial(0x455d68, { roughness: 0.26, metalness: 0.04 }), 1.42, 0.718, -0.25, 1.32, 0.045, 2.08, 0.16);
  addRoundedBox(scene, standardMaterial(0x688791, { roughness: 0.24, metalness: 0.08 }), 1.42, 0.747, -0.25, 1.12, 0.025, 1.87, 0.13);
  const glass = new THREE.MeshStandardMaterial({
    color: 0x85bdcb,
    transparent: true,
    opacity: 0.2,
    roughness: 0.16,
    metalness: 0.08,
    depthWrite: false,
  });
  addBox(scene, glass, 0.47, 1.52, -0.32, 0.035, 2.05, 1.45, false, false);
  addBox(scene, chrome, 0.48, 2.55, -0.32, 0.055, 0.055, 1.55, false, false);

  // A compact toilet in the open foreground and a folded towel at the side.
  addRoundedBox(scene, porcelain, -1.15, 0.65, 0.62, 0.48, 0.7, 0.18, 0.06);
  addSphere(scene, porcelain, -1.15, 0.31, 0.95, 0.4, 0.28, 0.58, 24);
  addSphere(scene, standardMaterial(0x50616a, { roughness: 0.4 }), -1.15, 0.48, 0.93, 0.29, 0.08, 0.43, 22);
  addRoundedBox(scene, standardMaterial(0x93a9ae, { roughness: 0.92 }), -2.72, 1.49, 0.8, 0.13, 0.68, 0.56, 0.06);
  addRoundedBox(scene, standardMaterial(0x758e97, { roughness: 0.94 }), -2.69, 1.42, 0.8, 0.12, 0.11, 0.49, 0.045);

  const sconce = standardMaterial(0xe9e0d2, { roughness: 0.45, emissive: DEFAULT_TINT, emissiveIntensity: 0.65 });
  addRoundedBox(scene, sconce, -1.83, 2.63, -2.17, 0.48, 0.13, 0.18, 0.06);
  emissive.push({ material: sconce, maxIntensity: 0.85 });
  addLightSource(scene, -1.83, 2.54, -2.05, 8, lights, emissive);
  addPlant(scene, 2.51, -1.9, 0x829395, 0x52745e);
}

function createRoomModel(room: RoomKind): RoomModel {
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 60);
  camera.position.set(8.2, 7.2, 9.2);
  camera.lookAt(0, 1.12, 0);

  const hemisphere = new THREE.HemisphereLight(0xd6e8fa, 0x17202b, 1.55);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffe4c5, 2.1);
  key.position.set(-4, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 22;
  key.shadow.bias = -0.00035;
  key.shadow.radius = 4;
  scene.add(key);

  const lights: LightTarget[] = [];
  const emissive: EmissiveTarget[] = [];
  if (room === "quarto") {
    addShell(scene, 0x40536a, 0x34485c, 0x29211e);
    addBedroom(scene, lights, emissive);
  } else {
    addShell(scene, 0x304657, 0x293d4e, 0x25333c);
    addBathroom(scene, lights, emissive);
  }

  return { scene, camera, lights, emissive };
}

function disposeModel(model: RoomModel): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  model.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      meshMaterials.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function roomLabel(room: RoomKind): string {
  return room === "banheiro" ? "Banheiro" : "Quarto";
}

export default function RoomScene({
  power,
  brightness,
  color,
  room = "quarto",
  onToggle,
  unknown = false,
}: RoomSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>("starting");
  const percentage = Math.round(clampBrightness(brightness));
  const title = roomLabel(room);
  const cssTint = parseTint(color).getStyle();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let model: RoomModel | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let isDisposed = false;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
        preserveDrawingBuffer: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setClearColor(0x000000, 0);

      model = createRoomModel(room);
      const activeRenderer = renderer;
      const activeModel = model;
      const render = () => {
        if (isDisposed || document.hidden) return;
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        const aspect = width / height;
        const viewHeight = Math.max(6.2, 7.6 / aspect);
        activeRenderer.setSize(width, height, false);
        activeModel.camera.left = (-viewHeight * aspect) / 2;
        activeModel.camera.right = (viewHeight * aspect) / 2;
        activeModel.camera.top = viewHeight / 2;
        activeModel.camera.bottom = -viewHeight / 2;
        activeModel.camera.updateProjectionMatrix();
        activeRenderer.render(activeModel.scene, activeModel.camera);
      };

      const onContextLost = (event: Event) => {
        event.preventDefault();
        setRenderMode("fallback");
      };
      canvas.addEventListener("webglcontextlost", onContextLost, false);
      resizeObserver = new ResizeObserver(render);
      resizeObserver.observe(canvas);
      document.addEventListener("visibilitychange", render);
      handleRef.current = { ...model, renderer, render };
      setRenderMode("webgl");
      render();

      return () => {
        isDisposed = true;
        resizeObserver?.disconnect();
        document.removeEventListener("visibilitychange", render);
        canvas.removeEventListener("webglcontextlost", onContextLost, false);
        handleRef.current = null;
        if (model) disposeModel(model);
        renderer?.dispose();
      };
    } catch {
      resizeObserver?.disconnect();
      handleRef.current = null;
      if (model) disposeModel(model);
      renderer?.dispose();
      setRenderMode("fallback");
      return;
    }
  }, [room]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    const tint = parseTint(color);
    const level = power ? clampBrightness(brightness) / 100 : 0;
    handle.lights.forEach(({ light, maxIntensity }) => {
      light.color.copy(tint);
      light.intensity = maxIntensity * level;
    });
    handle.emissive.forEach(({ material, maxIntensity }) => {
      material.emissive.copy(tint);
      material.emissiveIntensity = maxIntensity * level;
    });
    handle.render();
  }, [power, brightness, color, renderMode]);

  return (
    <figure className={`room-scene room-scene--${room}`}>
      <div className={`room-scene__viewport${renderMode === "fallback" ? " room-scene__viewport--fallback" : ""}`}>
        <canvas ref={canvasRef} className="room-scene__canvas" aria-hidden="true" />
        {renderMode === "fallback" && (
          <div className={`room-scene__fallback room-scene__fallback--${room}`} aria-hidden="true">
            <div className="room-scene__fallback-wall room-scene__fallback-wall--rear" />
            <div className="room-scene__fallback-wall room-scene__fallback-wall--side" />
            <div className="room-scene__fallback-floor" />
            {room === "quarto" ? (
              <>
                <div className="room-scene__fallback-desk">
                  <span className="room-scene__fallback-monitor" />
                </div>
                <div className="room-scene__fallback-bed">
                  <span className="room-scene__fallback-headboard" />
                  <span className="room-scene__fallback-pillow" />
                  <span className="room-scene__fallback-cover" />
                </div>
              </>
            ) : (
              <div className="room-scene__fallback-tub">
                <span />
              </div>
            )}
            <div className={`room-scene__fallback-lamp${power ? " is-on" : ""}`} style={{ "--room-scene-tint": cssTint } as React.CSSProperties} />
            <div className="room-scene__fallback-plant"><i /><i /><i /></div>
          </div>
        )}
        <span className="room-scene__illustration-tag">Ambiente ilustrativo</span>
        {renderMode === "fallback" && <span className="room-scene__fallback-tag">Visualização simplificada</span>}
      </div>

      <figcaption className="room-scene__caption">
        <div className="room-scene__summary">
          <strong>{title}</strong>
          <span className="room-scene__state">
            <i className={power ? "is-on" : ""} style={{ "--room-scene-tint": cssTint } as React.CSSProperties} />
            {unknown ? "Estado ainda não conhecido" : power ? `Ligada · ${percentage}%` : "Desligada"}
          </span>
        </div>
        {onToggle && (
          <button
            className="room-scene__toggle"
            type="button"
            aria-label={`${unknown ? "Alternar" : power ? "Apagar" : "Acender"} luz do ${room === "banheiro" ? "banheiro" : "quarto"}`}
            aria-pressed={unknown ? "mixed" : power}
            onClick={onToggle}
          >
            <span className="room-scene__toggle-mark" aria-hidden="true" />
            {unknown ? "Alternar luz" : power ? "Apagar luz" : "Acender luz"}
          </button>
        )}
        <span className="room-scene__sr-only">
          {unknown
            ? "Cena 3D ilustrativa. Estado ainda não conhecido."
            : `Cena 3D ilustrativa. A luz está ${power ? `acesa com brilho ajustado em ${percentage}%` : "apagada"}.`}
        </span>
      </figcaption>
    </figure>
  );
}
