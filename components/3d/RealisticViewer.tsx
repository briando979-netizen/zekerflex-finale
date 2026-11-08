"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { createRealisticBurger } from "@/lib/3d/burger-model";

interface RealisticViewerProps {
  modelType?: "burger" | "custom";
  quality?: "low" | "medium" | "high" | "ultra";
  onLoaded?: () => void;
}

export function RealisticViewer({
  modelType = "burger",
  quality = "high",
  onLoaded,
}: RealisticViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<{ rotation: { x: number; y: number } }>({ rotation: { x: 0, y: 0 } });

  const [zoom, setZoom] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [quality_level, setQualityLevel] = useState<"low" | "medium" | "high" | "ultra">(quality);
  const [isExporting, setIsExporting] = useState(false);

  const initScene = useCallback(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfafafa);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1, 3);
    camera.lookAt(0, 1, 0);

    // Renderer with high quality settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      precision: "highp",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);

    // Professional 3-point lighting
    // Key light (main)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.far = 20;
    scene.add(keyLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xb8d4f1, 0.6);
    fillLight.position.set(-5, 3, 3);
    scene.add(fillLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0xffa500, 0.4);
    rimLight.position.set(0, 2, -6);
    scene.add(rimLight);

    // Ambient light for fill
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Add model
    const burger = createRealisticBurger(scene, { scale: 1.5, quality: quality_level });
    scene.add(burger);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Mouse controls
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    renderer.domElement.addEventListener("mousedown", (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      controlsRef.current.rotation.y += deltaX * 0.01;
      controlsRef.current.rotation.x += deltaY * 0.01;

      burger.rotation.y = controlsRef.current.rotation.y;
      burger.rotation.x = controlsRef.current.rotation.x;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener("mouseup", () => {
      isDragging = false;
    });

    renderer.domElement.addEventListener("wheel", (e) => {
      e.preventDefault();
      setZoom((prev) => Math.max(50, Math.min(200, prev + (e.deltaY > 0 ? -5 : 5))));
    });

    // Touch support
    let touchStartDistance = 0;
    renderer.domElement.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        touchStartDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
      } else if (e.touches.length === 1) {
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });

    renderer.domElement.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        const delta = touchStartDistance - currentDistance;
        setZoom((prev) => Math.max(50, Math.min(200, prev + delta * 0.1)));
        touchStartDistance = currentDistance;
      } else if (e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - previousMousePosition.x;
        const deltaY = e.touches[0].clientY - previousMousePosition.y;
        controlsRef.current.rotation.y += deltaX * 0.01;
        controlsRef.current.rotation.x += deltaY * 0.01;
        burger.rotation.y = controlsRef.current.rotation.y;
        burger.rotation.x = controlsRef.current.rotation.x;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);

      const zoomValue = zoom / 100;
      camera.position.z = 3 / zoomValue;
      camera.fov = 75 * (1 / zoomValue);
      camera.updateProjectionMatrix();

      // Update lighting based on brightness
      keyLight.intensity = (brightness / 100) * 1.2;
      fillLight.intensity = (brightness / 100) * 0.6;
      rimLight.intensity = (brightness / 100) * 0.4;

      renderer.render(scene, camera);
    };

    animate();

    onLoaded?.();

    // Cleanup
    const handleResize = () => {
      const newWidth = containerRef.current?.clientWidth || width;
      const newHeight = containerRef.current?.clientHeight || height;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
    };
  }, [quality_level, brightness, zoom, onLoaded]);

  useEffect(() => {
    initScene();
  }, [initScene]);

  const exportImage = async (resolution: "1080p" | "4k" | "8k") => {
    if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return;

    setIsExporting(true);

    const resolutions = {
      "1080p": { width: 1920, height: 1080 },
      "4k": { width: 3840, height: 2160 },
      "8k": { width: 7680, height: 4320 },
    };

    const res = resolutions[resolution];

    // Create temporary renderer
    const tempRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    tempRenderer.setSize(res.width, res.height);
    tempRenderer.setPixelRatio(1);
    tempRenderer.outputColorSpace = THREE.SRGBColorSpace;
    tempRenderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Update camera aspect
    const tempCamera = new THREE.PerspectiveCamera(75, res.width / res.height, 0.1, 1000);
    tempCamera.position.copy(cameraRef.current.position);
    tempCamera.lookAt(0, 1, 0);

    // Render and export
    tempRenderer.render(sceneRef.current, tempCamera);

    const canvas = tempRenderer.domElement as HTMLCanvasElement;
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `burger-${resolution}-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
      }
      tempRenderer.dispose();
      setIsExporting(false);
    }, "image/png");
  };

  return (
    <div className="w-full h-screen flex flex-col bg-white">
      {/* Viewer canvas */}
      <div ref={containerRef} className="flex-1 bg-gradient-to-br from-gray-50 to-gray-100" />

      {/* Controls */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Zoom */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Zoom: {zoom}%</label>
              <input
                type="range"
                min="50"
                max="200"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Brightness */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brightness: {brightness}%
              </label>
              <input
                type="range"
                min="50"
                max="150"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Quality */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quality</label>
              <select
                value={quality_level}
                onChange={(e) => setQualityLevel(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="low">Low (Fast)</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="ultra">Ultra (Slow)</option>
              </select>
            </div>

            {/* Export */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Export</label>
              <div className="flex gap-2">
                <button
                  onClick={() => exportImage("1080p")}
                  disabled={isExporting}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  1080p
                </button>
                <button
                  onClick={() => exportImage("4k")}
                  disabled={isExporting}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  4K
                </button>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            💡 Drag to rotate · Scroll to zoom · Touch: drag to rotate, pinch to zoom
          </div>
        </div>
      </div>
    </div>
  );
}
