import { prisma } from "@/lib/prisma";
import { z } from "zod";

const catalogSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  dataType: z.enum(["table", "view", "dataset", "api", "stream"]),
  owner: z.string(),
  tags: z.array(z.string()),
  classification: z.enum(["public", "internal", "confidential", "restricted"]),
});

export async function createDataAsset(data: z.infer<typeof catalogSchema>) {
  const validated = catalogSchema.parse(data);
  return prisma.dataAsset.create({
    data: {
      ...validated,
      lineage: JSON.stringify({}),
      qualityScore: 0,
    },
  });
}

export async function getDataAsset(id: string) {
  return prisma.dataAsset.findUnique({ where: { id } });
}

export async function updateDataAsset(id: string, data: Partial<z.infer<typeof catalogSchema>>) {
  const validated = catalogSchema.partial().parse(data);
  return prisma.dataAsset.update({ where: { id }, data: validated });
}

export async function searchDataAssets(query: string, classification?: string) {
  return prisma.dataAsset.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { tags: { has: query } },
      ],
      ...(classification && { classification }),
    },
    take: 50,
  });
}

export async function getDataLineage(assetId: string) {
  const asset = await prisma.dataAsset.findUnique({ where: { id: assetId } });
  return asset ? JSON.parse(asset.lineage || "{}") : null;
}

export async function updateDataLineage(assetId: string, lineage: Record<string, unknown>) {
  return prisma.dataAsset.update({
    where: { id: assetId },
    data: { lineage: JSON.stringify(lineage) },
  });
}
