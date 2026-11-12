import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { deleteUpload } from "@/lib/storage/local";
import { kvGet } from "@/lib/storage/kv";
import { erasableKvWhere } from "@/lib/privacy/user-kv";
import { wisBankrekeningVan } from "@/lib/privacy/bank-wissen";
import { overdrachtUploads } from "@/lib/kyc/overdracht";
import { testwerkerAdres } from "@/lib/testwerker/adres";

// ---------------------------------------------------------------------------
// Elk uur het testwerkeraccount van de eigenaar terug naar "net aangemeld" (lib/testwerker/adres.ts; cron
// "5 * * * *" → /api/internal/testwerker/reset). Weg: het werkersprofiel met reacties, toewijzingen en
// urenbriefjes, de ID-controles met hun foto's, documenten, werkrecht, certificaten, passkeys, de persoonlijke
// KV-gegevens (ERASABLE_KV_PREFIXES, 2FA zit daarin), het uitzendcontract en de fiscale gegevens. Blijft: het
// account zelf (naam, e-mail, wachtwoord, bevestigd adres), de FREELANCER-rol en de soort werker die hij bij
// het aanmelden koos, zodat hij meteen weer kan inloggen en opnieuw beginnen.
//
// Veiligheid: alleen het ene adres uit TESTWERKER_EMAIL, precies; nooit een account met een beheer- of
// bedrijfsrol; facturen, loonstroken, voorschotten en bestellingen (boekhouding) worden nooit gewist: staat er
// zoiets, dan blijven het profiel en de urenbriefjes staan en zegt de uitslag dat. Uitslag en log: alleen
// aantallen. droog = alleen tellen.
// ---------------------------------------------------------------------------

export type TestwerkerStatus = "uit" | "geen-account" | "geweigerd" | "droog" | "gereset";

export interface TestwerkerUitslag {
  status: TestwerkerStatus;
  /** waarom geweigerd (gewone tekst, zonder adres) */
  reden?: string;
  /** wat weg is (of bij droog: weg zou gaan), per soort */
  aantallen: Record<string, number>;
  /** wat bewust bleef staan omdat het bij de boekhouding hoort */
  bewaard: Record<string, number>;
}

const leeg = (status: TestwerkerStatus, reden?: string): TestwerkerUitslag => ({ status, ...(reden ? { reden } : {}), aantallen: {}, bewaard: {} });

/** De rollen die het terugzetten tegenhouden: alles behalve FREELANCER. */
export function geweigerdeRol(rollen: readonly string[]): boolean {
  return rollen.some((r) => r !== "FREELANCER");
}

export async function resetTestwerker(opts: { droog?: boolean; nu?: Date } = {}): Promise<TestwerkerUitslag> {
  const droog = opts.droog === true;
  const adres = testwerkerAdres();
  if (!adres) return leeg("uit");

  const user = await prisma.user.findFirst({
    where: { email: { equals: adres, mode: "insensitive" } },
    select: { id: true, email: true, kycStatus: true, disabledAt: true, memberships: { select: { role: true } }, freelancerProfile: { select: { id: true } } },
  });
  if (!user || user.email.trim().toLowerCase() !== adres) return leeg("geen-account");
  if (user.disabledAt) return leeg("geweigerd", "Het testaccount is uitgeschakeld.");
  if (geweigerdeRol(user.memberships.map((m) => m.role))) return leeg("geweigerd", "Het testaccount heeft een beheer- of bedrijfsrol; dat zetten we nooit terug.");

  const userId = user.id;
  const profielId = user.freelancerProfile?.id ?? null;

  // --- boekhouding: nooit wissen; staat er iets, dan blijven het profiel en de urenbriefjes staan ---
  const [facturen, loonstroken, voorschotten, bestellingen] = await Promise.all([
    profielId ? prisma.invoice.count({ where: { OR: [{ recipientFreelancerId: profielId }, { timesheet: { freelancerId: profielId } }] } }) : 0,
    prisma.payslipRecord.count({ where: { userId } }),
    prisma.advanceRecord.count({ where: { userId } }),
    prisma.domeinBestelling.count({ where: { userId } }),
  ]);
  const bewaard: Record<string, number> = {};
  if (facturen) bewaard.facturen = facturen;
  if (loonstroken) bewaard.loonstroken = loonstroken;
  if (voorschotten) bewaard.voorschotten = voorschotten;
  if (bestellingen) bewaard.bestellingen = bestellingen;
  const profielWeg = Boolean(profielId) && facturen === 0 && loonstroken === 0 && voorschotten === 0;

  // de soort werker uit het aanmelden blijft (lib/auth/register.ts), de rest van de fiscale gegevens niet
  const fiscaal = await kvGet<Record<string, unknown>>(`fiscal:${userId}`);
  const workerKind = typeof fiscaal?.workerKind === "string" ? fiscaal.workerKind : null;
  const fiscaalTeWissen = Boolean(fiscaal && Object.keys(fiscaal).some((k) => k !== "workerKind"));

  // --- de bestanden: eerst verzamelen, de rijen gaan zo weg ---
  const uploadIds = new Set<string>();
  for (const d of await prisma.complianceDocument.findMany({ where: { userId }, select: { uploadId: true } })) uploadIds.add(d.uploadId);
  for (const c of await prisma.certificate.findMany({ where: { userId, uploadId: { not: null } }, select: { uploadId: true } })) if (c.uploadId) uploadIds.add(c.uploadId);
  for (const w of await prisma.workRight.findMany({ where: { userId, uploadId: { not: null } }, select: { uploadId: true } })) if (w.uploadId) uploadIds.add(w.uploadId);
  for (const iv of await prisma.identityVerification.findMany({ where: { userId }, select: { rawPayload: true } })) {
    const ids = (iv.rawPayload as { uploadIds?: Record<string, unknown> } | null)?.uploadIds ?? {};
    for (const id of Object.values(ids)) if (typeof id === "string") uploadIds.add(id);
  }
  for (const id of await overdrachtUploads(userId)) uploadIds.add(id);

  const kvWaar = { OR: [...erasableKvWhere(userId).OR, { key: { equals: `uitzend-contracts:${userId}` } }] };

  if (droog) {
    const p = profielWeg && profielId ? profielId : null;
    const [reacties, toewijzingen, urenbriefjes, idControles, documenten, werkrecht, certificaten, passkeys, kv] = await Promise.all([
      p ? prisma.shiftMatch.count({ where: { freelancerId: p } }) : 0,
      p ? prisma.shiftAssignment.count({ where: { freelancerId: p } }) : 0,
      p ? prisma.timesheet.count({ where: { freelancerId: p } }) : 0,
      prisma.identityVerification.count({ where: { userId } }),
      prisma.complianceDocument.count({ where: { userId } }),
      prisma.workRight.count({ where: { userId } }),
      prisma.certificate.count({ where: { userId } }),
      prisma.passkey.count({ where: { userId } }),
      prisma.keyValueStore.count({ where: kvWaar }),
    ]);
    const aantallen = zonderNul({
      profiel: p ? 1 : 0,
      reacties,
      toewijzingen,
      urenbriefjes,
      idControles,
      documenten,
      werkrecht,
      certificaten,
      passkeys,
      kv,
      fiscaal: fiscaalTeWissen ? 1 : 0,
      uploads: uploadIds.size,
      kycStatus: user.kycStatus === "NOT_STARTED" ? 0 : 1,
    });
    return { status: "droog", aantallen, bewaard };
  }

  const aantallen: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    if (profielWeg && profielId) {
      aantallen.vervangingen = (await tx.replacementRequest.deleteMany({ where: { OR: [{ originalId: profielId }, { substituteId: profielId }] } })).count;
      // urenbriefjes vóór de toewijzingen (een urenbriefje verwijst naar het profiel zelf); facturen zijn er niet (zie boven)
      aantallen.urenbriefjes = (await tx.timesheet.deleteMany({ where: { freelancerId: profielId } })).count;
      aantallen.toewijzingen = (await tx.shiftAssignment.deleteMany({ where: { freelancerId: profielId } })).count;
      aantallen.reacties = (await tx.shiftMatch.deleteMany({ where: { freelancerId: profielId } })).count;
      // de pushmeldingen van zijn apparaten blijven bij het account; ze hangen straks aan het nieuwe profiel
      await tx.webPushSubscription.updateMany({ where: { freelancerId: profielId }, data: { freelancerId: null } });
      await tx.freelancerProfile.delete({ where: { id: profielId } });
      aantallen.profiel = 1;
    }
    aantallen.idControles = (await tx.identityVerification.deleteMany({ where: { userId } })).count;
    aantallen.documenten = (await tx.complianceDocument.deleteMany({ where: { userId } })).count;
    aantallen.werkrecht = (await tx.workRight.deleteMany({ where: { userId } })).count;
    aantallen.certificaten = (await tx.certificate.deleteMany({ where: { userId } })).count;
    aantallen.passkeys = (await tx.passkey.deleteMany({ where: { userId } })).count;
    aantallen.apparaten = (await tx.deviceFingerprint.deleteMany({ where: { userId } })).count;
    aantallen.uitbetaalvoorkeur = (await tx.payoutPreference.deleteMany({ where: { userId } })).count;
    aantallen.verwijdertokens = (await tx.accountDeletionToken.deleteMany({ where: { userId } })).count;
    // NFC-sleutelhangers voor de incheckterminal: de koppeling staat onder de hash, gevonden via zijn eigen lijst
    const fobs = await tx.keyValueStore.findUnique({ where: { key: `nfc-fob-user:${userId}` }, select: { value: true } });
    const fobHashes = ((fobs?.value as { fobs?: { hash?: string }[] } | null)?.fobs ?? []).map((f) => f.hash).filter((h): h is string => typeof h === "string");
    if (fobHashes.length) await tx.keyValueStore.deleteMany({ where: { key: { in: fobHashes.map((h) => `nfc-fob:${h}`) } } });
    aantallen.kv = (await tx.keyValueStore.deleteMany({ where: kvWaar })).count;
    if (fiscaalTeWissen) {
      if (workerKind) await tx.keyValueStore.update({ where: { key: `fiscal:${userId}` }, data: { value: { workerKind } } });
      else await tx.keyValueStore.deleteMany({ where: { key: `fiscal:${userId}` } });
      aantallen.fiscaal = 1;
    }
    if (user.kycStatus !== "NOT_STARTED") {
      await tx.user.update({ where: { id: userId }, data: { kycStatus: "NOT_STARTED" } });
      aantallen.kycStatus = 1;
    }
  });

  // bestanden en de (uitgeschakelde) bankrekening buiten de transactie, zoals bij het AVG-wissen
  let uploads = 0;
  for (const id of uploadIds) {
    await deleteUpload(id)
      .then(() => {
        uploads += 1;
      })
      .catch((err: unknown) => logger.warn("testwerker: bestand wissen mislukt", { fout: (err as Error).message }));
  }
  aantallen.uploads = uploads;
  await wisBankrekeningVan(userId, opts.nu ?? new Date())
    .then((u) => {
      if (u !== "geen") aantallen.bankrekening = 1;
    })
    .catch((err: unknown) => logger.warn("testwerker: bankrekening wissen mislukt", { fout: (err as Error).message }));

  const schoon = zonderNul(aantallen);
  const totaal = Object.values(schoon).reduce((s, n) => s + n, 0);
  if (totaal > 0) {
    logger.info("testwerker teruggezet", { totaal, ...schoon, ...(Object.keys(bewaard).length ? { bewaard: Object.keys(bewaard).join(",") } : {}) });
    await recordAudit({
      category: "ADMIN",
      action: "testwerker.reset",
      actorLabel: "system",
      summary: `Testwerkeraccount teruggezet naar net aangemeld (${totaal} onderdelen gewist)`,
      targetType: "user",
      targetId: userId,
      metadata: { aantallen: schoon, bewaard },
    }).catch(() => undefined);
  }
  return { status: "gereset", aantallen: schoon, bewaard };
}

function zonderNul(r: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(r).filter(([, n]) => n > 0));
}
