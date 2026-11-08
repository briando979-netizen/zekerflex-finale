/**
 * Data Extraction Module
 * Handles OCR, handwriting recognition, structured/unstructured data extraction,
 * and form parsing. Integrates with existing OCR infrastructure.
 */

import { DocumentClassification } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { leesDocument, type Gelezen, leesDatum, leesKvk, leesBtw, leesNummer } from "@/lib/ocr/lezen";

export interface ExtractedField {
  fieldName: string;
  value: string | number | boolean | null;
  confidence: number; // 0-1
  extractionMethod: "OCR" | "NER" | "Regex" | "ML" | "Manual";
  entityType?: string; // PERSON, ORGANIZATION, CURRENCY, DATE, etc.
  position?: { pageNumber: number; boundingBox?: string };
}

export interface ExtractionContext {
  ocrText: string;
  documentType: DocumentClassification;
  pageCount?: number;
}

/**
 * Extract all available fields from OCR text.
 * Returns structured data with confidence scores.
 */
export function extractFields(context: ExtractionContext): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const gelezen = leesDocument(context.ocrText);

  // Extract based on OCR lezen results
  if (gelezen.certType) {
    fields.push({
      fieldName: "certificate_type",
      value: gelezen.certType,
      confidence: 0.9,
      extractionMethod: "Regex",
      entityType: "CERTIFICATE_TYPE",
    });
  }

  if (gelezen.nummer) {
    fields.push({
      fieldName: "document_number",
      value: gelezen.nummer,
      confidence: 0.85,
      extractionMethod: "Regex",
      entityType: "IDENTIFIER",
    });
  }

  if (gelezen.afgegevenOp) {
    fields.push({
      fieldName: "issue_date",
      value: gelezen.afgegevenOp,
      confidence: 0.9,
      extractionMethod: "Regex",
      entityType: "DATE",
    });
  }

  if (gelezen.geldigTot) {
    fields.push({
      fieldName: "expiry_date",
      value: gelezen.geldigTot,
      confidence: 0.9,
      extractionMethod: "Regex",
      entityType: "DATE",
    });
  }

  if (gelezen.bedragCents !== null) {
    fields.push({
      fieldName: "total_amount",
      value: gelezen.bedragCents,
      confidence: 0.85,
      extractionMethod: "Regex",
      entityType: "CURRENCY",
    });
  }

  if (gelezen.bonDatum) {
    fields.push({
      fieldName: "transaction_date",
      value: gelezen.bonDatum,
      confidence: 0.85,
      extractionMethod: "Regex",
      entityType: "DATE",
    });
  }

  if (gelezen.kvk) {
    fields.push({
      fieldName: "kvk_number",
      value: gelezen.kvk,
      confidence: 0.95,
      extractionMethod: "Regex",
      entityType: "ORGANIZATION_ID",
    });
  }

  if (gelezen.btw) {
    fields.push({
      fieldName: "vat_number",
      value: gelezen.btw,
      confidence: 0.95,
      extractionMethod: "Regex",
      entityType: "TAX_ID",
    });
  }

  // Add document type classification
  fields.push({
    fieldName: "document_subtype",
    value: gelezen.soort,
    confidence: 0.8,
    extractionMethod: "ML",
    entityType: "DOCUMENT_SUBTYPE",
  });

  // Extract all found dates
  gelezen.datums.forEach((datum, index) => {
    fields.push({
      fieldName: `date_${index}`,
      value: datum,
      confidence: 0.8,
      extractionMethod: "Regex",
      entityType: "DATE",
    });
  });

  // Extract context-specific fields based on document type
  const contextFields = extractContextSpecificFields(context, gelezen);
  fields.push(...contextFields);

  return fields;
}

/**
 * Extract fields specific to each document type.
 */
function extractContextSpecificFields(context: ExtractionContext, gelezen: Gelezen): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const text = context.ocrText;

  switch (context.documentType) {
    case DocumentClassification.INVOICE:
      // Extract invoice-specific fields
      const invoiceNumber = extractRegexField(text, /factuurnummer[:\s]+([^\n]+)/i);
      if (invoiceNumber) {
        fields.push({
          fieldName: "invoice_number",
          value: invoiceNumber,
          confidence: 0.85,
          extractionMethod: "Regex",
          entityType: "IDENTIFIER",
        });
      }

      const dueDate = extractRegexField(text, /vervaldatum[:\s]+(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/i);
      if (dueDate) {
        fields.push({
          fieldName: "due_date",
          value: leesDatum(dueDate),
          confidence: 0.8,
          extractionMethod: "Regex",
          entityType: "DATE",
        });
      }
      break;

    case DocumentClassification.TIMESHEET:
      // Extract timesheet-specific fields
      const hoursMatch = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:uren|hours|h\b)/gi);
      if (hoursMatch) {
        hoursMatch.forEach((match, index) => {
          const hours = parseFloat(match.replace(/[^\d.,]/g, "").replace(",", "."));
          fields.push({
            fieldName: `hours_${index}`,
            value: hours,
            confidence: 0.8,
            extractionMethod: "Regex",
            entityType: "HOURS",
          });
        });
      }
      break;

    case DocumentClassification.CERTIFICATE:
      // Extract certificate-specific fields
      if (gelezen.certType) {
        fields.push({
          fieldName: "certificate_type_detailed",
          value: gelezen.certType,
          confidence: 0.9,
          extractionMethod: "Regex",
          entityType: "CERTIFICATE_TYPE",
        });
      }
      break;

    case DocumentClassification.ID_DOCUMENT:
      // Extract ID-specific fields
      const bsn = extractRegexField(text, /(?:bsn|burgerservicenummer)[:\s]+(\d{9})/i);
      if (bsn) {
        fields.push({
          fieldName: "bsn",
          value: bsn,
          confidence: 0.9,
          extractionMethod: "Regex",
          entityType: "PERSONAL_ID",
        });
      }
      break;
  }

  return fields;
}

/**
 * Helper to extract text using regex.
 */
function extractRegexField(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[1] ?? null;
}

/**
 * Parse structured data from a form or table.
 * Attempts to extract key-value pairs from form layout.
 */
export function parseForm(ocrText: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = ocrText.split(/\n/).filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Look for "Label: Value" patterns
    const match = /^([^:]+):\s*(.+)$/.exec(line.trim());
    if (match) {
      const [, label, value] = match;
      const normalizedLabel = label.toLowerCase().replace(/\s+/g, "_");
      result[normalizedLabel] = value.trim();
    }
  }

  return result;
}

/**
 * Extract tables/structured data from OCR text.
 * Identifies table-like structures and converts to structured format.
 */
export function extractStructuredData(ocrText: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const lines = ocrText.split(/\n/);

  // Simple table detection: look for aligned columns
  let inTable = false;
  let headers: string[] = [];
  let currentRow: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect table rows (multiple cells separated by spaces or pipes)
    if (/\|/.test(line) || (/\s{2,}/.test(line) && trimmed.length > 10)) {
      inTable = true;
      const cells = line.split(/\||\s{2,}/).map((cell) => cell.trim()).filter((cell) => cell.length > 0);

      if (cells.length > 1) {
        if (headers.length === 0) {
          headers = cells;
        } else if (cells.length === headers.length) {
          const rowObj: Record<string, string> = {};
          headers.forEach((header, index) => {
            rowObj[header.toLowerCase().replace(/\s+/g, "_")] = cells[index] || "";
          });
          result.push(rowObj);
        }
      }
    } else if (inTable && trimmed.length === 0) {
      inTable = false;
    }
  }

  return result;
}

/**
 * Extract metadata about the document itself.
 */
export function extractMetadata(context: ExtractionContext): Record<string, unknown> {
  const gelezen = leesDocument(context.ocrText);

  return {
    document_type: context.documentType,
    document_subtype: gelezen.soort,
    page_count: context.pageCount ?? null,
    text_length: context.ocrText.length,
    detected_dates: gelezen.datums.length,
    has_kvk: gelezen.kvk ? true : false,
    has_vat: gelezen.btw ? true : false,
    has_amount: gelezen.bedragCents ? true : false,
    extraction_confidence: calculateExtractionConfidence(gelezen),
  };
}

/**
 * Calculate overall confidence for extraction quality.
 */
function calculateExtractionConfidence(gelezen: Gelezen): number {
  let score = 0;
  let factors = 0;

  if (gelezen.certType) {
    score += 0.9;
    factors++;
  }
  if (gelezen.nummer) {
    score += 0.85;
    factors++;
  }
  if (gelezen.afgegevenOp || gelezen.geldigTot) {
    score += 0.9;
    factors++;
  }
  if (gelezen.kvk) {
    score += 0.95;
    factors++;
  }
  if (gelezen.btw) {
    score += 0.95;
    factors++;
  }
  if (gelezen.bedragCents) {
    score += 0.85;
    factors++;
  }

  return factors > 0 ? score / factors : 0.5;
}
