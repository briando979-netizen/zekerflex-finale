import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const crmContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).default({}),
});

export type CrmContactInput = z.infer<typeof crmContactSchema>;

export async function createContact(
  tenantId: string,
  createdBy: string,
  data: CrmContactInput
) {
  return prisma.crmContact.create({
    data: {
      tenantId,
      createdBy,
      ...crmContactSchema.parse(data),
    },
  });
}

export async function getContact(id: string, tenantId: string) {
  return prisma.crmContact.findFirst({
    where: { id, tenantId },
    include: { deals: true, activities: true, notes: true },
  });
}

export async function listContacts(tenantId: string, search?: string) {
  return prisma.crmContact.findMany({
    where: {
      tenantId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
        ],
      }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function updateContact(
  id: string,
  tenantId: string,
  data: Partial<CrmContactInput>
) {
  return prisma.crmContact.update({
    where: { id_tenantId: { id, tenantId } },
    data: crmContactSchema.partial().parse(data),
  });
}

export async function deleteContact(id: string, tenantId: string) {
  return prisma.crmContact.delete({
    where: { id_tenantId: { id, tenantId } },
  });
}

export async function getContactHistory(contactId: string, tenantId: string) {
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, tenantId },
    include: {
      activities: { orderBy: { createdAt: "desc" } },
      deals: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  return contact;
}
