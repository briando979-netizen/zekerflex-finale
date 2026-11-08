import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { FormField, FormSection } from "@/lib/custom-fields/types";

export interface FormDefinition {
  id: string;
  tenantId: string;
  name: string;
  title: string;
  description?: string;
  fields: FormField[];
  sections: FormSection[];
  settings: FormSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormSettings {
  multiStep?: boolean;
  showProgressBar?: boolean;
  confirmationMessage?: string;
  redirectUrl?: string;
  collectIp?: boolean;
  collectTimestamp?: boolean;
  allowDuplicates?: boolean;
  requiredFields?: string[];
}

const FormSettingsSchema = z.object({
  multiStep: z.boolean().optional(),
  showProgressBar: z.boolean().optional(),
  confirmationMessage: z.string().optional(),
  redirectUrl: z.string().url().optional(),
  collectIp: z.boolean().default(true),
  collectTimestamp: z.boolean().default(true),
  allowDuplicates: z.boolean().default(false),
  requiredFields: z.array(z.string()).optional(),
});

export async function createForm(tenantId: string, data: {
  name: string;
  title: string;
  description?: string;
  fields: FormField[];
  sections?: FormSection[];
  settings?: FormSettings;
}): Promise<FormDefinition> {
  const settings = FormSettingsSchema.parse(data.settings ?? {});

  const form = await prisma.form.create({
    data: {
      tenantId,
      name: data.name,
      title: data.title,
      description: data.description,
      fields: JSON.stringify(data.fields),
      sections: JSON.stringify(data.sections ?? []),
      settings: JSON.stringify(settings),
    },
  });

  return parseFormDefinition(form);
}

export async function updateForm(tenantId: string, formId: string, updates: Partial<Omit<FormDefinition, "id" | "tenantId" | "createdAt" | "updatedAt">>): Promise<FormDefinition> {
  const form = await prisma.form.findUnique({
    where: { id: formId, tenantId },
  });

  if (!form) throw AppError.notFound("Form not found");

  const updated = await prisma.form.update({
    where: { id: formId },
    data: {
      name: updates.name ?? form.name,
      title: updates.title ?? form.title,
      description: updates.description ?? form.description,
      fields: updates.fields ? JSON.stringify(updates.fields) : form.fields,
      sections: updates.sections ? JSON.stringify(updates.sections) : form.sections,
      settings: updates.settings ? JSON.stringify(updates.settings) : form.settings,
    },
  });

  return parseFormDefinition(updated);
}

export async function getForm(tenantId: string, formId: string): Promise<FormDefinition> {
  const form = await prisma.form.findUnique({
    where: { id: formId, tenantId },
  });

  if (!form) throw AppError.notFound("Form not found");
  return parseFormDefinition(form);
}

export async function listForms(tenantId: string): Promise<FormDefinition[]> {
  const forms = await prisma.form.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });

  return forms.map(parseFormDefinition);
}

export async function deleteForm(tenantId: string, formId: string): Promise<void> {
  const form = await prisma.form.findUnique({
    where: { id: formId, tenantId },
  });

  if (!form) throw AppError.notFound("Form not found");

  await prisma.form.delete({ where: { id: formId } });
}

export async function duplicateForm(tenantId: string, formId: string, newName: string): Promise<FormDefinition> {
  const original = await getForm(tenantId, formId);

  return createForm(tenantId, {
    name: newName,
    title: `${original.title} (Copy)`,
    description: original.description,
    fields: original.fields,
    sections: original.sections,
    settings: original.settings,
  });
}

export async function reorderFields(tenantId: string, formId: string, fieldOrder: string[]): Promise<FormDefinition> {
  const form = await getForm(tenantId, formId);

  const reorderedFields = form.fields.map((field, index) => ({
    ...field,
    order: fieldOrder.indexOf(field.id) ?? index,
  }));

  return updateForm(tenantId, formId, { fields: reorderedFields });
}

function parseFormDefinition(form: any): FormDefinition {
  return {
    id: form.id,
    tenantId: form.tenantId,
    name: form.name,
    title: form.title,
    description: form.description,
    fields: JSON.parse(form.fields ?? "[]"),
    sections: JSON.parse(form.sections ?? "[]"),
    settings: JSON.parse(form.settings ?? "{}"),
    createdAt: form.createdAt,
    updatedAt: form.updatedAt,
  };
}
