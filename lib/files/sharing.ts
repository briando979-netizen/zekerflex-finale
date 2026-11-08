import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const fileUploadSchema = z.object({
  channelId: z.string(),
  name: z.string().min(1).max(255),
  type: z.string(),
  size: z.number().min(1),
  path: z.string(),
  folder: z.string().optional(),
});

export type FileInput = z.infer<typeof fileUploadSchema>;

export async function uploadFile(userId: string, data: FileInput) {
  const validated = fileUploadSchema.parse(data);
  const file = await prisma.sharedFile.create({
    data: {
      channelId: validated.channelId,
      uploadedBy: userId,
      name: validated.name,
      type: validated.type,
      size: validated.size,
      path: validated.path,
      folder: validated.folder || "root",
      downloads: 0,
    },
  });
  return file;
}

export async function getFile(fileId: string) {
  const file = await prisma.sharedFile.findUnique({
    where: { id: fileId },
    include: { uploader: { select: { id: true, email: true } } },
  });
  if (!file) throw AppError.notFound("File not found");
  return file;
}

export async function listChannelFiles(channelId: string, folder = "root") {
  return prisma.sharedFile.findMany({
    where: { channelId, folder },
    orderBy: { createdAt: "desc" },
  });
}

export async function listFolders(channelId: string) {
  const files = await prisma.sharedFile.findMany({
    where: { channelId },
    select: { folder: true },
    distinct: ["folder"],
  });
  return files.map((f) => f.folder).filter(Boolean);
}

export async function recordDownload(fileId: string) {
  const file = await getFile(fileId);
  return prisma.sharedFile.update({
    where: { id: fileId },
    data: { downloads: file.downloads + 1, lastAccessedAt: new Date() },
  });
}

export async function deleteFile(fileId: string, userId: string) {
  const file = await getFile(fileId);
  if (file.uploadedBy !== userId) throw AppError.forbidden("Cannot delete others' files");
  return prisma.sharedFile.delete({ where: { id: fileId } });
}

export async function setFilePermissions(fileId: string, userId: string, permissions: string[]) {
  const file = await getFile(fileId);
  if (file.uploadedBy !== userId) throw AppError.forbidden("Cannot change permissions");
  return prisma.sharedFile.update({
    where: { id: fileId },
    data: { permissions },
  });
}

export async function getFileVersion(fileId: string, versionId: string) {
  return prisma.fileVersion.findFirst({
    where: { fileId, id: versionId },
  });
}

export async function listFileVersions(fileId: string) {
  return prisma.fileVersion.findMany({
    where: { fileId },
    orderBy: { createdAt: "desc" },
  });
}

export async function searchFiles(channelId: string, query: string) {
  return prisma.sharedFile.findMany({
    where: { channelId, name: { contains: query, mode: "insensitive" } },
    take: 20,
  });
}
