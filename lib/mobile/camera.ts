import { z } from 'zod';

interface CameraConfig {
  facingMode: 'user' | 'environment';
  width: number;
  height: number;
  frameRate: number;
}

interface CapturedImage {
  data: string;
  mimeType: string;
  timestamp: number;
  metadata: {
    width: number;
    height: number;
    brightness: number;
  };
}

interface DocumentScanResult {
  id: string;
  images: CapturedImage[];
  extractedText: string;
  confidence: number;
  documentType: string;
}

const cameraConfigSchema = z.object({
  facingMode: z.enum(['user', 'environment']),
  width: z.number(),
  height: z.number(),
  frameRate: z.number(),
});

export type CameraData = z.infer<typeof cameraConfigSchema>;

export async function requestCameraPermission(): Promise<PermissionStatus> {
  if (typeof window === 'undefined') return {} as PermissionStatus;

  try {
    const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return permission;
  } catch (err) {
    return {} as PermissionStatus;
  }
}

export async function openCamera(config: CameraConfig): Promise<MediaStream | null> {
  if (typeof window === 'undefined' || !navigator.mediaDevices) {
    return null;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: config.facingMode,
        width: { ideal: config.width },
        height: { ideal: config.height },
        frameRate: { ideal: config.frameRate },
      },
    });
  } catch (err) {
    console.error('Failed to open camera:', err);
    return null;
  }
}

export async function capturePhoto(stream: MediaStream): Promise<CapturedImage | null> {
  if (typeof window === 'undefined') return null;

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    await new Promise(resolve => setTimeout(resolve, 100));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    const data = canvas.toDataURL('image/jpeg', 0.8);

    return {
      data,
      mimeType: 'image/jpeg',
      timestamp: Date.now(),
      metadata: {
        width: canvas.width,
        height: canvas.height,
        brightness: 128,
      },
    };
  } catch (err) {
    console.error('Failed to capture photo:', err);
    return null;
  }
}

export async function scanDocument(images: CapturedImage[]): Promise<DocumentScanResult | null> {
  try {
    const response = await fetch('/api/mobile/scan-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('Failed to scan document:', err);
    return null;
  }
}

export async function uploadPhoto(image: CapturedImage, purpose: string): Promise<string | null> {
  try {
    const response = await fetch('/api/mobile/upload-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, purpose }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    return result.url;
  } catch (err) {
    console.error('Failed to upload photo:', err);
    return null;
  }
}

export async function stopCamera(stream: MediaStream): Promise<void> {
  stream.getTracks().forEach(track => track.stop());
}
