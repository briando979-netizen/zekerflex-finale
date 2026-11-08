import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const documentSchema = z.object({
  name: z.string().min(1),
  size: z.number().positive(),
  mimeType: z.string(),
  path: z.string(),
  folderId: z.string().optional(),
});

type Document = z.infer<typeof documentSchema>;

export async function uploadDocument(
  tenantId: string,
  userId: string,
  doc: Document
) {
  const validated = documentSchema.parse(doc);

  const created = await prisma.document.create({
    data: {
      ...validated,
      tenantId,
      uploadedBy: userId,
      versions: {
        create: {
          size: validated.size,
          path: validated.path,
          mimeType: validated.mimeType,
          createdBy: userId,
        },
      },
    },
    include: { versions: true },
  });

  return created;
}

export async function listDocuments(tenantId: string, folderId?: string) {
  return prisma.document.findMany({
    where: { tenantId, folderId: folderId || null },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDocument(tenantId: string, documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });

  if (!doc || doc.tenantId !== tenantId) {
    throw AppError.notFound("Document not found");
  }

  return doc;
}

export async function updateDocumentPermissions(
  tenantId: string,
  documentId: string,
  permissions: { role: string; userId: string }[]
) {
  const doc = await getDocument(tenantId, documentId);

  return prisma.document.update({
    where: { id: documentId },
    data: {
      permissions: {
        deleteMany: {},
        create: permissions.map((p) => ({
          role: p.role,
          userId: p.userId,
        })),
      },
    },
  });
}

export async function archiveDocument(tenantId: string, documentId: string) {
  const doc = await getDocument(tenantId, documentId);

  return prisma.document.update({
    where: { id: documentId },
    data: { archived: true, archivedAt: new Date() },
  });
}

export async function createFolder(
  tenantId: string,
  name: string,
  parentId?: string
) {
  return prisma.documentFolder.create({
    data: { tenantId, name, parentId },
  });
}

export async function listFolders(tenantId: string, parentId?: string) {
  return prisma.documentFolder.findMany({
    where: { tenantId, parentId: parentId || null },
    orderBy: { name: "asc" },
  });
}
