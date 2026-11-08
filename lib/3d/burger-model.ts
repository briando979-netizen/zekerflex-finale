import * as THREE from "three";

// Realistic burger model with proper materials and geometry
export interface BurgerOptions {
  scale?: number;
  quality?: "low" | "medium" | "high" | "ultra";
}

export function createRealisticBurger(scene: THREE.Scene, options: BurgerOptions = {}) {
  const { scale = 1, quality = "high" } = options;

  // Polygon counts by quality
  const segments = {
    low: { bun: 16, meat: 12, cheese: 8 },
    medium: { bun: 32, meat: 24, cheese: 16 },
    high: { bun: 64, meat: 48, cheese: 32 },
    ultra: { bun: 128, meat: 96, cheese: 64 },
  };

  const seg = segments[quality];
  const group = new THREE.Group();

  // Bottom bun (with realistic shape)
  const bunGeometry = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1.2, 0.15),
      new THREE.Vector2(1.5, 0.3),
      new THREE.Vector2(1.6, 0.5),
      new THREE.Vector2(1.55, 0.7),
      new THREE.Vector2(1.2, 0.85),
      new THREE.Vector2(0, 0.9),
    ],
    seg.bun
  );

  const bunMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4a574,
    metalness: 0.1,
    roughness: 0.7,
    map: createBunTexture(),
    normalMap: createBunNormalMap(),
    aoMap: createBunAOMap(),
  });

  const bottomBun = new THREE.Mesh(bunGeometry, bunMaterial);
  bottomBun.position.y = 0;
  bottomBun.scale.set(scale, scale * 0.6, scale);
  group.add(bottomBun);

  // Beef patty (realistic marbling)
  const meatGeometry = new THREE.CylinderGeometry(1.5, 1.4, 0.25, seg.meat, 8);
  const meatMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c4033,
    metalness: 0.2,
    roughness: 0.9,
    map: createMeatTexture(),
    normalMap: createMeatNormalMap(),
  });

  const meat = new THREE.Mesh(meatGeometry, meatMaterial);
  meat.position.y = 0.9 * scale;
  meat.scale.set(scale, scale * 0.8, scale);
  group.add(meat);

  // Cheese slice (glossy, slightly melted)
  const cheeseGeometry = new THREE.PlaneGeometry(2.8, 2.6);
  const cheeseMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    metalness: 0.3,
    roughness: 0.2,
    emissive: 0xffaa00,
    emissiveIntensity: 0.1,
    map: createCheeseTexture(),
  });

  const cheese = new THREE.Mesh(cheeseGeometry, cheeseMaterial);
  cheese.position.y = 1.2 * scale;
  cheese.rotation.x = Math.PI * 0.05;
  cheese.scale.set(scale, scale, 1);
  group.add(cheese);

  // Lettuce (translucent, wrinkled)
  const lettuceGeometry = createWrinkledPlane(3, 2.8, 20, 20);
  const lettuceMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d5016,
    metalness: 0,
    roughness: 0.8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    map: createLettuceTexture(),
    normalMap: createLettuceNormalMap(),
  });

  const lettuce = new THREE.Mesh(lettuceGeometry, lettuceMaterial);
  lettuce.position.y = 1.45 * scale;
  lettuce.rotation.z = Math.random() * Math.PI;
  lettuce.scale.set(scale, scale, 1);
  group.add(lettuce);

  // Tomato slices
  const tomatoGeometry = new THREE.CylinderGeometry(1.4, 1.3, 0.15, 32, 8);
  const tomatoMaterial = new THREE.MeshStandardMaterial({
    color: 0xdc2f02,
    metalness: 0.1,
    roughness: 0.6,
    map: createTomatoTexture(),
    normalMap: createTomatoNormalMap(),
  });

  const tomato = new THREE.Mesh(tomatoGeometry, tomatoMaterial);
  tomato.position.y = 1.65 * scale;
  tomato.scale.set(scale, scale, scale);
  group.add(tomato);

  // Top bun
  const topBun = bottomBun.clone();
  topBun.position.y = 1.9 * scale;
  topBun.scale.y *= -1;
  group.add(topBun);

  // Add sesame seeds to top bun
  addSesamSeeds(topBun, 50);

  return group;
}

// Wrinkled plane for realistic lettuce
function createWrinkledPlane(
  width: number,
  height: number,
  widthSegs: number,
  heightSegs: number
): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, widthSegs, heightSegs);
  const positionAttribute = geometry.getAttribute("position");
  const positions = positionAttribute.array as Float32Array;

  for (let i = 2; i < positions.length; i += 3) {
    positions[i] += (Math.random() - 0.5) * 0.1;
  }

  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// Realistic textures using canvas
function createBunTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#d4a574";
  ctx.fillRect(0, 0, 512, 512);

  // Add grain pattern
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(${139 + Math.random() * 40}, ${101 + Math.random() * 40}, ${46 + Math.random() * 40}, ${Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 5 + 1, Math.random() * 5 + 1);
  }

  // Add sesame highlights
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillRect(x, y, 3, 3);
  }

  return new THREE.CanvasTexture(canvas);
}

function createBunNormalMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = `rgb(${128 + Math.random() * 60}, ${128 + Math.random() * 60}, ${255})`;
    ctx.fillRect(x, y, Math.random() * 4 + 1, Math.random() * 4 + 1);
  }

  return new THREE.CanvasTexture(canvas);
}

function createBunAOMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  const gradient = ctx.createRadialGradient(128, 128, 50, 128, 128, 180);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#999999");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  return new THREE.CanvasTexture(canvas);
}

function createMeatTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#5c4033";
  ctx.fillRect(0, 0, 512, 512);

  // Marbling effect
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(${40 + Math.random() * 40}, ${20 + Math.random() * 40}, ${10 + Math.random() * 30}, ${Math.random() * 0.5})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 8 + 2, Math.random() * 8 + 2);
  }

  // Char marks
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  for (let i = 0; i < 100; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 30 + 10, Math.random() * 30 + 10);
  }

  return new THREE.CanvasTexture(canvas);
}

function createMeatNormalMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgb(${120 + Math.random() * 50}, ${120 + Math.random() * 50}, ${255})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 3 + 1, Math.random() * 3 + 1);
  }

  return new THREE.CanvasTexture(canvas);
}

function createCheeseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffd700";
  ctx.fillRect(0, 0, 512, 512);

  // Light reflections
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  for (let i = 0; i < 500; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 20 + 5, 2);
  }

  return new THREE.CanvasTexture(canvas);
}

function createLettuceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#2d5016";
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = "#1a3009";
  for (let i = 0; i < 2000; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 15 + 2, Math.random() * 15 + 2);
  }

  return new THREE.CanvasTexture(canvas);
}

function createLettuceNormalMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2000; i++) {
    ctx.fillStyle = `rgb(${100 + Math.random() * 100}, ${100 + Math.random() * 100}, ${255})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 8 + 1, Math.random() * 8 + 1);
  }

  return new THREE.CanvasTexture(canvas);
}

function createTomatoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#dc2f02";
  ctx.fillRect(0, 0, 512, 512);

  // Seeds visible
  ctx.fillStyle = "rgba(100, 50, 30, 0.5)";
  for (let i = 0; i < 300; i++) {
    ctx.beginPath();
    ctx.ellipse(Math.random() * 512, Math.random() * 512, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Juice effect
  ctx.fillStyle = "rgba(255, 100, 50, 0.2)";
  for (let i = 0; i < 100; i++) {
    ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 20 + 5, 2);
  }

  return new THREE.CanvasTexture(canvas);
}

function createTomatoNormalMap(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#8080ff";
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = `rgb(${120 + Math.random() * 60}, ${120 + Math.random() * 60}, ${255})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 4 + 1, Math.random() * 4 + 1);
  }

  return new THREE.CanvasTexture(canvas);
}

// Sesame seeds on top bun
function addSesamSeeds(bun: THREE.Mesh, count: number) {
  const seeds = new THREE.Group();

  for (let i = 0; i < count; i++) {
    const seedGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const seedMaterial = new THREE.MeshStandardMaterial({
      color: 0xfadf63,
      metalness: 0.1,
      roughness: 0.4,
    });

    const seed = new THREE.Mesh(seedGeometry, seedMaterial);
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 1.2 + 0.3;

    seed.position.set(Math.cos(angle) * radius, 0.45, Math.sin(angle) * radius);
    seed.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

    seeds.add(seed);
  }

  bun.add(seeds);
}
