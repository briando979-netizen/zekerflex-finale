import { optimizeImage, upscaleImage, OptimizedMedia } from '@/lib/media/optimizer';
import { AppError } from '@/lib/errors';

export interface HDMediaOptions {
  autoUpscale?: boolean;
  targetResolution?: '720p' | '1080p' | '4k';
  quality?: 'lossless' | 'high' | 'medium' | 'low';
  format?: 'webp' | 'avif' | 'jpeg';
}

export interface PreparedHDMedia {
  buffer: Buffer;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  quality: string;
}

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

export async function prepareHDMediaForWhatsApp(
  buffer: Buffer,
  mediaType: 'image' | 'video',
  options: HDMediaOptions = {}
): Promise<PreparedHDMedia> {
  const {
    autoUpscale = true,
    targetResolution = '1080p',
    quality = 'high',
    format = 'webp',
  } = options;

  if (mediaType === 'image') {
    return prepareHDImage(buffer, targetResolution, quality, format, autoUpscale);
  } else {
    return prepareHDVideo(buffer, targetResolution, quality);
  }
}

async function prepareHDImage(
  buffer: Buffer,
  targetResolution: string,
  quality: string,
  format: string,
  autoUpscale: boolean
): Promise<PreparedHDMedia> {
  const target = RESOLUTION_MAP[targetResolution] || RESOLUTION_MAP['1080p'];

  let processedBuffer = buffer;

  // Upscale if needed
  if (autoUpscale) {
    processedBuffer = await upscaleImage(buffer, target.width);
  }

  // Optimize
  const qualityMap: Record<string, number> = {
    lossless: 95,
    high: 85,
    medium: 75,
    low: 60,
  };

  const optimized = await optimizeImage(processedBuffer, {
    maxWidth: target.width,
    maxHeight: target.height,
    quality: qualityMap[quality] || 85,
    format: format as 'webp' | 'avif' | 'jpeg',
  });

  return {
    buffer: optimized.buffer,
    mimeType: optimized.mimeType,
    size: optimized.size,
    width: optimized.width,
    height: optimized.height,
    quality,
  };
}

async function prepareHDVideo(
  buffer: Buffer,
  targetResolution: string,
  quality: string
): Promise<PreparedHDMedia> {
  // Video preprocessing - in production would use FFmpeg
  // For now, validate and return metadata

  if (buffer.length > 100 * 1024 * 1024) {
    throw AppError.validation('Video file too large (max 100MB)');
  }

  const target = RESOLUTION_MAP[targetResolution] || RESOLUTION_MAP['1080p'];

  return {
    buffer,
    mimeType: 'video/mp4',
    size: buffer.length,
    width: target.width,
    height: target.height,
    quality,
  };
}

export function getHDMediaQuality(fileSize: number): 'lossless' | 'high' | 'medium' | 'low' {
  // Auto-select quality based on file size
  if (fileSize < 1 * 1024 * 1024) return 'lossless'; // < 1MB
  if (fileSize < 5 * 1024 * 1024) return 'high'; // < 5MB
  if (fileSize < 20 * 1024 * 1024) return 'medium'; // < 20MB
  return 'low'; // >= 20MB
}

export async function createHDMediaVariants(
  buffer: Buffer,
  mediaType: 'image' | 'video'
): Promise<PreparedHDMedia[]> {
  const resolutions = ['720p', '1080p', '4k'] as const;
  const variants: PreparedHDMedia[] = [];

  for (const resolution of resolutions) {
    try {
      const variant = await prepareHDMediaForWhatsApp(buffer, mediaType, {
        targetResolution: resolution,
        quality: 'high',
      });
      variants.push(variant);
    } catch (err) {
      console.error(`Failed to create ${resolution} variant:`, err);
    }
  }

  return variants;
}

export function selectOptimalVariant(
  variants: PreparedHDMedia[],
  bandwidth: number,
  preferQuality: boolean = false
): PreparedHDMedia {
  if (preferQuality) {
    // Return highest quality that fits bandwidth
    const suitable = variants.filter((v) => v.size <= (bandwidth / 8) * 10); // 10 seconds buffer
    return suitable[suitable.length - 1] || variants[variants.length - 1];
  }

  // Return best quality within bandwidth
  let best = variants[0];
  for (const v of variants) {
    if (v.size <= (bandwidth / 8) * 10 && v.width * v.height > best.width * best.height) {
      best = v;
    }
  }
  return best;
}

export interface HDMediaUploadSession {
  sessionId: string;
  mediaType: 'image' | 'video';
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: Set<number>;
  buffer: Buffer;
  createdAt: Date;
}

const uploadSessions = new Map<string, HDMediaUploadSession>();

export function createUploadSession(
  mediaType: 'image' | 'video',
  totalSize: number,
  chunkSize: number = 5 * 1024 * 1024 // 5MB chunks
): HDMediaUploadSession {
  const sessionId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const totalChunks = Math.ceil(totalSize / chunkSize);

  const session: HDMediaUploadSession = {
    sessionId,
    mediaType,
    chunkSize,
    totalChunks,
    uploadedChunks: new Set(),
    buffer: Buffer.alloc(totalSize),
    createdAt: new Date(),
  };

  uploadSessions.set(sessionId, session);

  // Auto-cleanup after 1 hour
  setTimeout(() => uploadSessions.delete(sessionId), 3600000);

  return session;
}

export function uploadChunk(
  sessionId: string,
  chunkIndex: number,
  chunkData: Buffer
): { progress: number; complete: boolean } {
  const session = uploadSessions.get(sessionId);
  if (!session) throw AppError.notFound('Upload session not found');

  const offset = chunkIndex * session.chunkSize;
  chunkData.copy(session.buffer, offset);
  session.uploadedChunks.add(chunkIndex);

  const progress = (session.uploadedChunks.size / session.totalChunks) * 100;
  const complete = session.uploadedChunks.size === session.totalChunks;

  return { progress, complete };
}

export function getUploadedChunks(sessionId: string): number[] {
  const session = uploadSessions.get(sessionId);
  if (!session) throw AppError.notFound('Upload session not found');
  return Array.from(session.uploadedChunks);
}

export function finalizeUpload(sessionId: string): Buffer {
  const session = uploadSessions.get(sessionId);
  if (!session) throw AppError.notFound('Upload session not found');
  if (session.uploadedChunks.size !== session.totalChunks) {
    throw AppError.validation('Not all chunks uploaded');
  }

  const buffer = session.buffer;
  uploadSessions.delete(sessionId);
  return buffer;
}
