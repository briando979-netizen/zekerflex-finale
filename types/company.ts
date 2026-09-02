import type { CompanyStatus } from "@prisma/client";

/**
 * Provider-neutral company profile. Every registry integration (KVKBase today,
 * a fallback tomorrow) normalises its response into this shape so the rest of
 * the platform never sees a vendor-specific payload.
 */
export interface CompanyAddress {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
}

export interface CompanyActivity {
  sbiCode: string;
  description: string | null;
  isMain: boolean;
}

export interface CompanyVat {
  number: string | null;
  valid: boolean;
  status: string | null; // "validated" | "stale" | "malformed" | "unvalidated"
  validatedAt: string | null; // ISO
  checksumValid: boolean | null;
}

export interface CompanyProfile {
  kvkNumber: string;
  legalName: string;
  tradeName: string | null;
  legalForm: string | null;
  status: CompanyStatus;
  isActive: boolean;
  insolvent: boolean;
  establishmentNumber: string | null;
  address: CompanyAddress;
  activities: CompanyActivity[];
  sbiCodes: string[];
  registrationDate: string | null; // ISO date
  employeeCount: number | null;
  /** Present only on an enriched lookup. */
  vat: CompanyVat | null;
  /** The untouched provider payload, for audit / re-parsing. */
  raw: unknown;
}

export interface CompanySearchHit {
  kvkNumber: string;
  legalName: string;
  city: string | null;
  isActive: boolean;
}

export interface VatValidation {
  vatNumber: string;
  valid: boolean;
  name: string | null;
  address: string | null;
  status: string | null;
  checksumValid: boolean | null;
  validatedAt: string | null;
}
