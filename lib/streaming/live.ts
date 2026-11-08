import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

export interface StreamConfig {
  rtmpUrl: string;
  hlsUrl: string;
  dashUrl: string;
  bitrates: { video: number; audio: number }[];
  lowLatency: boolean;
  healthCheckInterval: number;
}

export interface StreamHealth {
  status: "healthy" | "degraded" | "offline";
  bitrate: number;
  fps: number;
  latency: number;
  bandwidth: number;
}

export async function createLiveStream(userId: string, title: string, description: string) {
  const streamKey = nanoid(32);
  const ingestUrl = `rtmp://stream.example.com/live/${streamKey}`;

  const stream = await prisma.liveStream.create({
    data: {
      userId,
      title,
      description,
      streamKey,
      ingestUrl,
      status: "offline",
      viewerCount: 0,
      recordingEnabled: true,
    },
  });

  return {
    id: stream.id,
    streamKey,
    ingestUrl,
    playbackUrls: {
      hls: `https://stream.example.com/hls/${stream.id}/master.m3u8`,
      dash: `https://stream.example.com/dash/${stream.id}/manifest.mpd`,
    },
  };
}

export async function startStream(streamId: string) {
  return await prisma.liveStream.update({
    where: { id: streamId },
    data: {
      status: "live",
      startedAt: new Date(),
      viewerCount: 0,
    },
  });
}

export async function endStream(streamId: string) {
  const stream = await prisma.liveStream.update({
    where: { id: streamId },
    data: {
      status: "offline",
      endedAt: new Date(),
    },
  });

  if (stream.recordingEnabled) {
    await prisma.streamRecording.create({
      data: {
        streamId,
        title: `Recording: ${stream.title}`,
        recordedAt: stream.startedAt!,
        duration: Math.floor((Date.now() - stream.startedAt!.getTime()) / 1000),
        status: "processing",
      },
    });
  }

  return stream;
}

export async function updateStreamHealth(streamId: string, health: StreamHealth) {
  return await prisma.liveStream.update({
    where: { id: streamId },
    data: {
      currentBitrate: health.bitrate,
      currentFps: health.fps,
      currentLatency: health.latency,
      lastHealthCheck: new Date(),
    },
  });
}

export async function getStreamConfig(streamId: string): Promise<StreamConfig> {
  return {
    rtmpUrl: `rtmp://stream.example.com/live`,
    hlsUrl: `https://stream.example.com/hls/${streamId}/master.m3u8`,
    dashUrl: `https://stream.example.com/dash/${streamId}/manifest.mpd`,
    bitrates: [
      { video: 500, audio: 128 },
      { video: 1000, audio: 128 },
      { video: 2500, audio: 128 },
      { video: 5000, audio: 128 },
    ],
    lowLatency: true,
    healthCheckInterval: 10000,
  };
}

export async function setViewerCount(streamId: string, count: number) {
  return await prisma.liveStream.update({
    where: { id: streamId },
    data: { viewerCount: count },
  });
}
