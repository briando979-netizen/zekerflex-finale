import { prisma } from "@/lib/prisma";

// ===========================================================================
// Subsystem 1: Video Management — Upload, store, organize videos
// ===========================================================================

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
  tags: string[];
  sector?: "construction" | "hospitality" | "logistics" | "healthcare" | "retail" | "other";
  workflow?: "onboarding" | "training" | "support" | "promotion" | "testimonial";
  playlist?: string;
  watermarkEnabled: boolean;
  captionsRequired: boolean;
  gdprCompliant: boolean;
  createdAt: Date;
  views: number;
  watchTime: number;
}

export interface CreateVideoInput {
  title: string;
  description: string;
  category: "tutorial" | "walkthrough" | "guide" | "story" | "faq";
  role: "general" | "employer" | "worker" | "admin";
  durationSeconds: number;
  thumbnailUrl: string;
  hostedOn: "vimeo" | "youtube" | "self-hosted";
  hostId: string;
  qualities?: ("360p" | "720p" | "1080p" | "4K")[];
  subtitles?: { language: string; url: string }[];
  tags?: string[];
  sector?: "construction" | "hospitality" | "logistics" | "healthcare" | "retail" | "other";
  workflow?: "onboarding" | "training" | "support" | "promotion" | "testimonial";
  playlist?: string;
  watermarkEnabled?: boolean;
  captionsRequired?: boolean;
  gdprCompliant?: boolean;
}

// Create a new video
export async function createVideo(data: CreateVideoInput): Promise<VideoMetadata> {
  const video = await prisma.video.create({
    data: {
      ...data,
      qualities: data.qualities ?? ["720p", "1080p"],
      subtitles: data.subtitles ?? [],
      tags: data.tags ?? [],
      watermarkEnabled: data.watermarkEnabled ?? true,
      captionsRequired: data.captionsRequired ?? true,
      gdprCompliant: data.gdprCompliant ?? true,
      views: 0,
      watchTime: 0,
    },
  });

  return formatVideo(video);
}

// Get video by ID
export async function getVideoById(id: string): Promise<VideoMetadata | null> {
  const video = await prisma.video.findUnique({
    where: { id },
  });
  return video ? formatVideo(video) : null;
}

// Update video metadata
export async function updateVideo(id: string, data: Partial<CreateVideoInput>): Promise<VideoMetadata> {
  const video = await prisma.video.update({
    where: { id },
    data: {
      ...data,
      qualities: data.qualities ?? undefined,
      subtitles: data.subtitles ?? undefined,
      tags: data.tags ?? undefined,
    },
  });
  return formatVideo(video);
}

// Delete video
export async function deleteVideo(id: string): Promise<void> {
  await prisma.video.delete({
    where: { id },
  });
}

// Get videos by role
export async function getVideosByRole(role: string): Promise<VideoMetadata[]> {
  const videos = await prisma.video.findMany({
    where: { role },
    orderBy: { createdAt: "desc" },
  });
  return videos.map(formatVideo);
}

// Get videos by category
export async function getVideosByCategory(category: string): Promise<VideoMetadata[]> {
  const videos = await prisma.video.findMany({
    where: { category },
    orderBy: { views: "desc" },
  });
  return videos.map(formatVideo);
}

// Get videos by sector
export async function getVideosBySector(sector: string): Promise<VideoMetadata[]> {
  const videos = await prisma.video.findMany({
    where: { sector },
    orderBy: { createdAt: "desc" },
  });
  return videos.map(formatVideo);
}

// Get videos by workflow
export async function getVideosByWorkflow(workflow: string): Promise<VideoMetadata[]> {
  const videos = await prisma.video.findMany({
    where: { workflow },
    orderBy: { createdAt: "desc" },
  });
  return videos.map(formatVideo);
}

// Get videos by tag
export async function getVideosByTag(tag: string): Promise<VideoMetadata[]> {
  const videos = await prisma.video.findMany({
    where: { tags: { has: tag } },
    orderBy: { views: "desc" },
  });
  return videos.map(formatVideo);
}

// Search videos by title and description
export async function searchVideos(query: string): Promise<VideoMetadata[]> {
  const videos = await prisma.video.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { tags: { has: query } },
      ],
    },
    orderBy: { views: "desc" },
  });
  return videos.map(formatVideo);
}

// Get all videos with pagination
export async function getAllVideos(skip: number = 0, take: number = 20): Promise<{ total: number; videos: VideoMetadata[] }> {
  const [total, videos] = await Promise.all([
    prisma.video.count(),
    prisma.video.findMany({
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { total, videos: videos.map(formatVideo) };
}

// Get popular videos
export async function getPopularVideos(limit: number = 10): Promise<VideoMetadata[]> {
  const videos = await prisma.video.findMany({
    orderBy: { views: "desc" },
    take: limit,
  });
  return videos.map(formatVideo);
}

// Get most watched videos
export async function getMostWatchedVideos(limit: number = 10): Promise<VideoMetadata[]> {
  const videos = await prisma.video.findMany({
    orderBy: { watchTime: "desc" },
    take: limit,
  });
  return videos.map(formatVideo);
}

// Format video for response
function formatVideo(video: any): VideoMetadata {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    category: video.category,
    role: video.role,
    durationSeconds: video.durationSeconds,
    thumbnailUrl: video.thumbnailUrl,
    hostedOn: video.hostedOn,
    hostId: video.hostId,
    qualities: video.qualities ?? [],
    subtitles: video.subtitles ?? [],
    tags: video.tags ?? [],
    sector: video.sector,
    workflow: video.workflow,
    playlist: video.playlist,
    watermarkEnabled: video.watermarkEnabled,
    captionsRequired: video.captionsRequired,
    gdprCompliant: video.gdprCompliant,
    createdAt: video.createdAt,
    views: video.views,
    watchTime: video.watchTime,
  };
}
