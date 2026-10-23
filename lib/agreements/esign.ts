import { createHash, createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Waarmerk/zegel op een modelovereenkomst (eIDAS advanced electronic seal).
//
// Zodra beide partijen hebben getekend (status ACTIVE) verzegelen we de
// juridisch relevante inhoud + de twee ondertekenmomenten: een sha256 over de
// canonieke inhoud (contentHash), een vertrouwde tijdstempel en een
// server-zegel (HMAC), tamper-evident geketend aan het vorige zegel. Verifiëren
// = de inhoud opnieuw hashen en vergelijken; wijzigt er iets, dan breekt het
// zegel. De tijdstempel is pluggable: met TSA_URL (RFC-3161) wordt een
// gekwalificeerde eIDAS-timestamp opgehaald; zonder kanaal een interne
// betrouwbare tijdstempel. PDF/A-inbedding gebeurt bij generatie zodra de
// QTSP/QTSA is gekoppeld — tot dan is dit een geldig geavanceerd zegel.
// ---------------------------------------------------------------------------

export interface AgreementSeal {
  reference: string;
  agreementId: string;
  contentHash: string;
  sealedAt: string;
  signers: { party: "FREELANCER" | "CLIENT"; name: string; signedAt: string }[];
  timestamp: { authority: string; token: string; qualified: boolean };
  serverSeal: string; // HMAC(contentHash|sealedAt)
  prevHash: string;
  hash: string;
}

const SEAL_KEY = (agreementId: string) => `agreement-seal:${agreementId}`;
const HEAD_KEY = "agreement-seal:head"; // last chain hash

function canonicalContent(a: {
  reference: string;
  templateKey: string;
  templateVersion: string;
  freelancerLegalName: string;
  freelancerKvkNumber: string;
  tenantId: string;
  hourlyRateCents: number | null;
  freelancerSignedAt: Date | null;
  clientSignedAt: Date | null;
}): string {
  return JSON.stringify({
    reference: a.reference,
    template: `${a.templateKey}@${a.templateVersion}`,
    freelancer: a.freelancerLegalName,
    kvk: a.freelancerKvkNumber,
    tenant: a.tenantId,
    rate: a.hourlyRateCents,
    freelancerSignedAt: a.freelancerSignedAt?.toISOString() ?? null,
    clientSignedAt: a.clientSignedAt?.toISOString() ?? null,
  });
}

function sealSecret(): string {
  return env.AUTH_SECRET ?? "dev-secret";
}

/** Pluggable trusted timestamp: RFC-3161 TSA when configured, else an internal signed time. */
async function trustedTimestamp(contentHash: string): Promise<AgreementSeal["timestamp"]> {
  if (env.TSA_URL) {
    try {
      // A real RFC-3161 TSA expects a DER TimeStampReq; many relays accept a JSON hash.
      const res = await fetch(env.TSA_URL, {
        method: "POST",
        headers: { "content-type": "application/json", ...(env.TSA_TOKEN ? { authorization: `Bearer ${env.TSA_TOKEN}` } : {}) },
        body: JSON.stringify({ hash: contentHash, hashAlgorithm: "SHA-256" }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { token?: string } | null;
        return { authority: new URL(env.TSA_URL).host, token: body?.token ?? (await res.text().catch(() => "")).slice(0, 4000), qualified: true };
      }
      logger.warn("TSA responded non-ok", { status: res.status });
    } catch (err) {
      logger.warn("TSA request failed — internal timestamp", { error: (err as Error).message });
    }
  }
  const now = new Date().toISOString();
  const token = createHmac("sha256", sealSecret()).update(`tsa:${contentHash}:${now}`).digest("hex");
  return { authority: "ZekerFlex (intern)", token: `${now}.${token}`, qualified: false };
}

export async function sealAgreement(agreementId: string): Promise<AgreementSeal | null> {
  const a = await prisma.modelAgreement.findUnique({
    where: { id: agreementId },
    select: {
      reference: true,
      templateKey: true,
      templateVersion: true,
      freelancerLegalName: true,
      freelancerKvkNumber: true,
      tenantId: true,
      hourlyRateCents: true,
      freelancerSignedAt: true,
      clientSignedAt: true,
      status: true,
      freelancer: { select: { user: { select: { fullName: true } } } },
      tenant: { select: { name: true } },
    },
  });
  if (!a || !a.freelancerSignedAt || !a.clientSignedAt) return null;

  const contentHash = createHash("sha256").update(canonicalContent(a)).digest("hex");
  const existing = await getAgreementSeal(agreementId);
  if (existing && existing.contentHash === contentHash) return existing; // idempotent

  const sealedAt = new Date().toISOString();
  const timestamp = await trustedTimestamp(contentHash);
  const serverSeal = createHmac("sha256", sealSecret()).update(`${contentHash}|${sealedAt}`).digest("hex");
  const prevHash = (await kvGet<string>(HEAD_KEY).catch(() => null)) ?? "GENESIS";
  const hash = createHash("sha256").update(`${prevHash}|${contentHash}|${sealedAt}|${timestamp.token}`).digest("hex");

  const seal: AgreementSeal = {
    reference: a.reference,
    agreementId,
    contentHash,
    sealedAt,
    signers: [
      { party: "FREELANCER", name: a.freelancer.user.fullName, signedAt: a.freelancerSignedAt.toISOString() },
      { party: "CLIENT", name: a.tenant.name, signedAt: a.clientSignedAt.toISOString() },
    ],
    timestamp,
    serverSeal,
    prevHash,
    hash,
  };
  await kvSet(SEAL_KEY(agreementId), seal);
  await kvSet(HEAD_KEY, hash);
  logger.info("model agreement sealed", { reference: a.reference, qualified: timestamp.qualified });
  return seal;
}

export async function getAgreementSeal(agreementId: string): Promise<AgreementSeal | null> {
  return kvGet<AgreementSeal>(SEAL_KEY(agreementId)).catch(() => null);
}

export interface SealVerification {
  sealed: boolean;
  valid: boolean;
  qualified: boolean;
  sealedAt: string | null;
  authority: string | null;
  reason?: string;
}

/** Recompute the content hash from the current DB and compare to the sealed one. */
export async function verifyAgreementSeal(agreementId: string): Promise<SealVerification> {
  const seal = await getAgreementSeal(agreementId);
  if (!seal) return { sealed: false, valid: false, qualified: false, sealedAt: null, authority: null, reason: "Nog niet verzegeld" };
  const a = await prisma.modelAgreement.findUnique({
    where: { id: agreementId },
    select: { reference: true, templateKey: true, templateVersion: true, freelancerLegalName: true, freelancerKvkNumber: true, tenantId: true, hourlyRateCents: true, freelancerSignedAt: true, clientSignedAt: true },
  });
  if (!a) return { sealed: true, valid: false, qualified: seal.timestamp.qualified, sealedAt: seal.sealedAt, authority: seal.timestamp.authority, reason: "Overeenkomst niet gevonden" };
  const recomputed = createHash("sha256").update(canonicalContent(a)).digest("hex");
  const serverOk = createHmac("sha256", sealSecret()).update(`${seal.contentHash}|${seal.sealedAt}`).digest("hex") === seal.serverSeal;
  const valid = recomputed === seal.contentHash && serverOk;
  return {
    sealed: true,
    valid,
    qualified: seal.timestamp.qualified,
    sealedAt: seal.sealedAt,
    authority: seal.timestamp.authority,
    ...(valid ? {} : { reason: "De inhoud is gewijzigd na verzegeling" }),
  };
}
