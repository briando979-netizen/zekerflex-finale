export interface HostingConfig {
  provider: "vimeo" | "youtube" | "self-hosted";
  hostId: string;
  apiKey?: string;
  apiSecret?: string;
}

export function getVideoUrl(hosting: HostingConfig): string {
  switch (hosting.provider) {
    case "vimeo":
      return `https://vimeo.com/${hosting.hostId}`;
    case "youtube":
      return `https://www.youtube.com/watch?v=${hosting.hostId}`;
    case "self-hosted":
      return `/media/videos/${hosting.hostId}`;
  }
}

export function getEmbedUrl(hosting: HostingConfig): string {
  switch (hosting.provider) {
    case "vimeo":
      return `https://player.vimeo.com/video/${hosting.hostId}`;
    case "youtube":
      return `https://www.youtube.com/embed/${hosting.hostId}`;
    case "self-hosted":
      return `/player/${hosting.hostId}`;
  }
}

export function getQualityUrl(hosting: HostingConfig, quality: string): string {
  if (hosting.provider === "self-hosted") {
    return `/media/videos/${hosting.hostId}/${quality}.m3u8`;
  }
  return getEmbedUrl(hosting);
}

export async function validateHostId(provider: string, hostId: string): Promise<boolean> {
  try {
    if (provider === "vimeo") {
      const res = await fetch(`https://api.vimeo.com/videos/${hostId}`, { method: "HEAD" });
      return res.ok;
    }
    if (provider === "youtube") {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${hostId}&format=json`);
      return res.ok;
    }
    return true;
  } catch {
    return false;
  }
}
