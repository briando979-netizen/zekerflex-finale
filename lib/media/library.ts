import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';

export interface MediaLibraryItem {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  url: string;
  type: 'image' | 'video' | 'audio';
  mimeType: string;
  width?: number;
  height?: number;
  duration?: number;
  size: number;
  tags: string[];
  collections: string[];
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function createMediaLibraryItem(
  tenantId: string,
  item: {
    name: string;
    description?: string;
    url: string;
    type: 'image' | 'video' | 'audio';
    mimeType: string;
    width?: number;
    height?: number;
    duration?: number;
    size: number;
    tags?: string[];
    collections?: string[];
  }
): Promise<MediaLibraryItem> {
  const created = await prisma.galleryItem.create({
    data: {
      galleryId: tenantId,
      name: item.name,
      description: item.description,
      url: item.url,
      type: item.type,
      mimeType: item.mimeType,
      width: item.width,
      height: item.height,
      duration: item.duration,
      size: item.size,
      tags: item.tags || [],
      collections: item.collections || [],
      viewCount: 0,
    },
  });

  return toMediaLibraryItem(created);
}

export async function getMediaLibraryItems(
  tenantId: string,
  filters?: { type?: string; tags?: string[]; collections?: string[] }
) {
  const where: any = { galleryId: tenantId };

  if (filters?.type) where.type = filters.type;
  if (filters?.tags?.length) {
    where.tags = { hasSome: filters.tags };
  }
  if (filters?.collections?.length) {
    where.collections = { hasSome: filters.collections };
  }

  const items = await prisma.galleryItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return items.map(toMediaLibraryItem);
}

export async function searchMediaLibrary(
  tenantId: string,
  query: string
) {
  const items = await prisma.galleryItem.findMany({
    where: {
      galleryId: tenantId,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { hasSome: [query] } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  return items.map(toMediaLibraryItem);
}

export async function updateMediaLibraryItem(
  itemId: string,
  updates: {
    name?: string;
    description?: string;
    tags?: string[];
    collections?: string[];
  }
) {
  const updated = await prisma.galleryItem.update({
    where: { id: itemId },
    data: updates,
  });

  return toMediaLibraryItem(updated);
}

export async function deleteMediaLibraryItem(itemId: string) {
  await prisma.galleryItem.delete({
    where: { id: itemId },
  });
}

export async function incrementViewCount(itemId: string) {
  const item = await prisma.galleryItem.findUnique({
    where: { id: itemId },
  });

  if (!item) throw AppError.notFound('Media item not found');

  await prisma.galleryItem.update({
    where: { id: itemId },
    data: { viewCount: (item.viewCount ?? 0) + 1 },
  });
}

export async function detectDuplicates(
  tenantId: string,
  hash: string
) {
  return prisma.galleryItem.findMany({
    where: { galleryId: tenantId, contentHash: hash },
  });
}

function toMediaLibraryItem(item: any): MediaLibraryItem {
  return {
    id: item.id,
    tenantId: item.galleryId,
    name: item.name,
    description: item.description,
    url: item.url,
    type: item.type,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    duration: item.duration,
    size: item.size,
    tags: item.tags || [],
    collections: item.collections || [],
    viewCount: item.viewCount || 0,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
