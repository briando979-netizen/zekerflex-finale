import { CompanyStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { lookupCompany, validateVat } from "@/lib/integrations/kvkbase";
import type { CompanyProfile } from "@/types/company";

// ---------------------------------------------------------------------------
// Company registration workflow
//
// During onboarding we take a KVK number, pull the enriched Handelsregister
// profile from KVKBase, validate it (exists + active + a legal form that may
// contract), persist a CompanyRegistration snapshot and link it to the
// freelancer profile or enterprise tenant. The enriched lookup also carries a
// VIES-backed VAT result. `kvkValid` (a matching-engine gate) is only set here.
// ---------------------------------------------------------------------------

// Legal forms that can legitimately act as an independent contractor / employer.
const CONTRACTABLE_LEGAL_FORMS = [
  "eenmanszaak",
  "vennootschap onder firma",
  "vof",
  "besloten vennootschap",
  "bv",
  "naamloze vennootschap",
  "maatschap",
  "commanditaire vennootschap",
  "cv",
  "coöperatie",
  "cooperatie",
  "stichting",
];

export interface CompanyValidationResult {
  ok: boolean;
  profile: CompanyProfile;
  reasons: string[];
}

export function validateCompanyProfile(
  profile: CompanyProfile,
): CompanyValidationResult {
  const reasons: string[] = [];

  if (profile.status === CompanyStatus.DISSOLVED) {
    reasons.push("De inschrijving in het Handelsregister is uitgeschreven.");
  } else if (profile.status === CompanyStatus.UNKNOWN) {
    reasons.push("De actieve status kon niet worden bevestigd.");
  }
  if (profile.insolvent) {
    reasons.push("Er is een insolventie / faillissement geregistreerd.");
  }
  if (profile.legalForm) {
    const lf = profile.legalForm.toLowerCase();
    if (!CONTRACTABLE_LEGAL_FORMS.some((allowed) => lf.includes(allowed))) {
      reasons.push(`Rechtsvorm "${profile.legalForm}" wordt niet ondersteund.`);
    }
  }

  return { ok: reasons.length === 0, profile, reasons };
}

interface VatSnapshot {
  number: string | null;
  valid: boolean | null;
  status: string | null;
  validatedAt: Date | null;
}

async function resolveVat(
  profile: CompanyProfile,
  fallbackVatNumber: string | null,
): Promise<VatSnapshot> {
  // Prefer the VAT block from the enriched KVK lookup.
  if (profile.vat?.number) {
    return {
      number: profile.vat.number,
      valid: profile.vat.valid,
      status: profile.vat.status,
      validatedAt: profile.vat.validatedAt
        ? new Date(profile.vat.validatedAt)
        : null,
    };
  }
  // Otherwise validate the freelancer's stored VAT number explicitly.
  if (fallbackVatNumber) {
    try {
      const v = await validateVat(fallbackVatNumber);
      return {
        number: v.vatNumber,
        valid: v.valid,
        status: v.status,
        validatedAt: v.validatedAt ? new Date(v.validatedAt) : null,
      };
    } catch (err) {
      logger.warn("VAT validation failed during registration", {
        error: (err as Error).message,
      });
    }
  }
  return { number: fallbackVatNumber, valid: null, status: null, validatedAt: null };
}

async function upsertRegistration(
  tx: Prisma.TransactionClient,
  profile: CompanyProfile,
  vat: VatSnapshot,
): Promise<string> {
  const data = {
    source: "KVKBASE",
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    legalForm: profile.legalForm,
    status: profile.status,
    isActive: profile.isActive,
    insolvent: profile.insolvent,
    establishmentNumber: profile.establishmentNumber,
    street: profile.address.street,
    houseNumber: profile.address.houseNumber,
    postalCode: profile.address.postalCode,
    city: profile.address.city,
    country: profile.address.country,
    sbiCodes: profile.sbiCodes,
    activities: profile.activities as unknown as Prisma.InputJsonValue,
    registrationDate: profile.registrationDate
      ? new Date(profile.registrationDate)
      : null,
    employeeCount: profile.employeeCount,
    vatNumber: vat.number,
    vatValid: vat.valid,
    vatStatus: vat.status,
    vatValidatedAt: vat.validatedAt,
    rawProfile: profile.raw as Prisma.InputJsonValue,
    fetchedAt: new Date(),
  } satisfies Prisma.CompanyRegistrationUncheckedUpdateInput;

  const row = await tx.companyRegistration.upsert({
    where: { kvkNumber: profile.kvkNumber },
    create: { kvkNumber: profile.kvkNumber, ...data },
    update: data,
  });
  return row.id;
}

export interface RegisterCompanyResult {
  companyRegistrationId: string;
  kvkValid: boolean;
  vatValid: boolean;
  validation: CompanyValidationResult;
  profile: CompanyProfile;
}

export interface RegisterFreelancerCompanyInput {
  freelancerProfileId: string;
  kvkNumber: string;
  /** Persist the snapshot even when validation fails (kvkValid stays false). */
  allowInactive?: boolean;
}

export async function registerFreelancerCompany(
  input: RegisterFreelancerCompanyInput,
): Promise<RegisterCompanyResult> {
  const log = logger.child({
    module: "company-registration",
    freelancerProfileId: input.freelancerProfileId,
  });

  const fp = await prisma.freelancerProfile.findUnique({
    where: { id: input.freelancerProfileId },
    select: { id: true, vatNumber: true },
  });
  if (!fp) throw AppError.notFound("Freelancer profile not found");

  const profile = await lookupCompany(input.kvkNumber, { enrich: true });
  const validation = validateCompanyProfile(profile);
  if (!validation.ok && !input.allowInactive) {
    throw AppError.precondition(
      `Bedrijfsvalidatie mislukt: ${validation.reasons.join(" ")}`,
    );
  }

  const vat = await resolveVat(profile, fp.vatNumber);
  const kvkValid = validation.ok;
  const vatValid = vat.valid === true;

  const companyRegistrationId = await prisma.$transaction(async (tx) => {
    const regId = await upsertRegistration(tx, profile, vat);
    await tx.freelancerProfile.update({
      where: { id: fp.id },
      data: {
        kvkNumber: profile.kvkNumber,
        kvkValid,
        kvkVerifiedAt: new Date(),
        vatNumber: vat.number ?? fp.vatNumber,
        vatValid,
        companyRegistrationId: regId,
      },
    });
    return regId;
  });

  log.info("freelancer company registered", {
    kvkNumber: profile.kvkNumber,
    kvkValid,
    vatValid,
  });

  return { companyRegistrationId, kvkValid, vatValid, validation, profile };
}

export interface RegisterTenantCompanyInput {
  tenantId: string;
  kvkNumber: string;
  allowInactive?: boolean;
}

export async function registerTenantCompany(
  input: RegisterTenantCompanyInput,
): Promise<RegisterCompanyResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true },
  });
  if (!tenant) throw AppError.notFound("Organization not found");

  const profile = await lookupCompany(input.kvkNumber, { enrich: true });
  const validation = validateCompanyProfile(profile);
  if (!validation.ok && !input.allowInactive) {
    throw AppError.precondition(
      `Bedrijfsvalidatie mislukt: ${validation.reasons.join(" ")}`,
    );
  }

  const vat = await resolveVat(profile, null);

  const companyRegistrationId = await prisma.$transaction(async (tx) => {
    const regId = await upsertRegistration(tx, profile, vat);
    await tx.tenant.update({
      where: { id: tenant.id },
      data: {
        kvkNumber: profile.kvkNumber,
        companyRegistrationId: regId,
        ...(vat.number ? { vatNumber: vat.number } : {}),
      },
    });
    return regId;
  });

  logger.info("tenant company registered", {
    tenantId: input.tenantId,
    kvkNumber: profile.kvkNumber,
    kvkValid: validation.ok,
  });

  return {
    companyRegistrationId,
    kvkValid: validation.ok,
    vatValid: vat.valid === true,
    validation,
    profile,
  };
}
