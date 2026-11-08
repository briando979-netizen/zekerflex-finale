import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { generateValidationSchema } from "./schemas";
import type { FormField } from "@/lib/custom-fields/types";
import crypto from "crypto";

export interface FormResponse {
  id: string;
  formId: string;
  tenantId: string;
  data: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  submittedAt: Date;
  dataHash: string;
}

export async function submitFormResponse(
  tenantId: string,
  formId: string,
  data: Record<string, unknown>,
  fields: FormField[],
  options?: { ip?: string; userAgent?: string }
): Promise<FormResponse> {
  // Validate form data
  const schema = generateValidationSchema(fields);
  const validated = schema.parse(data);

  // Calculate hash for duplicate detection
  const dataHash = crypto.createHash("sha256").update(JSON.stringify(validated)).digest("hex");

  // Check for duplicates
  const existingResponse = await prisma.formResponse.findFirst({
    where: { formId, tenantId, dataHash },
    orderBy: { submittedAt: "desc" },
  });

  if (existingResponse) {
    const timeDiff = Date.now() - existingResponse.submittedAt.getTime();
    // Allow duplicate within 60 seconds (likely resubmission, not actual duplicate)
    if (timeDiff < 60000) {
      throw AppError.validation("This response appears to be a duplicate");
    }
  }

  const response = await prisma.formResponse.create({
    data: {
      formId,
      tenantId,
      data: JSON.stringify(validated),
      ip: options?.ip,
      userAgent: options?.userAgent,
      dataHash,
    },
  });

  return parseFormResponse(response);
}

export async function getFormResponse(tenantId: string, responseId: string): Promise<FormResponse> {
  const response = await prisma.formResponse.findUnique({
    where: { id: responseId, tenantId },
  });

  if (!response) throw AppError.notFound("Response not found");
  return parseFormResponse(response);
}

export async function listFormResponses(
  tenantId: string,
  formId: string,
  options?: { skip?: number; take?: number }
): Promise<FormResponse[]> {
  const responses = await prisma.formResponse.findMany({
    where: { formId, tenantId },
    orderBy: { submittedAt: "desc" },
    skip: options?.skip,
    take: options?.take,
  });

  return responses.map(parseFormResponse);
}

export async function deleteFormResponse(tenantId: string, responseId: string): Promise<void> {
  const response = await prisma.formResponse.findUnique({
    where: { id: responseId, tenantId },
  });

  if (!response) throw AppError.notFound("Response not found");
  await prisma.formResponse.delete({ where: { id: responseId } });
}

export async function getFormResponseStats(
  tenantId: string,
  formId: string
): Promise<{
  totalResponses: number;
  responsesLastDay: number;
  responsesLastWeek: number;
  uniqueIps: number;
}> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [total, lastDay, lastWeek, uniqueIps] = await Promise.all([
    prisma.formResponse.count({ where: { formId, tenantId } }),
    prisma.formResponse.count({ where: { formId, tenantId, submittedAt: { gte: dayAgo } } }),
    prisma.formResponse.count({ where: { formId, tenantId, submittedAt: { gte: weekAgo } } }),
    prisma.formResponse.findMany({
      where: { formId, tenantId },
      distinct: ["ip"],
      select: { ip: true },
    }),
  ]);

  return {
    totalResponses: total,
    responsesLastDay: lastDay,
    responsesLastWeek: lastWeek,
    uniqueIps: uniqueIps.filter((r) => r.ip).length,
  };
}

export async function exportFormResponses(
  tenantId: string,
  formId: string,
  format: "csv" | "json"
): Promise<string> {
  const responses = await listFormResponses(tenantId, formId);

  if (format === "json") {
    return JSON.stringify(responses, null, 2);
  }

  // CSV export
  if (responses.length === 0) return "";

  const headers = Object.keys(responses[0].data as Record<string, unknown>);
  const csv = [
    ["id", "submittedAt", ...headers].join(","),
    ...responses.map((r) => [
      r.id,
      r.submittedAt.toISOString(),
      ...headers.map((h) => {
        const val = (r.data as Record<string, unknown>)[h];
        if (val === null || val === undefined) return "";
        if (typeof val === "string") return `"${val.replace(/"/g, '""')}"`;
        return String(val);
      }),
    ].join(",")),
  ].join("\n");

  return csv;
}

function parseFormResponse(response: any): FormResponse {
  return {
    ...response,
    data: JSON.parse(response.data ?? "{}"),
  };
}
