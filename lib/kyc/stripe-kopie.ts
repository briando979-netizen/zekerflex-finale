import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { storeUpload } from "@/lib/storage/local";
import { documentHash } from "@/lib/kyc/document-hash";
import { stripeBestandId } from "@/lib/kyc/stripe-fotos-vorm";
import { haalStripeBestand, stripeFotoClient, stripeFout } from "@/lib/kyc/stripe-fotos";
import { KOPIE_FOTOS, kopieAf, kopieDocument, kopieStand, kopieUitslag, metKopie, type KopieFoto, type StripeKopie } from "@/lib/kyc/stripe-kopie-vorm";

// ---------------------------------------------------------------------------
// De foto's en gegevens van Stripe-controles naar ZekerFlex kopiëren (14 nov 2026, eigenaar; lib/kyc/stripe-kopie-vorm.ts
// zegt welke velden). Met de beperkte sleutel van het OUDE Stripe-account (Beheer → Gebruiker → Identiteitscontroles):
//   per sessie het rapport (de gevoelige velden nummer, geboortedatum en vervaldatum apart opgevraagd, nooit id_number),
//   voor- en achterkant en selfie via een bestandslink van 30 seconden, opgeslagen zoals de foto's van de eigen ID-scan.
// - Idempotent: een foto die er al is, halen we niet opnieuw op; een complete kopie slaan we over.
// - Fail-soft per foto: een geredigeerde sessie of de 48-uursgrens geeft een reden, geen fout.
// - De bewaartermijn verandert niet: we schrijven zonder updatedAt te raken (de opschoning rekent daarmee), en een controle
//   die al is opgeschoond krijgt geen selfie en geen persoonsgegevens meer (lib/privacy/kyc-fotos.ts).
// - Nooit een link, sleutel of inhoud in het log; alleen het soort fout. De audit noemt aantallen en sessie-id's.
// ---------------------------------------------------------------------------

const GEVOELIG = ["document.number", "document.dob", "document.expiration_date"] as const;
const NAAM: Record<KopieFoto, string> = { front: "stripe-voorkant.jpg", back: "stripe-achterkant.jpg", selfie: "stripe-selfie.jpg" };

export interface KopieUitkomst {
  checkId: string;
  sessieId: string | null;
  /** foto's die nu zijn binnengehaald */
  gekopieerd: number;
  /** al eerder gekopieerd, niets gedaan */
  overgeslagen: boolean;
  /** waarom (een deel) niet lukte; leeg = alles in orde */
  redenen: string[];
}

const isOpgeschoond = (raw: unknown) => Boolean(raw && typeof raw === "object" && (raw as { opgeschoond?: unknown }).opgeschoond === true);
const extensie = (mime: string) => (mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg");

/** Eén Stripe-controle kopiëren. Gooit niet: een probleem komt terug als reden. */
export async function kopieerStripeControle(checkId: string, stripe: Stripe): Promise<KopieUitkomst> {
  const row = await prisma.identityVerification.findUnique({
    where: { id: checkId },
    select: { id: true, userId: true, provider: true, sessionId: true, rawPayload: true },
  });
  if (!row || row.provider !== "STRIPE_IDENTITY" || !row.sessionId) {
    return { checkId, sessieId: row?.sessionId ?? null, gekopieerd: 0, overgeslagen: false, redenen: ["Geen Stripe-controle met een sessie."] };
  }
  if (kopieAf(row.rawPayload)) return { checkId, sessieId: row.sessionId, gekopieerd: 0, overgeslagen: true, redenen: [] };

  const opgeschoond = isOpgeschoond(row.rawPayload);
  const { uploadIds: al } = kopieStand(row.rawPayload);
  const redenen: string[] = [];
  let sessie: Stripe.Identity.VerificationSession;
  try {
    sessie = await stripe.identity.verificationSessions.retrieve(row.sessionId, { expand: ["last_verification_report"] });
  } catch (err) {
    logger.warn("stripe-kopie: sessie niet op te halen", { type: (err as { type?: string } | null)?.type ?? "onbekend" });
    return { checkId, sessieId: row.sessionId, gekopieerd: 0, overgeslagen: false, redenen: [stripeFout(err)] };
  }
  const rapport = sessie.last_verification_report;
  const rapportId = typeof rapport === "string" ? rapport : rapport?.id ?? null;

  // de gevoelige velden apart, met precies deze drie expands (nooit id_number); zonder het recht "All Detailed
  // Verification Results" valt dat weg en houden we de rest
  let volledig: unknown = rapport;
  if (rapportId && !opgeschoond) {
    try {
      volledig = await stripe.identity.verificationReports.retrieve(rapportId, { expand: [...GEVOELIG] });
    } catch (err) {
      logger.warn("stripe-kopie: details niet op te halen", { type: (err as { type?: string } | null)?.type ?? "onbekend" });
      redenen.push("Nummer, geboortedatum en vervaldatum gaf Stripe niet vrij (recht 'All Detailed Verification Results' ontbreekt?).");
    }
  }

  const nieuw: Partial<Record<KopieFoto, string>> = {};
  const ontbreekt: Partial<Record<KopieFoto, string>> = {};
  for (const welk of KOPIE_FOTOS) {
    if (al[welk]) continue;
    if (welk === "selfie" && opgeschoond) {
      ontbreekt.selfie = "Na 30 dagen bewaren we geen selfie meer (biometrie).";
      continue;
    }
    const bestandId = stripeBestandId(rapport, welk);
    if (!bestandId) {
      ontbreekt[welk] = welk === "back" ? "Geen achterkant (een paspoort heeft er geen), of Stripe gaf hem niet vrij." : "Stripe gaf deze foto niet vrij (geredigeerd, of de sleutel leest alleen de laatste 48 uur).";
      continue;
    }
    try {
      const foto = await haalStripeBestand(stripe, bestandId);
      if (!foto.ok) {
        ontbreekt[welk] = foto.reden;
        continue;
      }
      const opgeslagen = await storeUpload({ filename: NAAM[welk].replace(/jpg$/, extensie(foto.mimeType)), mimeType: foto.mimeType, bytes: Buffer.from(foto.bytes), uploadedById: row.userId });
      nieuw[welk] = opgeslagen.id;
    } catch (err) {
      logger.warn("stripe-kopie: foto niet op te halen", { type: (err as { type?: string } | null)?.type ?? "onbekend", welk });
      ontbreekt[welk] = stripeFout(err);
    }
  }

  const { document, nummer } = opgeschoond ? { document: null, nummer: null } : kopieDocument(volledig);
  const kopie: StripeKopie = {
    at: new Date().toISOString(),
    sessieId: row.sessionId,
    document,
    uitslag: kopieUitslag(sessie, rapport),
    ontbreekt,
  };
  const payload = metKopie(row.rawPayload, nieuw, kopie);
  const hash = nummer ? documentHash(nummer) : null;
  // zonder updatedAt te raken: de bewaartermijn (lib/privacy/sweep.ts) blijft die van de oorspronkelijke controle
  await prisma.$executeRaw`UPDATE "IdentityVerification"
    SET "rawPayload" = ${JSON.stringify(payload)}::jsonb,
        "documentNumberHash" = COALESCE("documentNumberHash", ${hash}),
        "documentType" = COALESCE("documentType", ${document?.soort ?? null})
    WHERE "id" = ${row.id}`;
  for (const [welk, r] of Object.entries(ontbreekt)) redenen.push(`${welk === "front" ? "Voorkant" : welk === "back" ? "Achterkant" : "Selfie"}: ${r}`);
  return { checkId, sessieId: row.sessionId, gekopieerd: Object.keys(nieuw).length, overgeslagen: false, redenen };
}

/** Alle Stripe-controles van één gebruiker, of van iedereen (userId null). Met één regel in de audit. */
export async function kopieerUitStripe(
  wie: { userId: string | null },
  door: { userId: string; email: string },
): Promise<{ ok: true; uitkomsten: KopieUitkomst[] } | { ok: false; reden: string }> {
  const stripe = await stripeFotoClient();
  if (!stripe) return { ok: false, reden: "Er staat nog geen Stripe-sleutel. Plak eerst de beperkte sleutel van het oude Stripe-account bij Identiteitscontroles." };
  const rijen = await prisma.identityVerification.findMany({
    where: { provider: "STRIPE_IDENTITY", sessionId: { not: null }, ...(wie.userId ? { userId: wie.userId } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: 500,
  });
  const uitkomsten: KopieUitkomst[] = [];
  for (const r of rijen) uitkomsten.push(await kopieerStripeControle(r.id, stripe));
  const fotos = uitkomsten.reduce((n, u) => n + u.gekopieerd, 0);
  await recordAudit({
    category: "KYC",
    action: "kyc.stripe_gekopieerd",
    actorUserId: door.userId,
    actorLabel: "user",
    summary: `${door.email} kopieerde ${wie.userId ? "de" : "alle"} Stripe-controles (${uitkomsten.length}, ${fotos} foto's)`,
    targetType: wie.userId ? "user" : "kyc",
    targetId: wie.userId ?? "stripe-identity",
    metadata: {
      controles: uitkomsten.length,
      fotos,
      overgeslagen: uitkomsten.filter((u) => u.overgeslagen).length,
      metReden: uitkomsten.filter((u) => u.redenen.length > 0).length,
      sessies: uitkomsten.map((u) => u.sessieId).filter(Boolean),
    },
  });
  return { ok: true, uitkomsten };
}

/** Voor de eigenaar-taak: hoeveel Stripe-controles er zijn, en hoeveel daarvan helemaal gekopieerd. */
export async function stripeKopieStand(): Promise<{ totaal: number; af: number } | null> {
  try {
    const rijen = await prisma.identityVerification.findMany({
      where: { provider: "STRIPE_IDENTITY", sessionId: { not: null } },
      select: { rawPayload: true },
      take: 1000,
    });
    return { totaal: rijen.length, af: rijen.filter((r) => kopieAf(r.rawPayload)).length };
  } catch {
    return null;
  }
}
