/**
 * Process Automation Module
 * Workflow integration, downstream system feeding, and archive management.
 * Orchestrates the complete IDP pipeline and triggers downstream actions.
 */

import { prisma } from "@/lib/prisma";
import { DocumentClassification, DocumentProcessingStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { type ExtractionContext } from "@/lib/idp/extraction";
import { type ExtractedField } from "@/lib/idp/extraction";
import { type EnrichmentData } from "@/lib/idp/enrichment";
import { logger } from "@/lib/logger";

export interface AutomationWorkflow {
  stage: "classification" | "extraction" | "validation" | "enrichment" | "automation" | "archive";
  actions: WorkflowAction[];
  shouldContinue: boolean;
  nextStage?: "classification" | "extraction" | "validation" | "enrichment" | "automation" | "archive";
}

export interface WorkflowAction {
  type: "webhook" | "database" | "notification" | "routing" | "archive";
  target: string;
  payload: Record<string, unknown>;
  async: boolean;
  retryable: boolean;
}

/**
 * Execute complete IDP workflow for a document.
 * Orchestrates all stages: classification → extraction → validation → enrichment → automation.
 */
export async function executeIdpWorkflow(
  documentId: string,
  tenantId: string,
  ocrText: string,
  documentType?: DocumentClassification,
): Promise<{ success: boolean; status: DocumentProcessingStatus; message: string }> {
  const startTime = Date.now();

  try {
    // Update document status: PENDING → PROCESSING
    await prisma.processedDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentProcessingStatus.PROCESSING,
        processingStartedAt: new Date(),
        rawText: ocrText,
      },
    });

    // Log workflow start
    await logProcessing(documentId, "automation", "workflow_started", "success", { stages: "all" });

    // Stage 1: Classification (if not provided)
    let classification = documentType || DocumentClassification.UNKNOWN;
    if (!documentType) {
      const classificationModule = await import("./classification.js");
      const result = classificationModule.classifyDocument(ocrText);
      classification = result.documentType;

      await prisma.processedDocument.update({
        where: { id: documentId },
        data: {
          classification,
          classificationScore: result.confidence,
          status: DocumentProcessingStatus.CLASSIFIED,
        },
      });

      await logProcessing(documentId, "classification", "classified", "success", {
        type: classification,
        confidence: result.confidence,
      });
    }

    // Stage 2: Extraction
    const extractionModule = await import("./extraction.js");
    const context: ExtractionContext = { ocrText, documentType: classification };
    const fields = extractionModule.extractFields(context);
    const metadata = extractionModule.extractMetadata(context);

    // Save extraction results
    for (const field of fields) {
      await prisma.extractionResult.create({
        data: {
          documentId,
          fieldName: field.fieldName,
          extractedValue: String(field.value || ""),
          confidence: field.confidence,
          extractionMethod: field.extractionMethod,
          entityType: field.entityType,
        },
      });
    }

    await prisma.processedDocument.update({
      where: { id: documentId },
      data: { status: DocumentProcessingStatus.EXTRACTED },
    });

    await logProcessing(documentId, "extraction", "fields_extracted", "success", {
      field_count: fields.length,
      avg_confidence: fields.reduce((a, b) => a + b.confidence, 0) / fields.length,
    });

    // Stage 3: Entity Recognition
    const nerModule = await import("./entity-recognition.js");
    const entities = nerModule.recognizeEntities(ocrText, classification);

    await logProcessing(documentId, "extraction", "entities_recognized", "success", {
      entity_count: entities.length,
    });

    // Stage 4: Validation
    const validationModule = await import("./validation.js");
    const validation = await validationModule.validateDocument(documentId, classification, fields, tenantId);

    await prisma.processedDocument.update({
      where: { id: documentId },
      data: { status: DocumentProcessingStatus.VALIDATED },
    });

    await logProcessing(documentId, "validation", validation.passed ? "validation_passed" : "validation_failed", "success", {
      passed: validation.passed,
      score: validation.score,
      messages: validation.messages.length,
    });

    // Stage 5: Enrichment
    const enrichmentModule = await import("./enrichment.js");
    const enrichment = await enrichmentModule.enrichDocument(documentId, classification, fields, entities, tenantId);

    await prisma.processedDocument.update({
      where: { id: documentId },
      data: { status: DocumentProcessingStatus.ENRICHED },
    });

    await logProcessing(documentId, "enrichment", "document_enriched", "success", {
      tags: enrichment.tags.length,
      quality_score: enrichment.qualityScore,
    });

    // Stage 6: Downstream Automation
    const automationActions = generateWorkflowActions(classification, fields, enrichment, validation.passed);
    await executeDownstreamActions(documentId, tenantId, automationActions);

    // Stage 7: Archive
    if (validation.passed && enrichment.qualityScore > 0.7) {
      await archiveDocument(documentId, classification);
      await prisma.processedDocument.update({
        where: { id: documentId },
        data: { status: DocumentProcessingStatus.ARCHIVED },
      });
    }

    // Mark as complete
    await prisma.processedDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentProcessingStatus.ARCHIVED,
        processingCompletedAt: new Date(),
      },
    });

    const duration = Date.now() - startTime;
    await logProcessing(documentId, "automation", "workflow_completed", "success", { duration_ms: duration });

    logger.info(`IDP workflow completed for document ${documentId} in ${duration}ms`);

    return {
      success: true,
      status: DocumentProcessingStatus.ARCHIVED,
      message: `Document processed successfully in ${(duration / 1000).toFixed(2)}s`,
    };
  } catch (err) {
    const errorMessage = String(err);
    await logProcessing(documentId, "automation", "workflow_failed", "error", { error: errorMessage });

    await prisma.processedDocument.update({
      where: { id: documentId },
      data: { status: DocumentProcessingStatus.FAILED },
    });

    logger.error(`IDP workflow failed for document ${documentId}: ${errorMessage}`);

    return {
      success: false,
      status: DocumentProcessingStatus.FAILED,
      message: `Processing failed: ${errorMessage}`,
    };
  }
}

/**
 * Generate workflow actions based on document classification and validation results.
 */
function generateWorkflowActions(
  classification: DocumentClassification,
  fields: ExtractedField[],
  enrichment: EnrichmentData,
  validationPassed: boolean,
): WorkflowAction[] {
  const actions: WorkflowAction[] = [];

  // Route to appropriate downstream system based on classification
  switch (classification) {
    case DocumentClassification.INVOICE:
      // Feed to accounting system
      actions.push({
        type: "webhook",
        target: "accounting-service",
        payload: {
          type: "invoice_processed",
          invoice_number: fields.find((f) => f.fieldName === "invoice_number")?.value,
          amount: fields.find((f) => f.fieldName === "total_amount")?.value,
          vat: fields.find((f) => f.fieldName === "vat_number")?.value,
        },
        async: true,
        retryable: true,
      });

      // Trigger archival
      if (validationPassed) {
        actions.push({
          type: "archive",
          target: "document-store",
          payload: { classification: "INVOICE", tags: enrichment.tags },
          async: true,
          retryable: true,
        });
      }
      break;

    case DocumentClassification.CERTIFICATE:
      // Feed to HR/compliance system
      actions.push({
        type: "webhook",
        target: "hr-service",
        payload: {
          type: "certificate_processed",
          cert_type: fields.find((f) => f.fieldName === "certificate_type")?.value,
          expiry_date: fields.find((f) => f.fieldName === "expiry_date")?.value,
          number: fields.find((f) => f.fieldName === "document_number")?.value,
        },
        async: true,
        retryable: true,
      });

      // Send notification if expiring soon
      const expiryField = fields.find((f) => f.fieldName === "expiry_date");
      if (expiryField) {
        const expiryDate = new Date(expiryField.value as string);
        const daysUntilExpiry = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

        if (daysUntilExpiry < 90) {
          actions.push({
            type: "notification",
            target: "hr-alerts",
            payload: {
              type: "certificate_expiry_warning",
              days_until_expiry: Math.round(daysUntilExpiry),
              certificate_type: fields.find((f) => f.fieldName === "certificate_type")?.value,
            },
            async: true,
            retryable: true,
          });
        }
      }
      break;

    case DocumentClassification.RECEIPT:
      // Feed to expense tracking system
      actions.push({
        type: "webhook",
        target: "expense-service",
        payload: {
          type: "receipt_processed",
          vendor: enrichment.metadata.organizations ? enrichment.metadata.organizations[0] : "Unknown",
          amount: fields.find((f) => f.fieldName === "total_amount")?.value,
          date: fields.find((f) => f.fieldName === "transaction_date")?.value,
        },
        async: true,
        retryable: true,
      });
      break;

    case DocumentClassification.TIMESHEET:
      // Feed to timesheet system
      actions.push({
        type: "webhook",
        target: "timesheet-service",
        payload: {
          type: "timesheet_processed",
          date: fields.find((f) => f.fieldName === "date")?.value,
          hours: fields.find((f) => f.fieldName?.includes("hours"))?.value,
        },
        async: true,
        retryable: true,
      });
      break;

    case DocumentClassification.CONTRACT:
      // Feed to contract management system
      actions.push({
        type: "webhook",
        target: "contract-service",
        payload: {
          type: "contract_processed",
          number: fields.find((f) => f.fieldName === "contract_number")?.value,
          date: fields.find((f) => f.fieldName === "date")?.value,
        },
        async: true,
        retryable: true,
      });
      break;
  }

  // Quality-based notification
  if (enrichment.qualityScore < 0.5) {
    actions.push({
      type: "notification",
      target: "document-review",
      payload: {
        type: "low_quality_review",
        quality_score: enrichment.qualityScore,
        reason: enrichment.completenessScore < 0.6 ? "incomplete_extraction" : "low_confidence",
      },
      async: true,
      retryable: false,
    });
  }

  return actions;
}

/**
 * Execute downstream workflow actions.
 */
async function executeDownstreamActions(
  documentId: string,
  tenantId: string,
  actions: WorkflowAction[],
): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case "webhook":
          await executeWebhook(documentId, action);
          break;

        case "database":
          await executeDatabase(documentId, action);
          break;

        case "notification":
          await executeNotification(documentId, tenantId, action);
          break;

        case "archive":
          await archiveDocument(documentId, DocumentClassification.UNKNOWN);
          break;
      }

      await logProcessing(documentId, "automation", `action_executed_${action.type}`, "success", { target: action.target });
    } catch (err) {
      const message = String(err);
      await logProcessing(documentId, "automation", `action_failed_${action.type}`, "error", { target: action.target, error: message });

      if (!action.retryable) {
        logger.error(`Non-retryable action failed for document ${documentId}: ${message}`);
      } else {
        logger.warn(`Retryable action failed for document ${documentId}: ${message}. Will retry.`);
        // In production: queue for retry
      }
    }
  }
}

/**
 * Execute a webhook action (stub for downstream integration).
 */
async function executeWebhook(documentId: string, action: WorkflowAction): Promise<void> {
  // In production: call actual webhook endpoint
  logger.info(`Webhook action: ${action.target}`, action.payload);

  // Simulate webhook call
  if (Math.random() > 0.9) {
    throw new Error("Simulated webhook failure");
  }
}

/**
 * Execute a database action (stub).
 */
async function executeDatabase(documentId: string, action: WorkflowAction): Promise<void> {
  logger.info(`Database action: ${action.target}`, action.payload);
  // Implement database updates as needed
}

/**
 * Execute a notification action (stub).
 */
async function executeNotification(documentId: string, tenantId: string, action: WorkflowAction): Promise<void> {
  logger.info(`Notification action for tenant ${tenantId}:`, action.payload);
  // In production: integrate with notification service (push, email, etc.)
}

/**
 * Archive a processed document.
 */
async function archiveDocument(documentId: string, classification: DocumentClassification): Promise<void> {
  // In production: move document to long-term storage (S3, cold storage, etc.)
  logger.info(`Archiving document ${documentId} (${classification})`);

  // Update document with archive metadata
  await prisma.processedDocument.update({
    where: { id: documentId },
    data: {
      status: DocumentProcessingStatus.ARCHIVED,
    },
  });
}

/**
 * Log processing event.
 */
async function logProcessing(
  documentId: string,
  stage: string,
  action: string,
  status: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await prisma.processingLog.create({
    data: {
      documentId,
      stage,
      action,
      status,
      message: `${stage}: ${action}`,
      details: details || {},
    },
  });
}

/**
 * Get processing history for a document.
 */
export async function getProcessingHistory(documentId: string): Promise<Array<{ stage: string; action: string; status: string; timestamp: string }>> {
  const logs = await prisma.processingLog.findMany({
    where: { documentId },
    orderBy: { createdAt: "asc" },
  });

  return logs.map((log) => ({
    stage: log.stage,
    action: log.action,
    status: log.status,
    timestamp: log.createdAt.toISOString(),
  }));
}

/**
 * Retry failed document processing.
 */
export async function retryProcessing(documentId: string): Promise<{ success: boolean; message: string }> {
  const doc = await prisma.processedDocument.findUnique({ where: { id: documentId } });

  if (!doc) {
    throw AppError.notFound("Document not found");
  }

  if (doc.status !== DocumentProcessingStatus.FAILED) {
    return { success: false, message: "Document is not in FAILED status" };
  }

  // Re-execute workflow
  return executeIdpWorkflow(documentId, doc.tenantId, doc.rawText || "", doc.classification);
}
