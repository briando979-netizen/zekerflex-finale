export interface StreamingVariant {
  quality: 'auto' | '360p' | '720p' | '1080p' | '4k';
  bitrate: string;
  codec: string;
  fps: number;
}

const STREAMING_VARIANTS: Record<string, StreamingVariant> = {
  '360p': {
    quality: '360p',
    bitrate: '500k',
    codec: 'h265',
    fps: 24,
  },
  '720p': {
    quality: '720p',
    bitrate: '2500k',
    codec: 'h265',
    fps: 30,
  },
  '1080p': {
    quality: '1080p',
    bitrate: '5000k',
    codec: 'h265',
    fps: 30,
  },
  '4k': {
    quality: '4k',
    bitrate: '15000k',
    codec: 'h265',
    fps: 30,
  },
};

export interface HLSStream {
  mastermPlaylist: string;
  variants: StreamingVariant[];
  thumbnails: string[];
  duration: number;
}

export interface DASHStream {
  mpdManifest: string;
  representations: StreamingVariant[];
  duration: number;
}

export function generateHLSPlaylist(
  baseUrl: string,
  variants: StreamingVariant[],
  duration: number
): string {
  const header = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n';

  const variantLines = variants
    .map((v) => {
      const bitrate = parseInt(v.bitrate);
      return `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate},RESOLUTION=${getResolution(v.quality)}\n${baseUrl}/hls/${v.quality}.m3u8`;
    })
    .join('\n');

  return header + variantLines;
}

export function generateDASHManifest(
  baseUrl: string,
  variants: StreamingVariant[],
  duration: number
): string {
  const availabilityStartTime = new Date().toISOString();

  const representations = variants
    .map((v) => {
      const [width, height] = getResolution(v.quality).split('x').map(Number);
      const bitrate = parseInt(v.bitrate);

      return `
      <Representation id="${v.quality}" mimeType="video/mp4" codecs="${getCodecString(v.codec)}" bandwidth="${bitrate * 1000}" width="${width}" height="${height}">
        <BaseURL>${baseUrl}/dash/${v.quality}.mp4</BaseURL>
      </Representation>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT${duration}S" minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-live-profile:2011">
  <Period>
    <AdaptationSet mimeType="video/mp4" segmentAlignment="true">
      ${representations}
    </AdaptationSet>
  </Period>
</MPD>`;
}

export function getAdaptiveBitrate(
  bandwidth: number,
  isWifi: boolean
): 'auto' | '360p' | '720p' | '1080p' | '4k' {
  // In kilobits per second
  if (bandwidth < 1000) return '360p';
  if (bandwidth < 3000) return '360p';
  if (bandwidth < 5000) return '720p';
  if (bandwidth < 8000) return '1080p';
  return '4k';
}

export function generateThumbnailPreview(
  videoUrl: string,
  timestamps: number[]
): string[] {
  // Returns URLs for preview thumbnails at given timestamps
  // In production, would generate actual thumbnails
  return timestamps.map((t) => `${videoUrl}?t=${t}&thumb=1`);
}

function getResolution(quality: string): string {
  const resolutions: Record<string, string> = {
    '360p': '640x360',
    '720p': '1280x720',
    '1080p': '1920x1080',
    '4k': '3840x2160',
  };
  return resolutions[quality] || '1280x720';
}

function getCodecString(codec: string): string {
  const codecs: Record<string, string> = {
    h265: 'hev1.1.6.L120',
    h264: 'avc1.42e01e',
    vp9: 'vp09.00.10.08',
  };
  return codecs[codec] || 'avc1.42e01e';
}

export class AdaptiveStreamManager {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  generateHLS(duration: number, variants?: StreamingVariant[]): HLSStream {
    const selectedVariants = variants || Object.values(STREAMING_VARIANTS);

    return {
      mastermPlaylist: generateHLSPlaylist(this.baseUrl, selectedVariants, duration),
      variants: selectedVariants,
      thumbnails: generateThumbnailPreview(this.baseUrl, [0, duration / 4, duration / 2, (3 * duration) / 4]),
      duration,
    };
  }

  generateDASH(duration: number, variants?: StreamingVariant[]): DASHStream {
    const selectedVariants = variants || Object.values(STREAMING_VARIANTS);

    return {
      mpdManifest: generateDASHManifest(this.baseUrl, selectedVariants, duration),
      representations: selectedVariants,
      duration,
    };
  }

  selectQuality(bandwidth: number): StreamingVariant {
    const quality = getAdaptiveBitrate(bandwidth, true);
    return STREAMING_VARIANTS[quality];
  }
}
