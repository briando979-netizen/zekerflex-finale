/**
 * Validation & Verification Module
 * Cross-reference validation, completeness checks, quality scoring,
 * and exception handling for document processing.
 */

import { prisma } from "@/lib/prisma";
import { DocumentClassification, ValidationStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { type ExtractedField } from "@/lib/idp/extraction";

export interface ValidationResult {
  status: ValidationStatus;
  passed: boolean;
  score: number; // 0-1 overall quality score
  messages: ValidationMessage[];
  completenessScore: number; // 0-1 what fields are present
}

export interface ValidationMessage {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  fieldName?: string;
  suggestedAction?: string;
}

/**
 * Validate extracted fields against rules and format requirements.
 */
export async function validateDocument(
  documentId: string,
  documentType: DocumentClassification,
  extractedFields: ExtractedField[],
  tenantId: string,
): Promise<ValidationResult> {
  const messages: ValidationMessage[] = [];
  const fieldMap = new Map(extractedFields.map((f) => [f.fieldName, f]));

  // Load validation rules for this document type
  const rules = await prisma.validationRule.findMany({
    where: {
      tenantId,
      documentType,
      isActive: true,
    },
  });

  let passedChecks = 0;
  let totalChecks = 0;

  // Execute all validation rules
  for (const rule of rules) {
    totalChecks++;
    const result = await executeValidationRule(rule, fieldMap, documentId, messages);
    if (result) passedChecks++;

    // Record execution
    await prisma.validationRuleExecution.create({
      data: {
        documentId,
        ruleId: rule.id,
        status: result ? ValidationStatus.PASSED : ValidationStatus.FAILED,
        passed: result,
        message: messages[messages.length - 1]?.message,
      },
    });
  }

  // Run type-specific validations
  const typeSpecificMessages = validateDocumentType(documentType, fieldMap);
  messages.push(...typeSpecificMessages);

  // Calculate completeness
  const completenessScore = calculateCompleteness(documentType, fieldMap);

  // Calculate overall quality score
  const rulesScore = totalChecks > 0 ? passedChecks / totalChecks : 0.5;
  const qualityScore = (rulesScore + completenessScore) / 2;

  // Determine overall status
  let status = ValidationStatus.PASSED;
  const errors = messages.filter((m) => m.severity === "error");
  const warnings = messages.filter((m) => m.severity === "warning");

  if (errors.length > 0) {
    status = ValidationStatus.FAILED;
  } else if (warnings.length > 0) {
    status = ValidationStatus.FAILED_WITH_WARNINGS;
  }

  return {
    status,
    passed: status === ValidationStatus.PASSED,
    score: qualityScore,
    messages,
    completenessScore,
  };
}

/**
 * Execute a single validation rule.
 */
async function executeValidationRule(
  rule: Awaited<ReturnType<typeof prisma.validationRule.findMany>>[0],
  fieldMap: Map<string, ExtractedField>,
  documentId: string,
  messages: ValidationMessage[],
): Promise<boolean> {
  const definition = rule.ruleDefinition as Record<string, unknown>;

  try {
    switch (rule.ruleType) {
      case "REQUIRED":
        return validateRequired(rule.fieldName, fieldMap, messages);

      case "FORMAT":
        return validateFormat(rule.fieldName, fieldMap, definition, messages);

      case "RANGE":
        return validateRange(rule.fieldName, fieldMap, definition, messages);

      case "CROSS_REFERENCE":
        return validateCrossReference(rule.fieldName, fieldMap, definition, documentId, messages);

      case "COMPLETENESS":
        return validateCompleteness(rule.documentType, fieldMap) > (definition.threshold as number | undefined || 0.7);

      default:
        return true;
    }
  } catch (err) {
    messages.push({
      severity: "warning",
      code: "VALIDATION_ERROR",
      message: `Validation rule failed: ${String(err)}`,
      fieldName: rule.fieldName,
    });
    return false;
  }
}

/**
 * REQUIRED: Check if a field exists and has a non-empty value.
 */
function validateRequired(fieldName: string, fieldMap: Map<string, ExtractedField>, messages: ValidationMessage[]): boolean {
  const field = fieldMap.get(fieldName);

  if (!field || !field.value) {
    messages.push({
      severity: "error",
      code: "FIELD_REQUIRED",
      message: `Veld '${fieldName}' is verplicht maar niet gevonden.`,
      fieldName,
      suggestedAction: "Controleer het document handmatig op dit gegeven.",
    });
    return false;
  }

  if (field.confidence < 0.6) {
    messages.push({
      severity: "warning",
      code: "FIELD_LOW_CONFIDENCE",
      message: `Veld '${fieldName}' gevonden maar met lage zekerheid (${(field.confidence * 100).toFixed(0)}%).`,
      fieldName,
      suggestedAction: "Verifieer dit gegeven handmatig.",
    });
  }

  return true;
}

/**
 * FORMAT: Validate field value against expected format.
 */
function validateFormat(
  fieldName: string,
  fieldMap: Map<string, ExtractedField>,
  definition: Record<string, unknown>,
  messages: ValidationMessage[],
): boolean {
  const field = fieldMap.get(fieldName);
  if (!field) return true; // Not required for this rule

  const pattern = definition.pattern as string | undefined;
  if (!pattern) return true;

  const regex = new RegExp(pattern);
  const value = String(field.value);

  if (!regex.test(value)) {
    messages.push({
      severity: "error",
      code: "FORMAT_INVALID",
      message: `Veld '${fieldName}' heeft ongeldige opmaak: '${value}' komt niet overeen met verwachte format.`,
      fieldName,
      suggestedAction: `Zorg dat het formaat '${pattern}' volgt.`,
    });
    return false;
  }

  return true;
}

/**
 * RANGE: Validate numeric values are within expected range.
 */
function validateRange(
  fieldName: string,
  fieldMap: Map<string, ExtractedField>,
  definition: Record<string, unknown>,
  messages: ValidationMessage[],
): boolean {
  const field = fieldMap.get(fieldName);
  if (!field) return true;

  const value = Number(field.value);
  if (isNaN(value)) {
    messages.push({
      severity: "warning",
      code: "RANGE_NOT_NUMERIC",
      message: `Veld '${fieldName}' is geen getal: '${field.value}'.`,
      fieldName,
    });
    return false;
  }

  const min = definition.min as number | undefined;
  const max = definition.max as number | undefined;

  if (min !== undefined && value < min) {
    messages.push({
      severity: "error",
      code: "RANGE_TOO_LOW",
      message: `Veld '${fieldName}' waarde (${value}) is lager dan minimum (${min}).`,
      fieldName,
    });
    return false;
  }

  if (max !== undefined && value > max) {
    messages.push({
      severity: "error",
      code: "RANGE_TOO_HIGH",
      message: `Veld '${fieldName}' waarde (${value}) exceeds maximum (${max}).`,
      fieldName,
    });
    return false;
  }

  return true;
}

/**
 * CROSS_REFERENCE: Validate field values against external sources or other fields.
 */
async function validateCrossReference(
  fieldName: string,
  fieldMap: Map<string, ExtractedField>,
  definition: Record<string, unknown>,
  documentId: string,
  messages: ValidationMessage[],
): Promise<boolean> {
  const field = fieldMap.get(fieldName);
  if (!field) return true;

  const referenceType = definition.type as string | undefined;
  if (!referenceType) return true;

  // Simple validation logic for common reference types
  switch (referenceType) {
    case "kvk_number":
      // In production: call KVK registry API
      return validateKvkNumber(String(field.value), messages, fieldName);

    case "vat_number":
      // In production: call VIES API
      return validateVatNumber(String(field.value), messages, fieldName);

    case "iban":
      return validateIban(String(field.value), messages, fieldName);

    default:
      return true;
  }
}

/**
 * Validate KVK number format (8 digits, Dutch).
 */
function validateKvkNumber(kvk: string, messages: ValidationMessage[], fieldName: string): boolean {
  const kvkRegex = /^\d{8}$/;
  if (!kvkRegex.test(kvk)) {
    messages.push({
      severity: "error",
      code: "INVALID_KVK",
      message: `KVK-nummer '${kvk}' is ongeldig. Verwacht: 8 cijfers.`,
      fieldName,
      suggestedAction: "Controleer het KVK-nummer op het document.",
    });
    return false;
  }
  return true;
}

/**
 * Validate VAT number format (NL + 9 digits + B + 2 digits).
 */
function validateVatNumber(vat: string, messages: ValidationMessage[], fieldName: string): boolean {
  const vatRegex = /^NL\d{9}B\d{2}$/;
  if (!vatRegex.test(vat.toUpperCase())) {
    messages.push({
      severity: "error",
      code: "INVALID_VAT",
      message: `Btw-nummer '${vat}' is ongeldig. Verwacht: NLxxxxxxxxxBxx.`,
      fieldName,
      suggestedAction: "Controleer het btw-nummer op het document.",
    });
    return false;
  }
  return true;
}

/**
 * Validate IBAN format (international bank account number).
 */
function validateIban(iban: string, messages: ValidationMessage[], fieldName: string): boolean {
  const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/;
  if (!ibanRegex.test(iban.replace(/\s/g, ""))) {
    messages.push({
      severity: "error",
      code: "INVALID_IBAN",
      message: `IBAN '${iban}' is ongeldig.`,
      fieldName,
      suggestedAction: "Voer een geldig IBAN in.",
    });
    return false;
  }
  return true;
}

/**
 * Type-specific validation rules for different document classifications.
 */
function validateDocumentType(
  documentType: DocumentClassification,
  fieldMap: Map<string, ExtractedField>,
): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  switch (documentType) {
    case DocumentClassification.INVOICE:
      // Invoice must have: number, date, total, potentially tax
      if (!fieldMap.has("invoice_number") || !fieldMap.get("invoice_number")?.value) {
        messages.push({
          severity: "warning",
          code: "INVOICE_NO_NUMBER",
          message: "Factuurnummer niet gevonden. Dit kan voor handmatige goedkeuring nodig zijn.",
          fieldName: "invoice_number",
        });
      }
      if (!fieldMap.has("total_amount") || !fieldMap.get("total_amount")?.value) {
        messages.push({
          severity: "error",
          code: "INVOICE_NO_TOTAL",
          message: "Totaalbedrag niet gevonden. Dit veld is verplicht.",
          fieldName: "total_amount",
        });
      }
      break;

    case DocumentClassification.RECEIPT:
      // Receipt must have: date, total
      if (!fieldMap.has("transaction_date") || !fieldMap.get("transaction_date")?.value) {
        messages.push({
          severity: "warning",
          code: "RECEIPT_NO_DATE",
          message: "Datum niet gevonden op bon.",
          fieldName: "transaction_date",
        });
      }
      break;

    case DocumentClassification.CERTIFICATE:
      // Certificate must have: expiry date (for ongoing validity)
      if (!fieldMap.has("expiry_date") || !fieldMap.get("expiry_date")?.value) {
        messages.push({
          severity: "info",
          code: "CERT_NO_EXPIRY",
          message: "Vervaldatum niet gevonden.",
          fieldName: "expiry_date",
        });
      }
      break;

    case DocumentClassification.ID_DOCUMENT:
      // ID must have: document number, validity
      if (!fieldMap.has("document_number") || !fieldMap.get("document_number")?.value) {
        messages.push({
          severity: "error",
          code: "ID_NO_NUMBER",
          message: "Documentnummer niet gevonden.",
          fieldName: "document_number",
        });
      }
      break;
  }

  return messages;
}

/**
 * Calculate document completeness (0-1) based on required fields present.
 */
export function calculateCompleteness(documentType: DocumentClassification, fieldMap: Map<string, ExtractedField>): number {
  const requirements: Record<DocumentClassification, { required: string[]; optional: string[] }> = {
    INVOICE: {
      required: ["total_amount"],
      optional: ["invoice_number", "date", "vat_number"],
    },
    RECEIPT: {
      required: ["transaction_date", "total_amount"],
      optional: ["vendor"],
    },
    CERTIFICATE: {
      required: ["certificate_type"],
      optional: ["expiry_date", "issue_date", "document_number"],
    },
    ID_DOCUMENT: {
      required: ["document_number"],
      optional: ["document_type", "expiry_date"],
    },
    CONTRACT: {
      required: ["document_number"],
      optional: ["date"],
    },
    TIMESHEET: {
      required: ["date"],
      optional: ["hours"],
    },
    RECEIPT_REGISTER: {
      required: ["kvk_number"],
      optional: ["document_number"],
    },
    UNKNOWN: {
      required: [],
      optional: [],
    },
  };

  const req = requirements[documentType];
  if (!req || req.required.length === 0) return 0.5;

  const requiredPresent = req.required.filter((f) => fieldMap.has(f) && fieldMap.get(f)?.value).length;
  const optionalPresent = req.optional.filter((f) => fieldMap.has(f) && fieldMap.get(f)?.value).length;

  const requiredScore = requiredPresent / req.required.length;
  const optionalScore = req.optional.length > 0 ? optionalPresent / req.optional.length : 1;

  return (requiredScore * 0.7 + optionalScore * 0.3) * 0.9 + 0.1; // Min 0.1 even if nothing found
}

/**
 * Calculate overall quality score (0-1) for validation results.
 */
export function calculateQualityScore(validation: ValidationResult): number {
  const errorCount = validation.messages.filter((m) => m.severity === "error").length;
  const warningCount = validation.messages.filter((m) => m.severity === "warning").length;

  const errorPenalty = Math.min(errorCount * 0.2, 0.9);
  const warningPenalty = Math.min(warningCount * 0.05, 0.3);

  return Math.max(0, validation.completenessScore - errorPenalty - warningPenalty);
}
