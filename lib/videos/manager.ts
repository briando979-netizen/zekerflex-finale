import { prisma } from "@/lib/prisma";

export interface VideoMetadata {
  id: string;
  title: string;
  description: string;
  category: "tutorial" | "walkthrough" | "guide" | "story" | "faq";
  role: "general" | "employer" | "worker" | "admin";
  durationSeconds: number;
  thumbnailUrl: string;
  hostedOn: "vimeo" | "youtube" | "self-hosted";
  hostId: string;
  qualities: ("360p" | "720p" | "1080p" | "4K")[];
  subtitles: { language: string; url: string }[];
  playlist?: string;
  createdAt: Date;
  views: number;
  watchTime: number;
}

export async function createVideo(data: Omit<VideoMetadata, "id" | "createdAt" | "views" | "watchTime">) {
  return await prisma.video.create({
    data: {
      ...data,
      views: 0,
      watchTime: 0,
    },
  });
}

export async function getVideosByRole(role: string) {
  return await prisma.video.findMany({
    where: { role },
    orderBy: { createdAt: "desc" },
  });
}

export async function getVideosByCategory(category: string) {
  return await prisma.video.findMany({
    where: { category },
    orderBy: { views: "desc" },
  });
}

export async function trackVideoView(videoId: string, watchTimeSeconds: number) {
  return await prisma.video.update({
    where: { id: videoId },
    data: {
      views: { increment: 1 },
      watchTime: { increment: watchTimeSeconds },
    },
  });
}

export async function getPopularVideos(limit = 10) {
  return await prisma.video.findMany({
    orderBy: { views: "desc" },
    take: limit,
  });
}

export async function searchVideos(query: string) {
  return await prisma.video.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ],
    },
  });
}
