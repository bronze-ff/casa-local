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

// Planta tirada das fotos do quarto e do banheiro reais. Eixos da maquete: x vai da parede da
// escrivaninha (x = -3, sul) até a cabeceira da cama (x = +3, norte); z vai da parede do mangá
// (z = -2.4, oeste) até o guarda-roupa (z = +2.4, leste). No banheiro, a parede da esquerda é a do
// box e a do fundo é a do espelho. Paredes "cortadas" (frente e direita) ficam abertas.
const WALL_HEIGHT = 3.08;

/** Textura gerada no navegador (sem imagens externas), com sorteio fixo para sair sempre igual. */
function canvasTexture(width: number, height: number, draw: (pen: CanvasRenderingContext2D, random: () => number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const pen = canvas.getContext("2d");
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  if (pen) draw(pen, random);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function mangaTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 384, (pen, random) => {
    pen.fillStyle = "#e9e6df";
    pen.fillRect(0, 0, 512, 384);
    // Páginas de mangá coladas lado a lado, cada uma dividida em quadrinhos.
    for (let page = 0; page < 48; page += 1) {
      const px = (page % 8) * 64;
      const py = Math.floor(page / 8) * 64;
      const rows = 2 + Math.floor(random() * 2);
      for (let row = 0; row < rows; row += 1) {
        const cols = 1 + Math.floor(random() * 2);
        for (let col = 0; col < cols; col += 1) {
          const x = px + 3 + (col * 58) / cols;
          const y = py + 3 + (row * 58) / rows;
          const w = 58 / cols - 3;
          const h = 58 / rows - 3;
          const tone = 150 + Math.floor(random() * 95);
          pen.fillStyle = `rgb(${tone},${tone},${tone})`;
          pen.fillRect(x, y, w, h);
          pen.fillStyle = random() > 0.5 ? "#1c1c1c" : "#5a5a5a";
          pen.beginPath();
          pen.ellipse(x + w * (0.3 + random() * 0.4), y + h * (0.4 + random() * 0.3), w * 0.22, h * 0.28, 0, 0, Math.PI * 2);
          pen.fill();
          pen.strokeStyle = "#111";
          pen.lineWidth = 1.4;
          pen.strokeRect(x, y, w, h);
        }
      }
    }
    // As marcas vermelhas pintadas perto da cabeceira.
    pen.strokeStyle = "#b3262c";
    pen.lineWidth = 5;
    pen.beginPath();
    pen.moveTo(440, 250); pen.lineTo(470, 236); pen.lineTo(492, 262);
    pen.moveTo(452, 300); pen.lineTo(458, 340); pen.moveTo(470, 300); pen.lineTo(482, 336);
    pen.stroke();
  });
}

function concreteTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 64, (pen, random) => {
    pen.fillStyle = "#7d827f";
    pen.fillRect(0, 0, 256, 64);
    for (let index = 0; index < 220; index += 1) {
      const tone = 90 + Math.floor(random() * 80);
      pen.fillStyle = `rgba(${tone},${tone + 4},${tone},0.45)`;
      pen.beginPath();
      pen.ellipse(random() * 256, random() * 64, 2 + random() * 14, 1 + random() * 6, random() * 3, 0, Math.PI * 2);
      pen.fill();
    }
  });
}

function screenTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 160, (pen, random) => {
    pen.fillStyle = "#1d1830";
    pen.fillRect(0, 0, 256, 160);
    pen.fillStyle = "#2a2342";
    pen.fillRect(0, 0, 54, 160);
    pen.fillRect(196, 0, 60, 160);
    for (let line = 0; line < 22; line += 1) {
      pen.fillStyle = ["#c9c3ff", "#8f7bff", "#e6e1f5", "#6cc4ff"][Math.floor(random() * 4)];
      pen.fillRect(62, 8 + line * 6.6, 30 + random() * 96, 2.4);
    }
  });
}

function addShell(scene: THREE.Scene, depth: number, wallColor: number, sideWallColor: number, floorBaseColor: number): void {
  const half = depth / 2;
  const slab = standardMaterial(0x101821, { roughness: 0.9 });
  const rearWall = standardMaterial(wallColor, { roughness: 0.92 });
  const sideWall = standardMaterial(sideWallColor, { roughness: 0.92 });
  const cutEdge = standardMaterial(0x9a755c, { roughness: 0.64, metalness: 0.08 });

  addBox(scene, slab, 0, -0.17, 0, 6.02, 0.28, depth + 0.02, false, true);
  addBox(scene, rearWall, 0, WALL_HEIGHT / 2, -half, 6.02, WALL_HEIGHT, 0.18, false, true);
  addBox(scene, sideWall, -3.0, WALL_HEIGHT / 2, 0, 0.18, WALL_HEIGHT, depth, false, true);
  addBox(scene, cutEdge, 3.015, WALL_HEIGHT / 2, -half, 0.09, WALL_HEIGHT, 0.22, false, true);
  addBox(scene, cutEdge, -3.0, WALL_HEIGHT / 2, half + 0.005, 0.22, WALL_HEIGHT, 0.09, false, true);
  addBox(scene, standardMaterial(floorBaseColor, { roughness: 0.92 }), 0, -0.015, 0, 5.86, 0.05, depth - 0.16, false, true);
}

/** Porcelanato claro em placas grandes, como no chão do quarto e do banheiro. */
function addTileFloor(scene: THREE.Scene, depth: number, colors: number[], grout: number, size: number): void {
  const half = depth / 2;
  addBox(scene, standardMaterial(grout, { roughness: 0.9 }), 0, 0.017, 0, 5.82, 0.034, depth - 0.2, false, true);
  const tiles = colors.map((color) => standardMaterial(color, { roughness: 0.38, metalness: 0.04 }));
  const columns = Math.ceil(5.82 / size);
  const rows = Math.ceil((depth - 0.2) / size);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x0 = -2.91 + column * size;
      const z0 = -half + 0.1 + row * size;
      const w = Math.min(size, 2.91 - x0) - 0.02;
      const d = Math.min(size, half - 0.1 - z0) - 0.02;
      if (w <= 0.02 || d <= 0.02) continue;
      addBox(scene, tiles[(row * 2 + column) % tiles.length], x0 + w / 2 + 0.01, 0.045, z0 + d / 2 + 0.01, w, 0.024, d, false, true);
    }
  }
}

function addPendantBulb(scene: THREE.Scene, x: number, z: number, lights: LightTarget[], emissive: EmissiveTarget[]): void {
  const cord = standardMaterial(0x1c1c20, { roughness: 0.8 });
  addCylinder(scene, cord, x, 3.0, z, 0.008, 0.008, 0.36, 6).castShadow = false;
  addCylinder(scene, standardMaterial(0xe8e8e8, { roughness: 0.5 }), x, 2.8, z, 0.05, 0.05, 0.1, 14);
  addLightSource(scene, x, 2.66, z, 11, lights, emissive);
}

function addBedroom(scene: THREE.Scene, lights: LightTarget[], emissive: EmissiveTarget[]): void {
  addTileFloor(scene, 4.8, [0xa49c90, 0x9e968a, 0xa8a094], 0x6f6a63, 0.98);

  const panel = standardMaterial(0x7e6650, { roughness: 0.7 });
  const panelSeam = standardMaterial(0x5d4a3a, { roughness: 0.8 });
  const white = standardMaterial(0xd9d6cf, { roughness: 0.55 });
  const black = standardMaterial(0x17171a, { roughness: 0.6 });
  const pine = standardMaterial(0xb08a5c, { roughness: 0.82 });
  const pineDark = standardMaterial(0x8c6a43, { roughness: 0.86 });
  const doorWood = standardMaterial(0xa87645, { roughness: 0.7 });
  const chrome = standardMaterial(0xb6bcc2, { roughness: 0.25, metalness: 0.75 });
  const vansRed = standardMaterial(0x9e2a2b, { roughness: 0.75 });

  // ---- Parede do mangá (fundo): porta de correr de madeira e papel de parede de mangá.
  addBox(scene, standardMaterial(0x7a5a3c, { roughness: 0.74 }), 0, 2.86, -2.29, 5.8, 0.36, 0.05, false, true);
  addBox(scene, doorWood, -1.86, 1.3, -2.25, 1.74, 2.5, 0.07);
  addBox(scene, standardMaterial(0x936538, { roughness: 0.72 }), -1.6, 2.6, -2.24, 2.5, 0.2, 0.09);
  addSphere(scene, chrome, -1.12, 1.25, -2.205, 0.035, 0.035, 0.02, 12);
  for (const [x, y] of [[-1.98, 1.95], [-1.45, 1.86]]) addCylinder(scene, standardMaterial(0xf2f2f2, { roughness: 0.6 }), x, y, -2.21, 0.045, 0.045, 0.006, 16).rotation.x = Math.PI / 2;
  addBox(scene, standardMaterial(0xff8fb6, { roughness: 0.9 }), -1.62, 1.7, -2.212, 0.12, 0.12, 0.006, false, false);
  const manga = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.62), new THREE.MeshStandardMaterial({ map: mangaTexture(), roughness: 0.9 }));
  manga.position.set(0.98, 1.36, -2.302);
  manga.receiveShadow = true;
  scene.add(manga);

  // ---- Parede da escrivaninha (esquerda): painel de madeira, ar, TV, monitor, prateleira e tênis.
  addBox(scene, panel, -2.88, 1.26, -0.64, 0.05, 2.5, 3.34, false, true);
  for (const z of [-1.55, 0.25]) addBox(scene, panelSeam, -2.852, 1.26, z, 0.008, 2.5, 0.018, false, false);
  const ac = standardMaterial(0xdfe5e7, { roughness: 0.6 });
  addRoundedBox(scene, ac, -2.74, 2.76, 0.35, 0.3, 0.38, 1.46, 0.08);
  addBox(scene, standardMaterial(0x8ea1a8, { roughness: 0.52 }), -2.585, 2.63, 0.35, 0.02, 0.02, 1.2, false, false);
  addBox(scene, standardMaterial(0x2a3036, { roughness: 0.4 }), -2.585, 2.84, 0.62, 0.012, 0.05, 0.22, false, false);

  // Mesa branca suspensa, com gaveteiro branco embaixo da ponta perto da porta.
  addRoundedBox(scene, white, -2.46, 1.06, -0.78, 0.86, 0.07, 3.06, 0.03);
  addRoundedBox(scene, white, -2.5, 0.53, -1.82, 0.74, 0.98, 0.72, 0.04);
  for (const y of [0.85, 0.55, 0.25]) addBox(scene, standardMaterial(0xb9b5ad, { roughness: 0.6 }), -2.125, y, -1.82, 0.012, 0.012, 0.62, false, false);

  // TV na parede acima do monitor; monitor com o editor aberto.
  addRoundedBox(scene, black, -2.82, 2.16, -0.52, 0.06, 0.74, 1.3, 0.02);
  addRoundedBox(scene, black, -2.64, 1.44, -0.52, 0.06, 0.58, 0.98, 0.02);
  const screenGlow = new THREE.MeshStandardMaterial({ map: screenTexture(), emissive: 0x6a5cff, emissiveIntensity: 0.32, roughness: 0.35 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.52), screenGlow);
  screen.position.set(-2.605, 1.44, -0.52);
  screen.rotation.y = Math.PI / 2;
  scene.add(screen);
  emissive.push({ material: screenGlow, maxIntensity: 0.32 });
  addCylinder(scene, standardMaterial(0xcfd2d6, { roughness: 0.4 }), -2.7, 1.16, -0.52, 0.06, 0.08, 0.16, 16);
  addRoundedBox(scene, black, -2.32, 1.115, -0.6, 0.26, 0.035, 0.74, 0.015);
  addBox(scene, standardMaterial(0xe0662b, { roughness: 0.6 }), -2.32, 1.135, -0.88, 0.2, 0.01, 0.16, false, false);
  addRoundedBox(scene, standardMaterial(0x141416, { roughness: 0.95 }), -2.38, 1.103, 0.25, 0.5, 0.012, 0.66, 0.02);
  addBox(scene, standardMaterial(0x9b1d22, { roughness: 0.9 }), -2.38, 1.11, 0.22, 0.24, 0.004, 0.3, false, false);
  addSphere(scene, standardMaterial(0xc6e83a, { roughness: 0.5 }), -2.3, 1.15, 0.5, 0.08, 0.04, 0.06, 14);

  // Gabinete preto sobre a mesa e prateleira de mangás acima dele.
  addRoundedBox(scene, black, -2.6, 1.5, -1.62, 0.6, 0.82, 0.32, 0.03);
  addCylinder(scene, standardMaterial(0x2a2a2e, { roughness: 0.5 }), -2.295, 1.66, -1.62, 0.1, 0.1, 0.01, 18).rotation.z = Math.PI / 2;
  const led = standardMaterial(0xff3b30, { emissive: 0xff3b30, emissiveIntensity: 0.9 });
  addBox(scene, led, -2.295, 1.86, -1.62, 0.01, 0.03, 0.1, false, false);
  addRoundedBox(scene, white, -2.72, 2.12, -1.6, 0.36, 0.05, 1.32, 0.02);
  const spines = [0xe07a2e, 0xe07a2e, 0xd96d22, 0xf2efe8, 0x1d1d20, 0x26262a, 0x1d1d20, 0x2f2f33, 0x1d1d20, 0xc9302c, 0x26262a, 0x1d1d20];
  spines.forEach((color, index) => addBox(scene, standardMaterial(color, { roughness: 0.8 }), -2.72, 2.3, -2.16 + index * 0.095, 0.28, 0.3, 0.085));
  addBox(scene, standardMaterial(0xe9e4e4, { roughness: 0.7 }), -2.845, 1.9, -1.6, 0.012, 0.16, 0.4, false, false);

  // Caixas de tênis vermelhas presas na parede, com os tênis em cima.
  for (const y of [1.42, 1.86, 2.3]) {
    addBox(scene, vansRed, -2.7, y, 0.86, 0.36, 0.2, 0.56);
    addRoundedBox(scene, standardMaterial(0x26262a, { roughness: 0.8 }), -2.7, y + 0.16, 0.86, 0.28, 0.1, 0.48, 0.05);
    addBox(scene, standardMaterial(0xe8e4dc, { roughness: 0.8 }), -2.7, y + 0.115, 0.86, 0.29, 0.02, 0.49, false, false);
  }

  // Cadeira preta de escritório virada para a mesa.
  addRoundedBox(scene, black, -1.72, 0.68, -0.45, 0.62, 0.12, 0.62, 0.08);
  addRoundedBox(scene, black, -1.38, 1.1, -0.45, 0.12, 0.78, 0.6, 0.08);
  addCylinder(scene, chrome, -1.72, 0.4, -0.45, 0.035, 0.035, 0.5, 10);
  for (let leg = 0; leg < 5; leg += 1) {
    const angle = (leg / 5) * Math.PI * 2;
    const spoke = addBox(scene, chrome, -1.72 + Math.cos(angle) * 0.2, 0.12, -0.45 + Math.sin(angle) * 0.2, 0.4, 0.035, 0.05);
    spoke.rotation.y = -angle;
  }

  // Passagem para o banheiro no canto, ao lado da mesa (porta aberta, banheiro aceso ao fundo).
  addBox(scene, standardMaterial(0x1d2a2c, { roughness: 0.9 }), -2.86, 1.2, 1.78, 0.03, 2.3, 0.92, false, false);
  addBox(scene, doorWood, -2.84, 2.4, 1.78, 0.08, 0.1, 1.06);
  for (const z of [1.27, 2.29]) addBox(scene, doorWood, -2.84, 1.2, z, 0.08, 2.4, 0.08);
  const bathGlow = standardMaterial(0x7fb3a8, { roughness: 0.6, emissive: 0x3c6e66, emissiveIntensity: 0.25 });
  addBox(scene, bathGlow, -2.855, 1.0, 1.78, 0.02, 1.4, 0.7, false, false);

  // ---- Cama de pallet com cabeceira de ripas, sob a janela (lado direito, norte).
  for (const y of [0.1, 0.27]) {
    addBox(scene, pine, 1.32, y, -0.42, 3.3, 0.15, 2.72);
    for (const x of [-0.3, 0.8, 1.9, 2.94]) addBox(scene, pineDark, x, y, -0.42, 0.14, 0.152, 2.74, false, false);
  }
  addBox(scene, standardMaterial(0x1e2f6e, { roughness: 0.95 }), 1.34, 0.47, -0.42, 2.98, 0.26, 2.3);
  addRoundedBox(scene, standardMaterial(0x23368a, { roughness: 0.96 }), 1.34, 0.61, -0.42, 2.96, 0.05, 2.28, 0.04);
  addRoundedBox(scene, standardMaterial(0x203078, { roughness: 1 }), 2.5, 0.72, -1.0, 0.56, 0.16, 0.92, 0.1);
  addRoundedBox(scene, standardMaterial(0x203078, { roughness: 1 }), 2.5, 0.72, 0.12, 0.56, 0.16, 0.92, 0.1);
  addSphere(scene, standardMaterial(0x6f9fa3, { roughness: 1 }), 1.55, 0.74, -0.25, 0.62, 0.16, 0.42, 18);
  const neckPillow = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.08, 10, 24, Math.PI * 1.6), standardMaterial(0x7a72c9, { roughness: 1 }));
  neckPillow.position.set(0.25, 0.71, -1.1);
  neckPillow.rotation.x = -Math.PI / 2;
  neckPillow.castShadow = true;
  scene.add(neckPillow);
  addRoundedBox(scene, standardMaterial(0xa3243d, { roughness: 1 }), 0.25, 0.65, -0.72, 0.62, 0.06, 0.5, 0.05);
  // Cabeceira: ripas horizontais de pallet na largura da cama.
  for (let slat = 0; slat < 5; slat += 1) addBox(scene, pine, 2.92, 0.52 + slat * 0.24, -0.42, 0.1, 0.14, 3.02);
  for (const z of [-1.88, -0.42, 1.04]) addBox(scene, pineDark, 2.86, 0.98, z, 0.06, 1.1, 0.1, false, false);
  // Caixotes de criado-mudo dos dois lados, com tênis dentro.
  for (const z of [-2.02, 1.18]) {
    addBox(scene, pine, 2.62, 0.62, z, 0.5, 0.04, 0.5);
    addBox(scene, pine, 2.62, 0.04, z, 0.5, 0.04, 0.5);
    addBox(scene, pine, 2.62, 0.33, z - 0.235, 0.5, 0.58, 0.03);
    addBox(scene, pine, 2.62, 0.33, z + 0.235, 0.5, 0.58, 0.03);
    addBox(scene, pine, 2.86, 0.33, z, 0.03, 0.58, 0.5);
    addRoundedBox(scene, standardMaterial(0xece8e0, { roughness: 0.8 }), 2.6, 0.13, z, 0.36, 0.12, 0.3, 0.05);
  }

  // ---- Guarda-roupa (encostado na parede da frente, que é cortada): em "raio-X", translúcido e só
  // com o contorno, para mostrar o lugar e o tamanho real sem esconder a escrivaninha.
  const ghost = new THREE.MeshBasicMaterial({ color: 0xd8d2c8, transparent: true, opacity: 0.1, depthWrite: false });
  const outline = new THREE.LineBasicMaterial({ color: 0xe8e2d8, transparent: true, opacity: 0.55 });
  const wardrobe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.52, 0.78), ghost);
  wardrobe.position.set(0.55, 1.26, 1.98);
  scene.add(wardrobe);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(wardrobe.geometry), outline);
  edges.position.copy(wardrobe.position);
  scene.add(edges);
  // Divisões das quatro portas escuras e das laterais brancas, na face voltada para a cama.
  const doorLines: number[] = [];
  for (const x of [-0.45, -0.2, 0.3, 0.8, 1.3, 1.8]) doorLines.push(x, 0.08, 1.585, x, 2.44, 1.585);
  const doors = new THREE.BufferGeometry();
  doors.setAttribute("position", new THREE.Float32BufferAttribute(doorLines, 3));
  scene.add(new THREE.LineSegments(doors, outline));
  addRoundedBox(scene, black, 1.72, 1.02, 1.5, 0.3, 0.46, 0.16, 0.06);
  // Violão encostado ao lado do guarda-roupa, perto da cabeceira.
  addSphere(scene, standardMaterial(0x6d3a22, { roughness: 0.5 }), 2.28, 0.42, 2.12, 0.22, 0.26, 0.08, 18);
  addSphere(scene, standardMaterial(0x6d3a22, { roughness: 0.5 }), 2.28, 0.74, 2.12, 0.17, 0.18, 0.08, 18);
  addBox(scene, standardMaterial(0x2c1a12, { roughness: 0.6 }), 2.28, 1.12, 2.12, 0.06, 0.62, 0.04);

  // Lâmpada do quarto (a luz controlada pelo painel).
  addPendantBulb(scene, 0.4, -0.2, lights, emissive);
}

function addBathroomWalls(scene: THREE.Scene, depth: number): void {
  const half = depth / 2;
  const tiles = [0xdfe3e2, 0xd7dcdb].map((color) => standardMaterial(color, { roughness: 0.3, metalness: 0.04 }));
  const tileTop = 2.36;
  const size = 0.59;
  for (let row = 0; row * size < tileTop; row += 1) {
    const h = Math.min(size, tileTop - row * size) - 0.02;
    for (let column = 0; column < 10; column += 1) {
      addBox(scene, tiles[(row + column) % 2], -2.91 + column * size + size / 2, row * size + h / 2 + 0.02, -half + 0.105, size - 0.02, h, 0.02, false, true);
    }
    for (let column = 0; column * size < depth - 0.2; column += 1) {
      const w = Math.min(size, depth - 0.2 - column * size) - 0.02;
      addBox(scene, tiles[(row + column + 1) % 2], -2.895, row * size + h / 2 + 0.02, -half + 0.1 + column * size + w / 2, 0.02, h, w, false, true);
    }
  }
  // Faixa de concreto aparente entre o azulejo e o teto.
  const concrete = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95 });
  const band = WALL_HEIGHT - tileTop;
  addBox(scene, concrete, 0, tileTop + band / 2, -half + 0.1, 5.82, band, 0.02, false, true);
  addBox(scene, concrete, -2.9, tileTop + band / 2, 0, 0.02, band, depth - 0.2, false, true);
}

function addBathroom(scene: THREE.Scene, lights: LightTarget[], emissive: EmissiveTarget[]): void {
  const depth = 4.0;
  const half = depth / 2;
  addTileFloor(scene, depth, [0xd8d4cc, 0xd2cec6], 0xa9a59d, 0.98);
  addBathroomWalls(scene, depth);

  const porcelain = standardMaterial(0xeef0f0, { roughness: 0.28 });
  const chrome = standardMaterial(0xc3cbd0, { roughness: 0.2, metalness: 0.8 });
  const granite = standardMaterial(0xcbbba4, { roughness: 0.42 });
  const frame = standardMaterial(0xe6e8e8, { roughness: 0.4 });

  // Box no fundo, de ponta a ponta: vidro fosco, perfis brancos e a toalha laranja no trilho.
  const glass = new THREE.MeshStandardMaterial({ color: 0xc7dfdb, transparent: true, opacity: 0.38, roughness: 0.55, metalness: 0.02, depthWrite: false });
  addBox(scene, glass, -1.35, 1.2, -0.48, 0.03, 2.3, 1.95, false, false);
  addBox(scene, glass, -1.39, 1.2, 0.86, 0.03, 2.3, 1.3, false, false);
  addBox(scene, frame, -1.36, 2.38, 0.0, 0.07, 0.07, depth - 0.2, false, false);
  addBox(scene, frame, -1.36, 0.06, 0.0, 0.07, 0.06, depth - 0.2, false, false);
  for (const z of [-half + 0.12, half - 0.12, 0.2]) addBox(scene, frame, -1.36, 1.2, z, 0.05, 2.36, 0.05, false, false);
  addRoundedBox(scene, standardMaterial(0xf08a6a, { roughness: 1 }), -1.36, 2.02, -0.55, 0.12, 0.74, 0.78, 0.04);
  addBox(scene, standardMaterial(0xe27a5a, { roughness: 1 }), -1.28, 1.86, -0.55, 0.05, 0.12, 0.78, false, false);
  // Chuveiro elétrico branco na parede do fundo do box, com o fio subindo.
  addRoundedBox(scene, porcelain, -2.76, 2.5, -0.65, 0.26, 0.12, 0.5, 0.05);
  addSphere(scene, porcelain, -2.55, 2.42, -0.65, 0.2, 0.05, 0.2, 18);
  addCylinder(scene, standardMaterial(0x1c1c20, { roughness: 0.8 }), -2.86, 2.75, -0.4, 0.008, 0.008, 0.6, 6);
  addBox(scene, standardMaterial(0xcfd3d3, { roughness: 0.4 }), -2.87, 1.45, -0.42, 0.02, 0.4, 0.24, false, false);

  // Vaso encostado na parede do espelho, logo depois do box.
  addRoundedBox(scene, porcelain, -0.78, 0.72, -half + 0.32, 0.62, 0.42, 0.26, 0.06);
  addSphere(scene, porcelain, -0.78, 0.32, -half + 0.72, 0.28, 0.3, 0.4, 22);
  addRoundedBox(scene, porcelain, -0.78, 0.52, -half + 0.78, 0.6, 0.06, 0.82, 0.18);

  // Bancada de granito bege com cuba quadrada branca e torneira alta.
  addRoundedBox(scene, granite, 1.28, 1.0, -half + 0.56, 3.2, 0.08, 0.92, 0.03);
  addBox(scene, granite, 1.28, 0.9, -half + 1.0, 3.2, 0.16, 0.04);
  addRoundedBox(scene, porcelain, 0.42, 1.04, -half + 0.92, 0.92, 0.26, 0.78, 0.07);
  addRoundedBox(scene, standardMaterial(0xc8cdcd, { roughness: 0.3 }), 0.42, 1.12, -half + 0.92, 0.74, 0.04, 0.6, 0.06);
  addCylinder(scene, chrome, 0.42, 1.36, -half + 0.42, 0.03, 0.04, 0.6, 14);
  addCylinder(scene, chrome, 0.42, 1.64, -half + 0.56, 0.022, 0.022, 0.32, 12).rotation.x = Math.PI / 2;
  // Espelho grande na parede, de ponta a ponta da bancada.
  addBox(scene, standardMaterial(0xbfd0d6, { roughness: 0.12, metalness: 0.25 }), 1.28, 1.78, -half + 0.13, 3.18, 1.36, 0.03, false, false);
  // Frascos sobre a bancada e cesto de roupa embaixo.
  const bottles: Array<[number, number, number]> = [[1.3, 0x6f4bd6, 0.32], [1.48, 0x6f4bd6, 0.3], [1.8, 0x1d1d20, 0.24], [2.05, 0xd9d4cc, 0.28], [2.3, 0xe8b9b0, 0.34], [2.55, 0xf0efe9, 0.22]];
  for (const [x, color, h] of bottles) addCylinder(scene, standardMaterial(color, { roughness: 0.5 }), x, 1.04 + h / 2, -half + 0.42, 0.06, 0.06, h, 12);
  addCylinder(scene, standardMaterial(0x2f9e72, { roughness: 0.7 }), 2.0, 0.32, -half + 0.6, 0.34, 0.28, 0.6, 18);

  // Tapete vermelho diante do box.
  addRoundedBox(scene, standardMaterial(0xa3151d, { roughness: 1 }), -0.75, 0.07, 0.95, 0.75, 0.04, 1.2, 0.12);

  // Lâmpada do banheiro (a luz controlada pelo painel).
  addPendantBulb(scene, 0.6, 0.0, lights, emissive);
}

function createRoomModel(room: RoomKind): RoomModel {
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 60);
  camera.position.set(8.2, 7.2, 9.2);
  camera.lookAt(0, 1.12, 0);

  const hemisphere = new THREE.HemisphereLight(0xd6e8fa, 0x17202b, 1.35);
  scene.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffe4c5, 1.9);
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
    addShell(scene, 4.8, 0x8a929b, 0x7d8690, 0x29211e);
    addBedroom(scene, lights, emissive);
  } else {
    addShell(scene, 4.0, 0x8a949a, 0x7e888e, 0x25333c);
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
      meshMaterials.forEach((material) => (material as THREE.MeshStandardMaterial).map?.dispose());
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
