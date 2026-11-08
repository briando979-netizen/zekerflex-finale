import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";
import crypto from "crypto";

const shareSchema = z.object({
  documentId: z.string(),
  email: z.string().email().optional(),
  role: z.enum(["viewer", "commenter", "editor"]),
  expiresAt: z.coerce.date().optional(),
});

type Share = z.infer<typeof shareSchema>;

export async function shareDocument(tenantId: string, share: Share) {
  const validated = shareSchema.parse(share);

  const doc = await prisma.document.findUnique({
    where: { id: validated.documentId },
  });

  if (!doc || doc.tenantId !== tenantId) {
    throw AppError.notFound("Document not found");
  }

  const token = crypto.randomBytes(32).toString("hex");

  return prisma.documentShare.create({
    data: {
      ...validated,
      documentId: validated.documentId,
      token,
    },
  });
}

export async function createPublicLink(
  tenantId: string,
  documentId: string,
  role: "viewer" | "commenter" = "viewer",
  expiresAt?: Date
) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc || doc.tenantId !== tenantId) {
    throw AppError.notFound("Document not found");
  }

  const token = crypto.randomBytes(16).toString("hex");

  return prisma.documentPublicLink.create({
    data: {
      documentId,
      token,
      role,
      expiresAt,
    },
  });
}

export async function getPublicDocument(token: string) {
  const link = await prisma.documentPublicLink.findUnique({
    where: { token },
    include: { document: true },
  });

  if (!link) {
    throw AppError.notFound("Link not found");
  }

  if (link.expiresAt && link.expiresAt < new Date()) {
    throw AppError.forbidden("Link has expired");
  }

  // Track view
  await prisma.documentPublicLinkView.create({
    data: {
      linkId: link.id,
      ipAddress: "unknown",
    },
  });

  return link;
}

export async function revokeShare(tenantId: string, shareId: string) {
  const share = await prisma.documentShare.findUnique({
    where: { id: shareId },
    include: { document: true },
  });

  if (!share || share.document.tenantId !== tenantId) {
    throw AppError.forbidden("Cannot revoke this share");
  }

  return prisma.documentShare.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
}

export async function revokePublicLink(tenantId: string, linkId: string) {
  const link = await prisma.documentPublicLink.findUnique({
    where: { id: linkId },
    include: { document: true },
  });

  if (!link || link.document.tenantId !== tenantId) {
    throw AppError.forbidden("Cannot revoke this link");
  }

  return prisma.documentPublicLink.delete({
    where: { id: linkId },
  });
}

export async function listShares(tenantId: string, documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc || doc.tenantId !== tenantId) {
    throw AppError.notFound("Document not found");
  }

  return prisma.documentShare.findMany({
    where: { documentId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPublicLinks(tenantId: string, documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc || doc.tenantId !== tenantId) {
    throw AppError.notFound("Document not found");
  }

  return prisma.documentPublicLink.findMany({
    where: { documentId },
    include: { _count: { select: { views: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSharePermission(
  documentId: string,
  userId: string
): Promise<"owner" | "editor" | "commenter" | "viewer" | null> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!doc) return null;

  if (doc.uploadedBy === userId) {
    return "owner";
  }

  const share = await prisma.documentShare.findFirst({
    where: {
      documentId,
      email: { not: undefined },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  return share?.role ?? null;
}

export async function trackDownload(
  linkId: string,
  ipAddress: string
) {
  return prisma.documentDownload.create({
    data: {
      linkId,
      ipAddress,
    },
  });
}
