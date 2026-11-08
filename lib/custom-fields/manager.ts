import { prisma } from "@/lib/prisma";
import { CustomFieldSchema, type CustomField } from "./types";
import { AppError } from "@/lib/errors";

export async function createCustomField(tenantId: string, field: CustomField): Promise<CustomField> {
  const validated = CustomFieldSchema.parse(field);

  const stored = await prisma.customField.create({
    data: {
      tenantId,
      ...validated,
      options: validated.options ? JSON.stringify(validated.options) : null,
      validation: validated.validation ? JSON.stringify(validated.validation) : null,
      conditional: validated.conditional ? JSON.stringify(validated.conditional) : null,
      metadata: validated.metadata ? JSON.stringify(validated.metadata) : null,
    },
  });

  return parseCustomField(stored);
}

export async function updateCustomField(tenantId: string, fieldId: string, updates: Partial<CustomField>): Promise<CustomField> {
  const field = await prisma.customField.findUnique({
    where: { id: fieldId, tenantId },
  });

  if (!field) throw AppError.notFound("Field not found");

  const validated = CustomFieldSchema.partial().parse(updates);

  const updated = await prisma.customField.update({
    where: { id: fieldId },
    data: {
      ...validated,
      options: validated.options ? JSON.stringify(validated.options) : field.options,
      validation: validated.validation ? JSON.stringify(validated.validation) : field.validation,
      conditional: validated.conditional ? JSON.stringify(validated.conditional) : field.conditional,
      metadata: validated.metadata ? JSON.stringify(validated.metadata) : field.metadata,
    },
  });

  return parseCustomField(updated);
}

export async function getCustomField(tenantId: string, fieldId: string): Promise<CustomField> {
  const field = await prisma.customField.findUnique({
    where: { id: fieldId, tenantId },
  });

  if (!field) throw AppError.notFound("Field not found");
  return parseCustomField(field);
}

export async function listCustomFields(tenantId: string): Promise<CustomField[]> {
  const fields = await prisma.customField.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  return fields.map(parseCustomField);
}

export async function deleteCustomField(tenantId: string, fieldId: string): Promise<void> {
  const field = await prisma.customField.findUnique({
    where: { id: fieldId, tenantId },
  });

  if (!field) throw AppError.notFound("Field not found");

  await prisma.customField.delete({ where: { id: fieldId } });
}

export async function searchCustomFields(tenantId: string, query: string): Promise<CustomField[]> {
  const fields = await prisma.customField.findMany({
    where: {
      tenantId,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { label: { contains: query, mode: "insensitive" } },
      ],
    },
  });

  return fields.map(parseCustomField);
}

function parseCustomField(field: any): CustomField {
  return {
    ...field,
    options: field.options ? JSON.parse(field.options) : undefined,
    validation: field.validation ? JSON.parse(field.validation) : undefined,
    conditional: field.conditional ? JSON.parse(field.conditional) : undefined,
    metadata: field.metadata ? JSON.parse(field.metadata) : undefined,
  };
}
