// ===========================================================================
// Subsystem 5: Content Library — Organize by sector, workflow, skill
// ===========================================================================

import { prisma } from "@/lib/prisma";

export interface LibraryFilter {
  sector?: string;
  workflow?: string;
  role?: string;
  category?: string;
  tags?: string[];
  searchQuery?: string;
}

export interface OrganizedLibrary {
  bySector: Record<string, string[]>;
  byWorkflow: Record<string, string[]>;
  byRole: Record<string, string[]>;
  featured: string[];
}

// Get library organized by sectors
export async function getLibraryBySector(): Promise<Record<string, string[]>> {
  const videos = await prisma.video.findMany({
    where: { sector: { not: null } },
    select: { id: true, sector: true },
  });

  const bySector: Record<string, string[]> = {};

  for (const video of videos) {
    if (video.sector) {
      if (!bySector[video.sector]) {
        bySector[video.sector] = [];
      }
      bySector[video.sector].push(video.id);
    }
  }

  return bySector;
}

// Get library organized by workflows
export async function getLibraryByWorkflow(): Promise<Record<string, string[]>> {
  const videos = await prisma.video.findMany({
    where: { workflow: { not: null } },
    select: { id: true, workflow: true },
  });

  const byWorkflow: Record<string, string[]> = {};

  for (const video of videos) {
    if (video.workflow) {
      if (!byWorkflow[video.workflow]) {
        byWorkflow[video.workflow] = [];
      }
      byWorkflow[video.workflow].push(video.id);
    }
  }

  return byWorkflow;
}

// Get library organized by roles
export async function getLibraryByRole(): Promise<Record<string, string[]>> {
  const videos = await prisma.video.findMany({
    select: { id: true, role: true },
  });

  const byRole: Record<string, string[]> = {};

  for (const video of videos) {
    if (!byRole[video.role]) {
      byRole[video.role] = [];
    }
    byRole[video.role].push(video.id);
  }

  return byRole;
}

// Get complete organized library
export async function getOrganizedLibrary(): Promise<OrganizedLibrary> {
  const [bySector, byWorkflow, byRole, videos] = await Promise.all([
    getLibraryBySector(),
    getLibraryByWorkflow(),
    getLibraryByRole(),
    prisma.video.findMany({
      orderBy: { views: "desc" },
      take: 10,
      select: { id: true },
    }),
  ]);

  return {
    bySector,
    byWorkflow,
    byRole,
    featured: videos.map((v) => v.id),
  };
}

// Search library with filters
export async function searchLibrary(filters: LibraryFilter): Promise<string[]> {
  const where: any = {};

  if (filters.sector) {
    where.sector = filters.sector;
  }

  if (filters.workflow) {
    where.workflow = filters.workflow;
  }

  if (filters.role) {
    where.role = filters.role;
  }

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.tags && filters.tags.length > 0) {
    where.tags = { hasSome: filters.tags };
  }

  if (filters.searchQuery) {
    where.OR = [
      { title: { contains: filters.searchQuery, mode: "insensitive" } },
      { description: { contains: filters.searchQuery, mode: "insensitive" } },
    ];
  }

  const videos = await prisma.video.findMany({
    where,
    select: { id: true },
    orderBy: { views: "desc" },
  });

  return videos.map((v) => v.id);
}

// Get sector curriculum (ordered videos for learning)
export async function getSectorCurriculum(sector: string): Promise<Array<{ id: string; title: string; order: number }>> {
  const videos = await prisma.video.findMany({
    where: { sector },
    select: { id: true, title: true, workflow: true },
    orderBy: { createdAt: "asc" },
  });

  // Order by workflow priority
  const workflowOrder: Record<string, number> = {
    onboarding: 1,
    training: 2,
    support: 3,
    promotion: 4,
    testimonial: 5,
  };

  return videos
    .sort((a, b) => {
      const orderA = workflowOrder[a.workflow ?? ""] ?? 99;
      const orderB = workflowOrder[b.workflow ?? ""] ?? 99;
      return orderA - orderB;
    })
    .map((v, index) => ({
      id: v.id,
      title: v.title,
      order: index + 1,
    }));
}

// Get role-specific learning path
export async function getLearnngPath(role: "employer" | "worker" | "admin"): Promise<Array<{ id: string; title: string; category: string; order: number }>> {
  const workflows: string[] = ["onboarding", "training", "support"];

  const videos: Array<{ id: string; title: string; category: string; order: number }> = [];
  let order = 0;

  for (const workflow of workflows) {
    const workflowVideos = await prisma.video.findMany({
      where: {
        role,
        workflow,
      },
      select: { id: true, title: true, category: true },
      orderBy: { createdAt: "asc" },
    });

    for (const video of workflowVideos) {
      videos.push({
        id: video.id,
        title: video.title,
        category: video.category,
        order: ++order,
      });
    }
  }

  return videos;
}

// Get recommended videos based on tag match
export async function getRecommendedByTags(tags: string[], limit: number = 5): Promise<string[]> {
  const videos = await prisma.video.findMany({
    where: {
      tags: { hasSome: tags },
    },
    select: { id: true },
    orderBy: { views: "desc" },
    take: limit,
  });

  return videos.map((v) => v.id);
}

// Get all available sectors
export async function getAllSectors(): Promise<string[]> {
  const videos = await prisma.video.findMany({
    where: { sector: { not: null } },
    select: { sector: true },
    distinct: ["sector"],
  });

  return videos.map((v) => v.sector).filter((s) => s !== null) as string[];
}

// Get all available workflows
export async function getAllWorkflows(): Promise<string[]> {
  const videos = await prisma.video.findMany({
    where: { workflow: { not: null } },
    select: { workflow: true },
    distinct: ["workflow"],
  });

  return videos.map((v) => v.workflow).filter((w) => w !== null) as string[];
}

// Get all available tags
export async function getAllTags(): Promise<string[]> {
  const videos = await prisma.video.findMany({
    select: { tags: true },
  });

  const tagSet = new Set<string>();
  for (const video of videos) {
    for (const tag of video.tags) {
      tagSet.add(tag);
    }
  }

  return Array.from(tagSet).sort();
}

// Get library statistics
export async function getLibraryStats(): Promise<{
  totalVideos: number;
  bySector: Record<string, number>;
  byWorkflow: Record<string, number>;
  byRole: Record<string, number>;
  byCategory: Record<string, number>;
  totalTags: number;
  totalWatchTime: number;
}> {
  const videos = await prisma.video.findMany({
    select: { sector: true, workflow: true, role: true, category: true, tags: true, watchTime: true },
  });

  const stats = {
    totalVideos: videos.length,
    bySector: {} as Record<string, number>,
    byWorkflow: {} as Record<string, number>,
    byRole: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
    totalTags: new Set<string>(),
    totalWatchTime: 0,
  };

  for (const video of videos) {
    if (video.sector) stats.bySector[video.sector] = (stats.bySector[video.sector] ?? 0) + 1;
    if (video.workflow) stats.byWorkflow[video.workflow] = (stats.byWorkflow[video.workflow] ?? 0) + 1;
    stats.byRole[video.role] = (stats.byRole[video.role] ?? 0) + 1;
    stats.byCategory[video.category] = (stats.byCategory[video.category] ?? 0) + 1;
    for (const tag of video.tags) {
      (stats.totalTags as Set<string>).add(tag);
    }
    stats.totalWatchTime += video.watchTime;
  }

  return {
    ...stats,
    totalTags: (stats.totalTags as Set<string>).size,
  };
}
