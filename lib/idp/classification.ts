/**
 * Document Classification Module
 * ML-based document type detection with auto-routing and category prediction.
 * Integrates with OCR output and uses pattern matching + confidence scoring.
 */

import { DocumentClassification } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { leesDocument } from "@/lib/ocr/lezen";

export interface ClassificationResult {
  documentType: DocumentClassification;
  confidence: number; // 0-1
  reasoning: string;
  alternativeTypes?: Array<{ type: DocumentClassification; confidence: number }>;
}

/**
 * Patterns for each document type (Dutch-first since all text is Dutch)
 */
const CLASSIFICATION_PATTERNS: Record<DocumentClassification, RegExp[]> = {
  INVOICE: [
    /factuur|invoice|rekening|bill|order|bestelbon/i,
    /btw[:\s]+|vat[\s:]/i,
    /factuurnummer|invoice number|nummer/i,
    /totaal\s+(?:bedrag|amount)|totaal\s+te\s+betalen/i,
  ],
  RECEIPT: [
    /bon|receipt|kasbon|kwitantie|quittance/i,
    /totaal|total|bedrag amount/i,
    /datum|date|time|tijd/i,
    /pin|contant|cash|betaling|payment/i,
  ],
  CERTIFICATE: [
    /certificaat|certificate|diploma|bewijs|attest|credential/i,
    /geldig|valid|expires|vervalt|expiration/i,
    /afgegeven|issued|issued on|date of issue/i,
  ],
  ID_DOCUMENT: [
    /identiteit|identity|paspoort|passport|rijbewijs|driving licence|id card/i,
    /geboortedatum|date of birth|burgerservicenummer|bsn/i,
    /issuing|country|land|geldigheidsduur|validity/i,
  ],
  CONTRACT: [
    /overeenkomst|contract|agreement|overeenkomsten|akkoord|accord/i,
    /partijen|parties|clausules|clauses|bedingen|conditions/i,
    /handtekening|signature|getekend|signed|datum/i,
  ],
  TIMESHEET: [
    /uren|hours|timesheet|timesheets|rooster|roster|werkrooster/i,
    /datum|date|begin|end|einde|start|uur|hour/i,
    /werknemer|employee|medewerker|project|taak|task/i,
  ],
  RECEIPT_REGISTER: [
    /handelsregister|chamber of commerce|kamer van koophandel|uittreksel/i,
    /kvk|trade register|kvk-nummer/i,
    /bedrijf|business|company|onderneming/i,
  ],
  UNKNOWN: [],
};

/**
 * Classify a document based on OCR-extracted text.
 * Returns the most likely classification with confidence score and reasoning.
 */
export function classifyDocument(ocrText: string): ClassificationResult {
  if (!ocrText || ocrText.trim().length === 0) {
    return {
      documentType: DocumentClassification.UNKNOWN,
      confidence: 0,
      reasoning: "Geen tekst gevonden in document",
    };
  }

  // Parse the OCR text using existing OCR reader
  const gelezen = leesDocument(ocrText);

  // Score each document type
  const scores: Record<DocumentClassification, { matches: number; patterns: number }> = {
    INVOICE: { matches: 0, patterns: 0 },
    RECEIPT: { matches: 0, patterns: 0 },
    CERTIFICATE: { matches: 0, patterns: 0 },
    ID_DOCUMENT: { matches: 0, patterns: 0 },
    CONTRACT: { matches: 0, patterns: 0 },
    TIMESHEET: { matches: 0, patterns: 0 },
    RECEIPT_REGISTER: { matches: 0, patterns: 0 },
    UNKNOWN: { matches: 0, patterns: 0 },
  };

  // Score based on OCR lezen results
  if (gelezen.soort === "certificaat") {
    scores.CERTIFICATE.matches += 3;
  } else if (gelezen.soort === "bon") {
    scores.RECEIPT.matches += 3;
  } else if (gelezen.soort === "uittreksel") {
    scores.RECEIPT_REGISTER.matches += 3;
  }

  if (gelezen.certType) {
    scores.CERTIFICATE.matches += 2;
  }

  if (gelezen.bedragCents) {
    scores.INVOICE.matches += 1;
    scores.RECEIPT.matches += 1;
  }

  if (gelezen.btw) {
    scores.INVOICE.matches += 2;
  }

  if (gelezen.kvk) {
    scores.RECEIPT_REGISTER.matches += 3;
  }

  // Score based on pattern matching
  for (const [type, patterns] of Object.entries(CLASSIFICATION_PATTERNS)) {
    const typeName = type as DocumentClassification;
    if (typeName === DocumentClassification.UNKNOWN) continue;

    scores[typeName].patterns = patterns.length;
    for (const pattern of patterns) {
      if (pattern.test(ocrText)) {
        scores[typeName].matches += 1;
      }
    }
  }

  // Calculate confidence scores
  const typeScores: Array<{ type: DocumentClassification; score: number }> = [];

  for (const [type, { matches, patterns }] of Object.entries(scores)) {
    if (type === "UNKNOWN") continue;
    const typeName = type as DocumentClassification;
    const confidence = patterns > 0 ? matches / patterns : 0;
    typeScores.push({ type: typeName, score: confidence });
  }

  // Sort by score
  typeScores.sort((a, b) => b.score - a.score);

  if (typeScores.length === 0 || typeScores[0].score === 0) {
    return {
      documentType: DocumentClassification.UNKNOWN,
      confidence: 0,
      reasoning: "Geen overeenkomsten met bekende documenttypen",
    };
  }

  const winner = typeScores[0];
  const reasoning = `${winner.score === 1 ? "Volledige" : "Gedeeltelijke"} overeenkomst met ${winner.type} (${(winner.score * 100).toFixed(0)}%)`;

  return {
    documentType: winner.type,
    confidence: winner.score,
    reasoning,
    alternativeTypes: typeScores.slice(1, 3).map(({ type, score }) => ({
      type,
      confidence: score,
    })),
  };
}

/**
 * Get routing rules for a document based on its classification.
 * Determines where the document should flow in the processing pipeline.
 */
export function getRoutingRules(
  classification: DocumentClassification,
): {
  requiresManualReview: boolean;
  priority: "high" | "normal" | "low";
  nextStage: string;
  requiredValidations: string[];
} {
  const routingMap: Record<
    DocumentClassification,
    {
      requiresManualReview: boolean;
      priority: "high" | "normal" | "low";
      nextStage: string;
      requiredValidations: string[];
    }
  > = {
    INVOICE: {
      requiresManualReview: false,
      priority: "high",
      nextStage: "extraction",
      requiredValidations: ["invoice_number", "total_amount", "date"],
    },
    RECEIPT: {
      requiresManualReview: false,
      priority: "normal",
      nextStage: "extraction",
      requiredValidations: ["date", "total_amount"],
    },
    CERTIFICATE: {
      requiresManualReview: true,
      priority: "high",
      nextStage: "manual_review",
      requiredValidations: ["cert_type", "expiry_date"],
    },
    ID_DOCUMENT: {
      requiresManualReview: true,
      priority: "high",
      nextStage: "manual_review",
      requiredValidations: ["document_number", "validity"],
    },
    CONTRACT: {
      requiresManualReview: true,
      priority: "high",
      nextStage: "manual_review",
      requiredValidations: ["signatures", "date"],
    },
    TIMESHEET: {
      requiresManualReview: false,
      priority: "normal",
      nextStage: "extraction",
      requiredValidations: ["date", "hours"],
    },
    RECEIPT_REGISTER: {
      requiresManualReview: false,
      priority: "normal",
      nextStage: "extraction",
      requiredValidations: ["kvk_number"],
    },
    UNKNOWN: {
      requiresManualReview: true,
      priority: "low",
      nextStage: "manual_review",
      requiredValidations: [],
    },
  };

  return routingMap[classification];
}

/**
 * Get the category for a document based on its classification.
 * Used for tagging and organization.
 */
export function getDocumentCategory(classification: DocumentClassification): string {
  const categoryMap: Record<DocumentClassification, string> = {
    INVOICE: "financial",
    RECEIPT: "financial",
    CERTIFICATE: "compliance",
    ID_DOCUMENT: "identity",
    CONTRACT: "legal",
    TIMESHEET: "hr",
    RECEIPT_REGISTER: "business",
    UNKNOWN: "unclassified",
  };

  return categoryMap[classification];
}
