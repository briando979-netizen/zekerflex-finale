import {
  ModelAgreementStatus,
  ModelAgreementType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Wet DBA model agreements (modelovereenkomsten)
//
// The instant a freelancer engages with a client (accepts an offer or is
// auto-assigned) the platform provisions a model-agreement instance for that
// freelancer <-> client relationship. It is created unsigned - work may start
// immediately - and signatures are collected asynchronously.
//
// One open agreement covers the whole relationship: a second engagement with
// the same client reuses it rather than spawning a duplicate.
// ---------------------------------------------------------------------------

interface TemplateSpec {
  key: string;
  version: string;
  /** Official Belastingdienst registration number, once the template is filed. */
  belastingdienstNr: string | null;
}

const TEMPLATES: Record<ModelAgreementType, TemplateSpec> = {
  VRIJE_VERVANGING: {
    key: "zekerflex/vrije-vervanging",
    version: "2024.1",
    belastingdienstNr: null,
  },
  GEEN_WERKGEVERSGEZAG: {
    key: "zekerflex/geen-werkgeversgezag",
    version: "2024.1",
    belastingdienstNr: null,
  },
  TUSSENKOMST: {
    key: "zekerflex/tussenkomst",
    version: "2024.1",
    belastingdienstNr: null,
  },
  BRANCHE: {
    key: "zekerflex/branche-retail",
    version: "2024.1",
    belastingdienstNr: null,
  },
};

const OPEN_STATUSES: ModelAgreementStatus[] = [
  ModelAgreementStatus.DRAFT,
  ModelAgreementStatus.PENDING_FREELANCER_SIGNATURE,
  ModelAgreementStatus.PENDING_CLIENT_SIGNATURE,
  ModelAgreementStatus.ACTIVE,
];

async function nextReference(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  const key = `model-agreement:${year}`;
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `ZF-MOD-${year}-${String(counter.value).padStart(6, "0")}`;
}

export interface EnsureModelAgreementInput {
  freelancerId: string;
  tenantId: string;
  branchId?: string | null;
  shiftId?: string | null;
  assignmentId?: string | null;
  type?: ModelAgreementType;
  hourlyRateCents?: number | null;
  scopeDescription?: string | null;
}

export interface EnsureModelAgreementResult {
  id: string;
  reference: string;
  status: ModelAgreementStatus;
  created: boolean;
}

/**
 * Ensure a current model agreement exists for a freelancer <-> client pair.
 * Idempotent: an open agreement is reused (and back-linked to the triggering
 * assignment if it had none). Runs inside the caller's transaction.
 */
export async function ensureModelAgreement(
  tx: Prisma.TransactionClient,
  input: EnsureModelAgreementInput,
): Promise<EnsureModelAgreementResult> {
  const existing = await tx.modelAgreement.findFirst({
    where: {
      freelancerId: input.freelancerId,
      tenantId: input.tenantId,
      status: { in: OPEN_STATUSES },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    if (!existing.assignmentId && input.assignmentId) {
      await tx.modelAgreement.update({
        where: { id: existing.id },
        data: {
          assignmentId: input.assignmentId,
          ...(input.shiftId && !existing.shiftId
            ? { shiftId: input.shiftId }
            : {}),
          ...(input.branchId && !existing.branchId
            ? { branchId: input.branchId }
            : {}),
        },
      });
    }
    return {
      id: existing.id,
      reference: existing.reference,
      status: existing.status,
      created: false,
    };
  }

  const [freelancer, tenant] = await Promise.all([
    tx.freelancerProfile.findUniqueOrThrow({
      where: { id: input.freelancerId },
      select: {
        kvkNumber: true,
        user: { select: { fullName: true } },
        companyRegistration: { select: { legalName: true } },
      },
    }),
    tx.tenant.findUniqueOrThrow({
      where: { id: input.tenantId },
      select: {
        name: true,
        kvkNumber: true,
        companyRegistration: { select: { legalName: true } },
      },
    }),
  ]);

  const type = input.type ?? ModelAgreementType.VRIJE_VERVANGING;
  const template = TEMPLATES[type];
  const reference = await nextReference(tx, new Date().getUTCFullYear());

  const created = await tx.modelAgreement.create({
    data: {
      reference,
      freelancerId: input.freelancerId,
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      shiftId: input.shiftId ?? null,
      assignmentId: input.assignmentId ?? null,
      type,
      status: ModelAgreementStatus.PENDING_FREELANCER_SIGNATURE,
      templateKey: template.key,
      templateVersion: template.version,
      belastingdienstNr: template.belastingdienstNr,
      freelancerLegalName:
        freelancer.companyRegistration?.legalName ?? freelancer.user.fullName,
      freelancerKvkNumber: freelancer.kvkNumber,
      clientLegalName: tenant.companyRegistration?.legalName ?? tenant.name,
      clientKvkNumber: tenant.kvkNumber,
      hourlyRateCents: input.hourlyRateCents ?? null,
      scopeDescription: input.scopeDescription ?? null,
    },
  });

  logger.info("model agreement provisioned", {
    reference,
    freelancerId: input.freelancerId,
    tenantId: input.tenantId,
    type,
  });

  return {
    id: created.id,
    reference: created.reference,
    status: created.status,
    created: true,
  };
}

export type SigningParty = "FREELANCER" | "CLIENT";

/** Compute the next status after a party signs. */
export function nextStatusAfterSignature(
  freelancerSignedAt: Date | null,
  clientSignedAt: Date | null,
): ModelAgreementStatus {
  if (freelancerSignedAt && clientSignedAt) return ModelAgreementStatus.ACTIVE;
  if (freelancerSignedAt) return ModelAgreementStatus.PENDING_CLIENT_SIGNATURE;
  return ModelAgreementStatus.PENDING_FREELANCER_SIGNATURE;
}

export async function signModelAgreement(
  agreementId: string,
  party: SigningParty,
  actorUserId?: string | null,
): Promise<{ status: ModelAgreementStatus; reference: string }> {
  const result = await prisma.$transaction(async (tx) => {
    const agreement = await tx.modelAgreement.findUnique({
      where: { id: agreementId },
    });
    if (!agreement) throw AppError.notFound("Model agreement not found");
    if (
      agreement.status === ModelAgreementStatus.DECLINED ||
      agreement.status === ModelAgreementStatus.SUPERSEDED ||
      agreement.status === ModelAgreementStatus.EXPIRED
    ) {
      throw AppError.precondition(
        `Deze modelovereenkomst is ${agreement.status.toLowerCase()}`,
      );
    }

    const now = new Date();
    const freelancerSignedAt =
      party === "FREELANCER"
        ? (agreement.freelancerSignedAt ?? now)
        : agreement.freelancerSignedAt;
    const clientSignedAt =
      party === "CLIENT"
        ? (agreement.clientSignedAt ?? now)
        : agreement.clientSignedAt;

    const updated = await tx.modelAgreement.update({
      where: { id: agreementId },
      data: {
        freelancerSignedAt,
        clientSignedAt,
        status: nextStatusAfterSignature(freelancerSignedAt, clientSignedAt),
      },
    });

    logger.info("model agreement signed", {
      reference: updated.reference,
      party,
      status: updated.status,
    });
    return { status: updated.status, reference: updated.reference };
  });

  await recordAudit({
    category: "AGREEMENT",
    action: `agreement.signed.${party.toLowerCase()}`,
    actorUserId: actorUserId ?? null,
    actorLabel: actorUserId ? "user" : "system",
    summary: `Modelovereenkomst ${result.reference} ondertekend door ${
      party === "FREELANCER" ? "flexwerker" : "opdrachtgever"
    } - status ${result.status}`,
    targetType: "modelAgreement",
    targetId: agreementId,
    metadata: { party, status: result.status },
  });

  return result;
}
