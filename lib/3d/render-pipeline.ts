// HD 3D-to-2D Rendering Pipeline
// Renders 3D models to high-quality images at various resolutions

import * as THREE from "three";

export interface RenderOptions {
  resolution: "1080p" | "4k" | "8k";
  angles: number; // Number of different angles to render
  lighting?: "studio" | "natural" | "dramatic";
  backgroundColor?: string;
}

export interface RenderResult {
  images: Blob[];
  resolution: { width: number; height: number };
  timestamp: Date;
  assetId: string;
}

const RESOLUTION_MAP = {
  "1080p": { width: 1920, height: 1080, dpi: 72 },
  "4k": { width: 3840, height: 2160, dpi: 150 },
  "8k": { width: 7680, height: 4320, dpi: 300 },
};

class HDRenderPipeline {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfafafa);

    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
    this.camera.position.set(0, 1, 3);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
  }

  setLighting(type: "studio" | "natural" | "dramatic") {
    // Clear existing lights
    this.scene.children.forEach((child) => {
      if (child instanceof THREE.Light) {
        this.scene.remove(child);
      }
    });

    switch (type) {
      case "studio":
        this.setupStudioLighting();
        break;
      case "natural":
        this.setupNaturalLighting();
        break;
      case "dramatic":
        this.setupDramaticLighting();
        break;
    }
  }

  private setupStudioLighting() {
    // 3-point professional studio lighting
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xb8d4f1, 0.6);
    fillLight.position.set(-5, 3, 3);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffa500, 0.4);
    rimLight.position.set(0, 2, -6);
    this.scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);
  }

  private setupNaturalLighting() {
    // Soft natural window lighting
    const keyLight = new THREE.DirectionalLight(0xffffcc, 0.9);
    keyLight.position.set(3, 4, 3);
    keyLight.castShadow = true;
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xccddff, 0.5);
    fillLight.position.set(-2, 2, 2);
    this.scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0xe6f3ff, 0.5);
    this.scene.add(ambientLight);
  }

  private setupDramaticLighting() {
    // High-contrast dramatic lighting
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(6, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff6600, 0.8);
    rimLight.position.set(-5, 3, -8);
    this.scene.add(rimLight);

    const ambientLight = new THREE.AmbientLight(0x000033, 0.2);
    this.scene.add(ambientLight);
  }

  async renderToImages(model: THREE.Object3D, options: RenderOptions): Promise<RenderResult> {
    const resSpec = RESOLUTION_MAP[options.resolution];
    this.renderer.setSize(resSpec.width, resSpec.height);
    this.renderer.setPixelRatio(1);

    this.setLighting(options.lighting || "studio");

    // Clear scene
    this.scene.children.forEach((child) => {
      if (!(child instanceof THREE.Light) && !(child instanceof THREE.Camera)) {
        this.scene.remove(child);
      }
    });

    // Add model
    this.scene.add(model);

    // Calculate bounding box for proper framing
    const bbox = new THREE.Box3().setFromObject(model);
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));

    this.camera.position.copy(center);
    this.camera.position.z += cameraZ * 1.5;
    this.camera.lookAt(center);

    const images: Blob[] = [];
    const angleStep = 360 / options.angles;

    for (let i = 0; i < options.angles; i++) {
      const angle = (i * angleStep * Math.PI) / 180;

      // Rotate model
      model.rotation.y = angle;

      // Render
      this.renderer.render(this.scene, this.camera);

      // Convert to blob
      const canvas = this.renderer.domElement as HTMLCanvasElement;
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), "image/png");
      });

      images.push(blob);
    }

    return {
      images,
      resolution: { width: resSpec.width, height: resSpec.height },
      timestamp: new Date(),
      assetId: model.userData.assetId || "unknown",
    };
  }

  dispose() {
    this.renderer.dispose();
  }
}

// Singleton instance
let pipelineInstance: HDRenderPipeline | null = null;

export function getPipeline(): HDRenderPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new HDRenderPipeline();
  }
  return pipelineInstance;
}

// Main render function
export async function render3DModel(
  model: THREE.Object3D,
  assetId: string,
  options: RenderOptions = {
    resolution: "4k",
    angles: 6,
    lighting: "studio",
  }
): Promise<RenderResult> {
  model.userData.assetId = assetId;
  const pipeline = getPipeline();
  return pipeline.renderToImages(model, options);
}

// Render to single image
export async function render3DModelSingle(
  model: THREE.Object3D,
  options: Partial<RenderOptions> = {}
): Promise<Blob> {
  const fullOptions: RenderOptions = {
    resolution: (options.resolution as any) || "4k",
    angles: 1,
    lighting: options.lighting || "studio",
  };

  const result = await render3DModel(model, "temp", fullOptions);
  return result.images[0];
}

// Batch render multiple models
export async function batchRender3DModels(
  models: Array<{ model: THREE.Object3D; assetId: string }>,
  options: RenderOptions
): Promise<RenderResult[]> {
  const results: RenderResult[] = [];

  for (const { model, assetId } of models) {
    const result = await render3DModel(model, assetId, options);
    results.push(result);
  }

  return results;
}

// Export render result to files
export async function exportRenderResult(
  result: RenderResult,
  format: "png" | "webp" | "jpeg" = "png"
): Promise<File[]> {
  const files: File[] = [];

  for (let i = 0; i < result.images.length; i++) {
    const blob = result.images[i];
    const file = new File(
      [blob],
      `${result.assetId}-angle-${i + 1}-${result.resolution.width}x${result.resolution.height}.${format}`,
      { type: `image/${format}` }
    );
    files.push(file);
  }

  return files;
}

// Upscale image (client-side or server-side)
export async function upscaleImage(blob: Blob, factor: 2 | 4 = 2): Promise<Blob> {
  // Client-side: Use canvas native scaling (basic)
  // For production, integrate with:
  // - Upscayl API (open-source)
  // - Real-ESRGAN server
  // - Topaz Gigapixel API

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width * factor;
      canvas.height = img.height * factor;

      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((b) => resolve(b!), "image/png");
    };
    img.src = URL.createObjectURL(blob);
  });
}
