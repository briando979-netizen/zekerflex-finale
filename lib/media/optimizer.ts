import sharp from 'sharp';
import { extname } from 'path';

export interface OptimizationOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
}

export interface OptimizedMedia {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
  size: number;
  mimeType: string;
}

const QUALITY_LEVELS = {
  max: { webp: 95, avif: 90, jpeg: 95 },
  high: { webp: 85, avif: 80, jpeg: 85 },
  medium: { webp: 75, avif: 70, jpeg: 75 },
  low: { webp: 60, avif: 55, jpeg: 60 },
};

export async function optimizeImage(
  buffer: Buffer,
  options: OptimizationOptions = {}
): Promise<OptimizedMedia> {
  const {
    maxWidth = 4096,
    maxHeight = 4096,
    quality = 85,
    format = 'webp',
  } = options;

  let image = sharp(buffer);
  const metadata = await image.metadata();

  const width = Math.min(metadata.width ?? maxWidth, maxWidth);
  const height = Math.min(metadata.height ?? maxHeight, maxHeight);

  image = image.resize(width, height, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  const qualityLevel = quality >= 90 ? 'max' : quality >= 80 ? 'high' : 'medium';
  const q = QUALITY_LEVELS[qualityLevel][format as keyof typeof QUALITY_LEVELS['high']] ?? 85;

  let output;
  if (format === 'webp') {
    output = image.webp({ quality: q, alphaQuality: q });
  } else if (format === 'avif') {
    output = image.avif({ quality: q });
  } else if (format === 'png') {
    output = image.png({ compressionLevel: 9 });
  } else {
    output = image.jpeg({ quality: q, mozjpeg: true });
  }

  const optimized = await output.toBuffer();

  return {
    buffer: optimized,
    format,
    width,
    height,
    size: optimized.length,
    mimeType: `image/${format === 'jpeg' ? 'jpeg' : format}`,
  };
}

export async function upscaleImage(
  buffer: Buffer,
  targetWidth: number
): Promise<Buffer> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  if ((metadata.width ?? 0) >= targetWidth) return buffer;

  const scale = targetWidth / (metadata.width ?? targetWidth);
  const newHeight = Math.round((metadata.height ?? 0) * scale);

  return image
    .resize(targetWidth, newHeight, { fit: 'contain' })
    .toBuffer();
}

export async function optimizeVideo(
  buffer: Buffer,
  options: { bitrate?: string; codec?: 'h265' | 'vp9' } = {}
): Promise<Buffer> {
  // Note: Actual video encoding requires FFmpeg binary
  // This is a placeholder - in production use node-fluent-ffmpeg or similar
  // For now, return buffer as-is with metadata
  return buffer;
}

export async function extractMetadata(buffer: Buffer) {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  return {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    space: metadata.space,
    channels: metadata.channels,
    depth: metadata.depth,
    density: metadata.density,
    hasAlpha: metadata.hasAlpha,
    orientation: metadata.orientation,
    pages: metadata.pages,
    duration: metadata.duration,
  };
}

export function getOptimalFormat(mimeType: string): 'webp' | 'avif' | 'jpeg' {
  if (mimeType.includes('png')) return 'webp';
  if (mimeType.includes('gif')) return 'webp';
  if (mimeType.includes('webp')) return 'avif';
  return 'jpeg';
}
