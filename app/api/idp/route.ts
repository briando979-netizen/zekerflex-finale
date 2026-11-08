/**
 * Intelligent Document Processing (IDP) API
 * POST /api/idp - Process a document through the full IDP pipeline
 * GET /api/idp/:documentId - Get document processing status and results
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { withAuth } from "@/lib/auth/handlers";
import { ocr } from "@/lib/ocr/engine";
import { executeIdpWorkflow, getProcessingHistory, retryProcessing } from "@/lib/idp/automation";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { DocumentClassification } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // IDP can take up to 5 minutes for large documents

/**
 * POST /api/idp - Initiate IDP processing for a document
 */
const processSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileContent: z.string().or(z.instanceof(ArrayBuffer)), // Base64 or binary
  fileType: z.enum(["image/png", "image/jpeg", "application/pdf", "application/octet-stream"]),
  documentType: z.enum(Object.values(DocumentClassification)).optional(),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

type ProcessRequest = z.infer<typeof processSchema>;

export const POST = withAuth(["PLATFORM_ADMIN", "HQ_ADMIN"], async (request, { principal }) => {
  try {
    const input = processSchema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Invalid request body");
      }),
    );

    // Verify tenant access
    const tenant = await prisma.tenant.findUnique({
      where: { id: principal.tenantId },
    });

    if (!tenant) {
      throw AppError.forbidden("Tenant not found");
    }

    // Convert file content if needed
    let fileBuffer: Buffer;
    if (typeof input.fileContent === "string") {
      fileBuffer = Buffer.from(input.fileContent, "base64");
    } else {
      fileBuffer = Buffer.from(input.fileContent);
    }

    // Create document record
    const document = await prisma.processedDocument.create({
      data: {
        tenantId: principal.tenantId,
        fileName: input.fileName,
        fileSize: fileBuffer.length,
        mimeType: input.fileType,
      },
    });

    // Record audit
    await recordAudit(principal.tenantId, "IDP_PROCESSING_STARTED", {
      documentId: document.id,
      fileName: input.fileName,
    });

    // Extract text using OCR (async, in background)
    let ocrText = "";
    try {
      const ocrResult = await ocr(fileBuffer);
      ocrText = ocrResult.tekst;
    } catch (err) {
      logger.error(`OCR failed for document ${document.id}:`, err);
      // Continue with empty text - validation will catch this
      ocrText = "";
    }

    // Start IDP workflow (can be async)
    const workflowPromise = executeIdpWorkflow(
      document.id,
      principal.tenantId,
      ocrText,
      input.documentType,
    );

    // Return immediately with document ID (workflow runs in background)
    workflowPromise.catch((err) => {
      logger.error(`IDP workflow failed for document ${document.id}:`, err);
    });

    logger.info(`IDP processing initiated for document ${document.id}`);

    return NextResponse.json(
      {
        documentId: document.id,
        fileName: document.fileName,
        status: "processing",
        message: "Document processing started. Check status with GET /api/idp/{documentId}",
      },
      { status: 202 }, // Accepted
    );
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
});

/**
 * GET /api/idp/:documentId - Get document processing status and results
 */
const getStatusSchema = z.object({
  documentId: z.string().cuid(),
});

export const GET = withAuth(["PLATFORM_ADMIN", "HQ_ADMIN"], async (request, { principal }) => {
  try {
    const url = new URL(request.url);
    const paths = url.pathname.split("/");
    const documentId = paths[paths.length - 1];

    if (!documentId || documentId === "route.ts") {
      throw AppError.validation("documentId is required");
    }

    // Get document
    const document = await prisma.processedDocument.findUnique({
      where: { id: documentId },
      include: {
        extractionResults: true,
        validationRules: true,
        enrichmentData: true,
        processingLogs: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!document) {
      throw AppError.notFound("Document not found");
    }

    // Verify tenant access
    if (document.tenantId !== principal.tenantId) {
      throw AppError.forbidden("Access denied");
    }

    // Get full history
    const history = await getProcessingHistory(documentId);

    return NextResponse.json({
      document: {
        id: document.id,
        fileName: document.fileName,
        status: document.status,
        classification: document.classification,
        classificationScore: document.classificationScore,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        processingTime: document.processingCompletedAt
          ? (document.processingCompletedAt.getTime() - document.createdAt.getTime()) / 1000
          : null,
      },
      extraction: {
        fieldsExtracted: document.extractionResults.length,
        fields: document.extractionResults.map((f) => ({
          name: f.fieldName,
          value: f.extractedValue,
          confidence: f.confidence,
          method: f.extractionMethod,
        })),
      },
      enrichment: document.enrichmentData
        ? {
            tags: document.enrichmentData.tags,
            categories: document.enrichmentData.categories,
            qualityScore: document.enrichmentData.qualityScore,
            completenessScore: document.enrichmentData.completenessScore,
          }
        : null,
      recentLogs: document.processingLogs.map((log) => ({
        stage: log.stage,
        action: log.action,
        status: log.status,
        message: log.message,
        timestamp: log.createdAt.toISOString(),
      })),
      history: history.slice(0, 20), // Last 20 events
    });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
});

/**
 * POST /api/idp/:documentId/retry - Retry failed document processing
 */
export const PUT = withAuth(["PLATFORM_ADMIN", "HQ_ADMIN"], async (request, { principal }) => {
  try {
    const url = new URL(request.url);
    const paths = url.pathname.split("/");
    const documentId = paths[paths.length - 2]; // Before /retry

    if (!documentId) {
      throw AppError.validation("documentId is required");
    }

    // Verify document exists and belongs to tenant
    const document = await prisma.processedDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw AppError.notFound("Document not found");
    }

    if (document.tenantId !== principal.tenantId) {
      throw AppError.forbidden("Access denied");
    }

    // Retry processing
    const result = await retryProcessing(documentId);

    await recordAudit(principal.tenantId, "IDP_PROCESSING_RETRIED", {
      documentId,
    });

    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        documentId,
        status: "retrying",
      },
      { status: result.success ? 202 : 400 },
    );
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
});

/**
 * DELETE /api/idp/:documentId - Delete a document and its processing data
 */
export const DELETE = withAuth(["PLATFORM_ADMIN", "HQ_ADMIN"], async (request, { principal }) => {
  try {
    const url = new URL(request.url);
    const paths = url.pathname.split("/");
    const documentId = paths[paths.length - 1];

    if (!documentId) {
      throw AppError.validation("documentId is required");
    }

    // Get document
    const document = await prisma.processedDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw AppError.notFound("Document not found");
    }

    // Verify tenant access
    if (document.tenantId !== principal.tenantId) {
      throw AppError.forbidden("Access denied");
    }

    // Delete document and all related data (cascade handled by Prisma)
    await prisma.processedDocument.delete({
      where: { id: documentId },
    });

    await recordAudit(principal.tenantId, "IDP_DOCUMENT_DELETED", {
      documentId,
      fileName: document.fileName,
    });

    logger.info(`Document ${documentId} deleted`);

    return NextResponse.json({
      success: true,
      message: "Document and all processing data deleted",
      documentId,
    });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
});
