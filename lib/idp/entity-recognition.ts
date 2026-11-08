/**
 * Entity Recognition Module
 * Named Entity Recognition (NER) for key information extraction.
 * Handles invoice parsing, receipt analysis, and ID document processing.
 */

import { AppError } from "@/lib/errors";
import { DocumentClassification } from "@prisma/client";

export interface RecognizedEntity {
  text: string;
  type: EntityType;
  confidence: number; // 0-1
  startOffset: number;
  endOffset: number;
}

export type EntityType =
  | "PERSON"
  | "ORGANIZATION"
  | "LOCATION"
  | "DATE"
  | "AMOUNT"
  | "CURRENCY"
  | "IDENTIFIER"
  | "EMAIL"
  | "PHONE"
  | "TAX_ID"
  | "ACCOUNT_NUMBER"
  | "INVOICE_NUMBER"
  | "CONTRACT_NUMBER"
  | "HOURS";

/**
 * NER Patterns for Dutch context
 */
const NER_PATTERNS: Record<EntityType, RegExp> = {
  PERSON: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/,
  ORGANIZATION: /\b([A-Z][A-Za-z\s&]+(?:b\.v\.|n\.v\.|nv|bv|gmbh|ag|ltd|inc)\b)/i,
  LOCATION: /\b(Amsterdam|Rotterdam|Den Haag|Utrecht|Groningen|Eindhoven|Maastricht|Leiden|Tilburg|Haarlem|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/,
  DATE: /(?:\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{4}-\d{2}-\d{2}|(?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+\d{1,2},?\s+\d{4})/i,
  AMOUNT: /(?:€|EUR|\$|USD)?\s*\d+(?:[.,]\d{2})?(?:\s*(?:euro|dollar|pond|pound))?/i,
  CURRENCY: /€|EUR|€|¥|JPY|\$|USD|£|GBP/,
  IDENTIFIER: /\b(?:NL|BE|DE|FR)\d{9,12}\b/,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  PHONE: /\b(?:\+31|0031|0)[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,5}\b/,
  TAX_ID: /\bNL\d{9}B\d{2}\b/,
  ACCOUNT_NUMBER: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/,
  INVOICE_NUMBER: /(?:factuur|invoice|inv|fa)\s*[-#]?\s*(\d{4,}[-\d]*)/i,
  CONTRACT_NUMBER: /(?:contract|kontract|ref)\s*[-#]?\s*([A-Z0-9]{4,})/i,
  HOURS: /(\d+(?:[.,]\d{1,2})?)\s*(?:uren|hours|h\b)/i,
};

/**
 * Recognize entities in OCR text using pattern matching and heuristics.
 */
export function recognizeEntities(text: string, documentType?: DocumentClassification): RecognizedEntity[] {
  const entities: RecognizedEntity[] = [];
  const seenEntities = new Set<string>();

  // Enhanced patterns for specific document types
  const patternsToUse = { ...NER_PATTERNS };

  if (documentType === DocumentClassification.INVOICE) {
    patternsToUse.ORGANIZATION = /\b([A-Z][A-Za-z\s&]+(?:BV|NV|Ltd|Inc|GmbH)?)\b/i;
  }

  for (const [entityType, pattern] of Object.entries(patternsToUse)) {
    const type = entityType as EntityType;
    const globalPattern = new RegExp(pattern.source, "g" + (pattern.flags || ""));

    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      const entityText = match[1] || match[0];
      const key = `${type}:${entityText}`.toLowerCase();

      // Avoid duplicates
      if (seenEntities.has(key)) continue;
      seenEntities.add(key);

      // Skip very short or common words
      if (entityText.length < 2 || isCommonWord(entityText)) continue;

      // Calculate confidence based on entity type and context
      const confidence = calculateEntityConfidence(type, entityText, text, match.index);

      if (confidence > 0.4) {
        entities.push({
          text: entityText,
          type,
          confidence,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        });
      }
    }
  }

  // Sort by confidence descending
  return entities.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Specialized parsing for invoices.
 */
export function parseInvoice(text: string): {
  invoiceNumber?: string;
  date?: string;
  dueDate?: string;
  vendor?: string;
  customer?: string;
  items: Array<{ description: string; amount: string }>;
  total?: string;
  taxAmount?: string;
} {
  const entities = recognizeEntities(text, DocumentClassification.INVOICE);
  const result: ReturnType<typeof parseInvoice> = { items: [] };

  // Extract invoice number
  const invoiceMatch = /(?:factuur|invoice|inv|fa)\s*[-#]?\s*(\d{4,}[-\d]*)/i.exec(text);
  if (invoiceMatch) result.invoiceNumber = invoiceMatch[1];

  // Extract dates
  const datePattern = /(?:factuur|invoice).*?datum[:\s]+(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/is;
  const dateMatch = datePattern.exec(text);
  if (dateMatch) result.date = dateMatch[1];

  // Extract organizations
  const orgs = entities.filter((e) => e.type === "ORGANIZATION" && e.confidence > 0.7);
  if (orgs.length > 0) result.vendor = orgs[0].text;
  if (orgs.length > 1) result.customer = orgs[1].text;

  // Extract amounts
  const amounts = entities.filter((e) => e.type === "AMOUNT" && e.confidence > 0.7);
  if (amounts.length > 0) {
    // Last amount is typically the total
    result.total = amounts[amounts.length - 1].text;
  }

  // Extract tax
  const taxMatch = /(?:btw|vat|tax).*?€?\s*(\d+(?:[.,]\d{2})?)/i.exec(text);
  if (taxMatch) result.taxAmount = taxMatch[1];

  // Extract line items (simple heuristic)
  const lines = text.split(/\n/);
  for (const line of lines) {
    const amountMatch = /(\d+(?:[.,]\d{2})?)\s*€?\s*$/.exec(line.trim());
    if (amountMatch && line.length > 10) {
      const description = line.substring(0, line.lastIndexOf(amountMatch[0])).trim();
      if (description.length > 2) {
        result.items.push({
          description,
          amount: amountMatch[1],
        });
      }
    }
  }

  return result;
}

/**
 * Specialized parsing for receipts.
 */
export function parseReceipt(text: string): {
  vendor?: string;
  date?: string;
  total?: string;
  items: Array<{ description: string; amount: string }>;
  paymentMethod?: string;
} {
  const entities = recognizeEntities(text, DocumentClassification.RECEIPT);
  const result: ReturnType<typeof parseReceipt> = { items: [] };

  // Extract vendor/store name (usually first or prominent organization)
  const orgs = entities.filter((e) => e.type === "ORGANIZATION" && e.confidence > 0.6);
  if (orgs.length > 0) result.vendor = orgs[0].text;

  // Extract date
  const dateEntities = entities.filter((e) => e.type === "DATE" && e.confidence > 0.7);
  if (dateEntities.length > 0) result.date = dateEntities[0].text;

  // Extract amounts
  const amounts = entities.filter((e) => e.type === "AMOUNT" && e.confidence > 0.7);
  if (amounts.length > 0) {
    // Last amount is typically the total
    result.total = amounts[amounts.length - 1].text;
  }

  // Detect payment method
  if (/pin|debit|creditcard|card|contant|cash/i.test(text)) {
    if (/pin/i.test(text)) result.paymentMethod = "PIN";
    else if (/contant|cash/i.test(text)) result.paymentMethod = "CASH";
    else result.paymentMethod = "CARD";
  }

  // Extract line items
  const lines = text.split(/\n/);
  for (const line of lines) {
    const amountMatch = /(\d+(?:[.,]\d{2})?)\s*€?\s*$/.exec(line.trim());
    if (amountMatch && line.length > 5) {
      const description = line.substring(0, line.lastIndexOf(amountMatch[0])).trim();
      if (description.length > 1 && !["TOTAAL", "TOTAL"].includes(description.toUpperCase())) {
        result.items.push({
          description,
          amount: amountMatch[1],
        });
      }
    }
  }

  return result;
}

/**
 * Specialized parsing for ID documents.
 */
export function parseIdDocument(text: string): {
  documentType?: string;
  number?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  expiryDate?: string;
  nationality?: string;
} {
  const entities = recognizeEntities(text, DocumentClassification.ID_DOCUMENT);
  const result: ReturnType<typeof parseIdDocument> = {};

  // Extract identifier/document number
  const idMatch = /(?:paspoort|passport|rijbewijs|driving|ID|identiteitskaart).*?(?:nr|number|nr\.)\s*[:=]?\s*([A-Z0-9]{6,})/i.exec(text);
  if (idMatch) result.number = idMatch[1];

  // Extract dates
  const dates = entities.filter((e) => e.type === "DATE" && e.confidence > 0.7);
  if (dates.length > 0) result.dateOfBirth = dates[0].text;
  if (dates.length > 1) result.expiryDate = dates[1].text;

  // Extract person name (usually first organization/person entity)
  const persons = entities.filter((e) => e.type === "PERSON" && e.confidence > 0.7);
  if (persons.length > 0) {
    const name = persons[0].text.split(" ");
    result.firstName = name[0];
    result.lastName = name.slice(1).join(" ");
  }

  // Detect document type
  if (/paspoort|passport/i.test(text)) result.documentType = "PASSPORT";
  else if (/rijbewijs|driving|license/i.test(text)) result.documentType = "DRIVING_LICENSE";
  else if (/identiteit|id[\s-]?kaart|identity/i.test(text)) result.documentType = "ID_CARD";

  // Extract nationality
  const nationMatch = /(?:nationaliteit|nationality|land|country)\s*[:=]?\s*([A-Za-z]+)/i.exec(text);
  if (nationMatch) result.nationality = nationMatch[1];

  return result;
}

/**
 * Calculate confidence score for an entity based on context.
 */
function calculateEntityConfidence(type: EntityType, text: string, fullText: string, position: number): number {
  let confidence = 0.5;

  // Context boost: how many times does this entity appear?
  const count = (fullText.match(new RegExp(escapeRegExp(text), "gi")) || []).length;
  confidence += Math.min(count * 0.05, 0.2);

  // Length boost: longer, more specific entities are more likely correct
  if (text.length > 5) confidence += 0.1;
  if (text.length > 10) confidence += 0.1;

  // Position boost: entities at certain positions are more likely
  const relativePosition = position / fullText.length;
  if (relativePosition > 0.1 && relativePosition < 0.9) confidence += 0.1;

  // Type-specific adjustments
  switch (type) {
    case "EMAIL":
      confidence = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(text) ? 0.95 : 0.5;
      break;
    case "TAX_ID":
      confidence = /^NL\d{9}B\d{2}$/.test(text) ? 0.95 : 0.5;
      break;
    case "ACCOUNT_NUMBER":
      confidence = /^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(text) ? 0.9 : 0.5;
      break;
    case "DATE":
      confidence = Math.min(confidence, 0.9);
      break;
  }

  return Math.min(confidence, 0.99);
}

/**
 * Check if word is too common to be meaningful.
 */
function isCommonWord(word: string): boolean {
  const common = [
    "de",
    "en",
    "het",
    "een",
    "van",
    "aan",
    "in",
    "op",
    "of",
    "maar",
    "uit",
    "te",
    "voor",
    "na",
    "met",
    "door",
    "over",
    "onder",
    "naar",
  ];
  return common.includes(word.toLowerCase());
}

/**
 * Escape special regex characters.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
