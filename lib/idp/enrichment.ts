/**
 * Document Enrichment Module
 * Auto-tagging, metadata extraction, relationship mapping,
 * and document linking for enhanced search and organization.
 */

import { prisma } from "@/lib/prisma";
import { DocumentClassification } from "@prisma/client";
import { type ExtractedField } from "@/lib/idp/extraction";
import { type RecognizedEntity } from "@/lib/idp/entity-recognition";

export interface EnrichmentData {
  tags: string[];
  categories: string[];
  metadata: Record<string, unknown>;
  linkedDocuments: string[];
  linkedEntities: string[];
  qualityScore: number;
  completenessScore: number;
}

/**
 * Enrich a document with tags, metadata, and relationships.
 */
export async function enrichDocument(
  documentId: string,
  documentType: DocumentClassification,
  extractedFields: ExtractedField[],
  entities: RecognizedEntity[],
  tenantId: string,
): Promise<EnrichmentData> {
  // Generate tags based on content
  const tags = generateTags(documentType, extractedFields, entities);

  // Assign categories
  const categories = assignCategories(documentType, extractedFields);

  // Extract and structure metadata
  const metadata = extractMetadata(extractedFields, entities);

  // Find linked documents
  const linkedDocuments = await findLinkedDocuments(documentId, tenantId, entities, metadata);

  // Map to linked entities/organizations
  const linkedEntities = extractLinkedEntities(entities, metadata);

  // Calculate quality scores
  const qualityScore = calculateEnrichmentQuality(extractedFields, entities);
  const completenessScore = calculateCompleteness(extractedFields);

  // Save enrichment to database
  await prisma.documentEnrichment.upsert({
    where: { documentId },
    create: {
      documentId,
      tags,
      categories,
      metadata,
      linkedDocuments,
      linkedEntities,
      qualityScore,
      completenessScore,
    },
    update: {
      tags,
      categories,
      metadata,
      linkedDocuments,
      linkedEntities,
      qualityScore,
      completenessScore,
      updatedAt: new Date(),
    },
  });

  return {
    tags,
    categories,
    metadata,
    linkedDocuments,
    linkedEntities,
    qualityScore,
    completenessScore,
  };
}

/**
 * Generate meaningful tags for a document.
 */
function generateTags(
  documentType: DocumentClassification,
  fields: ExtractedField[],
  entities: RecognizedEntity[],
): string[] {
  const tags = new Set<string>();

  // Base tag: document type
  tags.add(documentType.toLowerCase());

  // Industry tags based on organizations
  const orgs = entities.filter((e) => e.type === "ORGANIZATION" && e.confidence > 0.7);
  for (const org of orgs) {
    // Add industry guesses based on org name
    if (/kliniek|ziekenhuis|medisch|health|clinic|hospital/i.test(org.text)) {
      tags.add("healthcare");
    } else if (/advocaat|juridisch|legal|lawyer|law/i.test(org.text)) {
      tags.add("legal");
    } else if (/verzekering|insurance/i.test(org.text)) {
      tags.add("insurance");
    } else if (/school|universiteit|onderwijs|education/i.test(org.text)) {
      tags.add("education");
    }
  }

  // Date-based tags
  const dateFields = fields.filter((f) => f.entityType === "DATE" && f.confidence > 0.7);
  if (dateFields.length > 0) {
    const date = new Date(dateFields[0].value as string);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const quarter = Math.ceil((date.getMonth() + 1) / 3);
      tags.add(`year-${year}`);
      tags.add(`q${quarter}-${year}`);
    }
  }

  // Amount-based tags
  const amountFields = fields.filter((f) => f.entityType === "CURRENCY" && f.confidence > 0.7);
  if (amountFields.length > 0) {
    const amount = parseFloat(String(amountFields[0].value).replace(/[^0-9.]/g, ""));
    if (amount > 10000) tags.add("high-value");
    else if (amount > 1000) tags.add("medium-value");
    else if (amount > 100) tags.add("low-value");
  }

  // Document-specific tags
  if (documentType === DocumentClassification.INVOICE) {
    tags.add("financial-transaction");
    if (fields.find((f) => f.fieldName === "vat_number" && f.value)) {
      tags.add("has-vat");
    }
  } else if (documentType === DocumentClassification.CERTIFICATE) {
    const certType = fields.find((f) => f.fieldName === "certificate_type");
    if (certType) {
      tags.add(`cert-${String(certType.value).toLowerCase()}`);
    }
  }

  return Array.from(tags);
}

/**
 * Assign semantic categories to document.
 */
function assignCategories(documentType: DocumentClassification, fields: ExtractedField[]): string[] {
  const categories: string[] = [];

  // Primary category from document type
  const primaryCategory: Record<DocumentClassification, string> = {
    INVOICE: "Financial",
    RECEIPT: "Financial",
    CERTIFICATE: "Compliance",
    ID_DOCUMENT: "Identity",
    CONTRACT: "Legal",
    TIMESHEET: "Human Resources",
    RECEIPT_REGISTER: "Business",
    UNKNOWN: "Unclassified",
  };

  categories.push(primaryCategory[documentType]);

  // Secondary categories based on content
  const allText = fields.map((f) => String(f.value || "")).join(" ").toLowerCase();

  if (/international|export|import/i.test(allText)) {
    categories.push("International");
  }
  if (/government|overheid|belasting|tax/i.test(allText)) {
    categories.push("Government/Tax");
  }
  if (/personal|persoon|privaat/i.test(allText)) {
    categories.push("Personal");
  }
  if (/corporate|bedrijf|company|organisatie/i.test(allText)) {
    categories.push("Corporate");
  }

  return categories;
}

/**
 * Extract structured metadata from fields and entities.
 */
function extractMetadata(fields: ExtractedField[], entities: RecognizedEntity[]): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  // Aggregate fields by entity type
  const byType: Record<string, string[]> = {};
  for (const entity of entities) {
    if (!byType[entity.type]) byType[entity.type] = [];
    if (entity.confidence > 0.6) {
      byType[entity.type].push(entity.text);
    }
  }

  if (byType.ORGANIZATION && byType.ORGANIZATION.length > 0) {
    metadata.organizations = byType.ORGANIZATION;
  }
  if (byType.PERSON && byType.PERSON.length > 0) {
    metadata.persons = byType.PERSON;
  }
  if (byType.LOCATION && byType.LOCATION.length > 0) {
    metadata.locations = byType.LOCATION;
  }

  // Add notable field values
  const importantFields = fields.filter((f) => f.confidence > 0.8 && ["identifier", "currency", "date"].includes(f.entityType?.toLowerCase() || ""));
  if (importantFields.length > 0) {
    metadata.key_fields = importantFields.map((f) => ({ name: f.fieldName, value: f.value }));
  }

  // Add extraction statistics
  metadata.extraction_stats = {
    total_fields: fields.length,
    high_confidence_fields: fields.filter((f) => f.confidence > 0.8).length,
    extraction_methods: [...new Set(fields.map((f) => f.extractionMethod))],
  };

  return metadata;
}

/**
 * Find documents related to this one (same vendor, period, etc.).
 */
async function findLinkedDocuments(
  documentId: string,
  tenantId: string,
  entities: RecognizedEntity[],
  metadata: Record<string, unknown>,
): Promise<string[]> {
  const linked: Set<string> = new Set();

  // Find by organization (same vendor/customer)
  const orgs = entities.filter((e) => e.type === "ORGANIZATION" && e.confidence > 0.7);
  if (orgs.length > 0) {
    const relatedDocs = await prisma.extractionResult.findMany({
      where: {
        document: { tenantId },
        fieldName: "vendor",
        extractedValue: { in: orgs.map((o) => o.text) },
      },
      select: { documentId: true },
      take: 10,
    });

    relatedDocs.forEach((doc) => {
      if (doc.documentId !== documentId) linked.add(doc.documentId);
    });
  }

  // Find by date range (same period)
  const dateFields = (metadata.key_fields as Array<{ name: string; value: string }> | undefined) || [];
  if (dateFields.length > 0) {
    // Look for documents in the same month
    const dates = dateFields.filter((f) => f.name.includes("date")).map((f) => f.value as string);
    if (dates.length > 0) {
      const searchDate = new Date(dates[0]);
      const startOfMonth = new Date(searchDate.getFullYear(), searchDate.getMonth(), 1);
      const endOfMonth = new Date(searchDate.getFullYear(), searchDate.getMonth() + 1, 0);

      const docsInPeriod = await prisma.processingLog.findMany({
        where: {
          document: { tenantId },
          createdAt: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        select: { documentId: true },
        take: 10,
      });

      docsInPeriod.forEach((log) => {
        if (log.documentId !== documentId) linked.add(log.documentId);
      });
    }
  }

  return Array.from(linked);
}

/**
 * Extract references to external entities from recognized entities.
 */
function extractLinkedEntities(entities: RecognizedEntity[], metadata: Record<string, unknown>): string[] {
  const linkedEntities: string[] = [];

  // Extract TAX_IDs (KVK, VAT numbers)
  const taxIds = entities.filter((e) => e.type === "TAX_ID" && e.confidence > 0.9);
  linkedEntities.push(...taxIds.map((e) => `tax:${e.text}`));

  // Extract organizations
  const orgs = entities.filter((e) => e.type === "ORGANIZATION" && e.confidence > 0.8);
  linkedEntities.push(...orgs.map((e) => `org:${e.text}`));

  // Extract account numbers (if present)
  const accounts = entities.filter((e) => e.type === "ACCOUNT_NUMBER" && e.confidence > 0.9);
  linkedEntities.push(...accounts.map((e) => `account:${e.text}`));

  return linkedEntities;
}

/**
 * Calculate quality of enrichment based on data completeness.
 */
function calculateEnrichmentQuality(fields: ExtractedField[], entities: RecognizedEntity[]): number {
  let score = 0.5;

  // Quality of field extraction
  const highConfidenceFields = fields.filter((f) => f.confidence > 0.8).length;
  score += (highConfidenceFields / Math.max(fields.length, 1)) * 0.25;

  // Quality of entity recognition
  const highConfidenceEntities = entities.filter((e) => e.confidence > 0.8).length;
  score += (highConfidenceEntities / Math.max(entities.length, 1)) * 0.25;

  return Math.min(score, 1);
}

/**
 * Calculate completeness of extracted data.
 */
function calculateCompleteness(fields: ExtractedField[]): number {
  if (fields.length === 0) return 0;

  const highConfidenceFields = fields.filter((f) => f.confidence > 0.7).length;
  return Math.min(highConfidenceFields / Math.max(fields.length, 1), 1);
}

/**
 * Generate search tokens from enriched document for full-text search.
 */
export function generateSearchTokens(enrichment: EnrichmentData): string[] {
  const tokens: string[] = [];

  // Add tags
  tokens.push(...enrichment.tags);

  // Add categories
  tokens.push(...enrichment.categories);

  // Add key metadata
  if (enrichment.metadata.organizations) {
    tokens.push(...(enrichment.metadata.organizations as string[]).map((org) => org.toLowerCase()));
  }

  if (enrichment.metadata.persons) {
    tokens.push(...(enrichment.metadata.persons as string[]).map((p) => p.toLowerCase()));
  }

  // Remove duplicates
  return [...new Set(tokens)];
}

/**
 * Create a summary of enriched document for preview/display.
 */
export function createDocumentSummary(
  documentType: DocumentClassification,
  fields: ExtractedField[],
  enrichment: EnrichmentData,
): string {
  const parts: string[] = [];

  parts.push(`Type: ${documentType}`);

  // Add key information based on type
  switch (documentType) {
    case DocumentClassification.INVOICE:
      const invoiceNumber = fields.find((f) => f.fieldName === "invoice_number");
      const total = fields.find((f) => f.fieldName === "total_amount");
      if (invoiceNumber) parts.push(`Invoice: ${invoiceNumber.value}`);
      if (total) parts.push(`Amount: €${total.value}`);
      break;

    case DocumentClassification.CERTIFICATE:
      const certType = fields.find((f) => f.fieldName === "certificate_type");
      const expiry = fields.find((f) => f.fieldName === "expiry_date");
      if (certType) parts.push(`Certificate: ${certType.value}`);
      if (expiry) parts.push(`Expires: ${expiry.value}`);
      break;
  }

  if (enrichment.categories.length > 0) {
    parts.push(`Categories: ${enrichment.categories.join(", ")}`);
  }

  if (enrichment.tags.length > 0) {
    parts.push(`Tags: ${enrichment.tags.slice(0, 3).join(", ")}`);
  }

  parts.push(`Quality: ${(enrichment.qualityScore * 100).toFixed(0)}%`);

  return parts.join(" | ");
}
