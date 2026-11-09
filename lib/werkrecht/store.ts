import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { deleteUpload, readUpload, storeUpload } from "@/lib/storage/local";
import { sniffAndVerifyUploadType } from "@/lib/storage/validate";
import { amsterdamDayKey, amsterdamToUtc } from "@/lib/time/amsterdam";
import { alertOwnerLater } from "@/lib/ops/alert";
import {
  VERKLARING_VERSIE,
  VRIJ_VERKEER,
  geldigTotDag,
  landNaam,
  werkrechtReden,
  werkrechtUitslag,
  type WerkrechtStand,
} from "@/lib/werkrecht/landen";

// ---------------------------------------------------------------------------
// Recht om te werken per land: opslag en de controle vóór een betaalde dienst.
// De regels zelf staan puur in lib/werkrecht/landen.ts.
// ---------------------------------------------------------------------------

const MAX_BYTES = 12 * 1024 * 1024;

export interface WerkrechtLand {
  id: string | null;
  land: string;
  stand: WerkrechtStand;
  via: "id" | "document" | null;
  verklaard: boolean;
  /** een EU/EER/CH-document uit de ID-controle is hier het bewijs: niets te uploaden */
  idBewijs: boolean;
  document: {
    status: "uploaded" | "approved" | "rejected";
    filename: string;
    uploadedAt: string;
    /** yyyy-mm-dd (Nederlandse dag) of null */
    geldigTot: string | null;
    note: string | null;
  } | null;
}

/**
 * Liet de eigen ID-controle een paspoort of ID-kaart uit de EU/EER/CH zien? Alleen een
 * goedgekeurde controle met een geldige MRZ (werkrecht "vrij": nationaliteit én uitgevend
 * land, lib/kyc/werkrecht.ts), nooit een rijbewijs, en het document is nog niet verlopen.
 */
export async function idVrij(userId: string, nu = new Date()): Promise<boolean> {
  const check = await prisma.identityVerification.findFirst({
    where: {
      userId,
      provider: "AI_LOCAL",
      status: "VERIFIED",
      documentType: { not: "DRIVERS_LICENSE" },
      rawPayload: { path: ["werkrecht"], equals: "vrij" },
      OR: [{ expiresAt: null }, { expiresAt: { gt: nu } }],
    },
    select: { id: true },
  });
  return Boolean(check);
}

type Rij = Awaited<ReturnType<typeof rijen>>[number];

function rijen(userId: string) {
  return prisma.workRight.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { upload: { select: { filename: true } } },
  });
}

function naarLand(land: string, rij: Rij | null, vrij: boolean, nu: Date): WerkrechtLand {
  const u = werkrechtUitslag(land, rij, vrij, nu);
  return {
    id: rij?.id ?? null,
    land,
    stand: u.stand,
    via: u.via,
    verklaard: Boolean(rij?.declaredAt && rij.declaration === VERKLARING_VERSIE),
    idBewijs: vrij && VRIJ_VERKEER.has(land),
    document:
      rij?.uploadId && rij.status
        ? {
            status: rij.status === "APPROVED" ? "approved" : rij.status === "REJECTED" ? "rejected" : "uploaded",
            filename: rij.upload?.filename ?? "document",
            uploadedAt: rij.updatedAt.toISOString(),
            // validUntil = het begin van de dag ná de laatste geldige dag
            geldigTot: rij.validUntil ? amsterdamDayKey(new Date(rij.validUntil.getTime() - 1)) : null,
            note: rij.note,
          }
        : null,
  };
}

/** Alle landen van een werker; Nederland staat er altijd bij, als eerste. */
export async function werkrechtOverzicht(userId: string, nu = new Date()): Promise<WerkrechtLand[]> {
  const [lijst, vrij] = await Promise.all([rijen(userId), idVrij(userId, nu)]);
  const nl = lijst.find((r) => r.country === "NL") ?? null;
  return [naarLand("NL", nl, vrij, nu), ...lijst.filter((r) => r.country !== "NL").map((r) => naarLand(r.country, r, vrij, nu))];
}

/** De controle vóór een (betaalde) dienst in een land. */
export async function werkrechtVoorWerk(userId: string, land = "NL", nu = new Date()): Promise<{ ok: boolean; reden: string | null }> {
  const [rij, vrij] = await Promise.all([
    prisma.workRight.findUnique({ where: { userId_country: { userId, country: land } }, include: { upload: { select: { filename: true } } } }),
    idVrij(userId, nu),
  ]);
  const { stand } = werkrechtUitslag(land, rij, vrij, nu);
  const reden = werkrechtReden(stand, landNaam(land, "nl"));
  return { ok: reden === null, reden };
}

/** De werker vinkt de verklaring aan voor een land (of opnieuw, bij een nieuwe versie). */
export async function verklaar(userId: string, land: string, nu = new Date()): Promise<void> {
  await prisma.workRight.upsert({
    where: { userId_country: { userId, country: land } },
    create: { userId, country: land, declaredAt: nu, declaration: VERKLARING_VERSIE },
    update: { declaredAt: nu, declaration: VERKLARING_VERSIE },
  });
}

/** Een land weghalen (niet Nederland): verklaring en document gaan weg. */
export async function landWeg(userId: string, land: string): Promise<void> {
  if (land === "NL") throw AppError.validation("Nederland blijft altijd in de lijst.");
  const rij = await prisma.workRight.findUnique({ where: { userId_country: { userId, country: land } }, select: { id: true, uploadId: true } });
  if (!rij) return;
  await prisma.workRight.delete({ where: { id: rij.id } });
  if (rij.uploadId) await deleteUpload(rij.uploadId).catch(() => undefined);
}

/**
 * Bewijs uploaden voor een land. Eerst de verklaring (die hoort erbij), een echte
 * datum "geldig tot" die nog niet voorbij is. Een nieuw document vervangt het oude
 * en gaat opnieuw naar een medewerker.
 */
export async function bewijsOpslaan(
  userId: string,
  land: string,
  input: { filename: string; bytes: Buffer; geldigTot: unknown },
  nu = new Date(),
): Promise<void> {
  const rij = await prisma.workRight.findUnique({
    where: { userId_country: { userId, country: land } },
    select: { id: true, uploadId: true, declaredAt: true, declaration: true },
  });
  if (!rij?.declaredAt || rij.declaration !== VERKLARING_VERSIE) throw AppError.validation("Vink eerst de verklaring aan.");
  const dag = geldigTotDag(input.geldigTot);
  if (!dag) throw AppError.validation("Vul in tot wanneer je document geldig is.");
  const tot = `${dag.jaar}-${String(dag.maand).padStart(2, "0")}-${String(dag.dag).padStart(2, "0")}`;
  if (tot < amsterdamDayKey(nu)) throw AppError.validation("Dit document is al verlopen. Upload een geldig document.");
  if (input.bytes.length === 0) throw AppError.validation("Leeg bestand");
  if (input.bytes.length > MAX_BYTES) throw AppError.validation("Bestand te groot (max 12 MB)");
  // het type uit de bytes zelf, nooit wat de browser zegt
  const mimeType = sniffAndVerifyUploadType(input.bytes, ["pdf", "jpeg", "png", "webp"]);

  const stored = await storeUpload({ filename: input.filename || "document", mimeType, bytes: input.bytes, uploadedById: userId });
  await prisma.workRight.update({
    where: { id: rij.id },
    data: {
      uploadId: stored.id,
      status: "UPLOADED",
      // geldig t/m die dag: tot het begin van de dag erna (Nederlandse tijd)
      validUntil: amsterdamToUtc(dag.jaar, dag.maand, dag.dag + 1),
      note: null,
      reviewedAt: null,
      reviewedBy: null,
    },
  });
  if (rij.uploadId) await deleteUpload(rij.uploadId).catch(() => undefined);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  alertOwnerLater({
    key: `werkrecht:${userId}:${land}`,
    title: `Document voor werken in ${landNaam(land, "nl")} wacht op je: ${user?.fullName ?? "een werker"}`,
    detail: "Bekijk het document en keur goed of af bij de gebruiker (Recht om te werken). Pas daarna kan hij betaalde diensten aannemen.",
    severity: "warning",
    url: `/admin/gebruikers/${userId}`,
  });
}

/** Het geüploade bewijs, voor een medewerker. Op (userId, id) samen: nooit een document van een ander. */
export async function leesBewijs(userId: string, id: string): Promise<{ bytes: Buffer; filename: string; mimeType: string } | null> {
  const rij = await prisma.workRight.findFirst({ where: { id: id.replace(/[^a-z0-9-]/gi, ""), userId }, select: { uploadId: true } });
  if (!rij?.uploadId) return null;
  try {
    return await readUpload(rij.uploadId);
  } catch {
    return null;
  }
}

/** Goedkeuren of afwijzen door een medewerker. Afwijzen met een reden die de werker ziet. */
export async function beoordeel(
  userId: string,
  id: string,
  besluit: "approve" | "reject",
  door: string,
  note: string | null,
  nu = new Date(),
): Promise<{ land: string } | null> {
  const rij = await prisma.workRight.findFirst({ where: { id: id.replace(/[^a-z0-9-]/gi, ""), userId }, select: { id: true, uploadId: true, country: true } });
  if (!rij?.uploadId) return null;
  await prisma.workRight.update({
    where: { id: rij.id },
    data: {
      status: besluit === "approve" ? "APPROVED" : "REJECTED",
      note: besluit === "reject" ? note : null,
      reviewedAt: nu,
      reviewedBy: door,
    },
  });
  return { land: rij.country };
}
