import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { saveFreelancerBase, submitFreelancerOnboarding, type DocKind } from "@/lib/onboarding/verify";
import { ibanBevestigingAntwoord } from "@/lib/fiscal/iban-bevestiging";
import { startStripeIdentity, stripeIdentityAvailable } from "@/lib/kyc/stripe-identity";
import { netwerkVan, overdrachtGegevens, overdrachtMerk, pakOverdracht } from "@/lib/kyc/overdracht";
import { clientIp } from "@/lib/http/request";
import { controleerThuisbasis, thuisbasisVelden } from "@/lib/onboarding/thuisbasis-schema";
import { geocodeThuisbasis } from "@/lib/geo/thuisbasis";

export const runtime = "nodejs";

/** Telefoon en laptop op hetzelfde netwerk? Onbekend (null) als een van beide ontbreekt. */
const zelfdeNetwerk = (telefoon: string | null, laptop: string | null): boolean | null =>
  telefoon && laptop ? telefoon === laptop : null;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const baseSchema = z.object({
  kvkNumber: z.string().trim().max(20).optional(),
  vatNumber: z.string().trim().max(20).optional(),
  ...thuisbasisVelden,
  houseNumber: z.string().trim().max(12).optional(),
  payoutIban: z.string().trim().min(15).max(34),
  /** Bevestigingscode bij een gewijzigd IBAN (mail of 2FA). */
  ibanCode: z.string().trim().max(32).optional(),
}).superRefine(controleerThuisbasis);

const fieldsSchema = z.object({
  // absent for uitzendkrachten — they don't have a KVK (and not when a btw-nummer is used)
  kvkNumber: z.string().trim().max(20).optional(),
  vatNumber: z.string().trim().max(20).optional(),
  ...thuisbasisVelden,
  houseNumber: z.string().trim().max(12).optional(),
  payoutIban: z.string().trim().min(15).max(34),
  ibanCode: z.string().trim().max(32).optional(),
  documentType: z.enum(["PASSPORT", "ID_CARD", "DRIVERS_LICENSE"]),
  documentNumber: z.string().trim().min(4).max(20),
  documentExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ongeldige datum"),
  nameOnDocument: z.string().trim().min(2).max(120),
}).superRefine(controleerThuisbasis);

const MAX_BYTES = 12_000_000;

async function readImage(
  form: FormData,
  field: string,
  label: string,
): Promise<{ filename: string; mimeType: string; bytes: Buffer }> {
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) {
    throw AppError.validation(`Upload ${label}`);
  }
  if (file.size > MAX_BYTES) {
    throw AppError.validation(`${label} is te groot (max 12 MB)`);
  }
  return {
    filename: file.name || field,
    mimeType: file.type || "application/octet-stream",
    bytes: Buffer.from(await file.arrayBuffer()),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/onboarding" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    // niet eindeloos documenten kunnen proberen (review N4)
    await enforceRateLimit({
      name: "onboarding-insturen",
      identifier: principal.userId,
      limit: 8,
      windowSeconds: 3600,
      message: "Je hebt je verificatie vaak ingestuurd. Probeer het over een uur opnieuw, of vraag hulp via support@zekerflex.com.",
    });

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur het formulier als multipart/form-data");
    });
    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() ? v : undefined;
    };

    // Route 0: "bewaar en ga later verder" — alleen het basisdeel (bedrijf, thuisbasis, IBAN) opslaan.
    // Er wordt niets verifieerd of goedgekeurd: reageren op klussen blijft wachten op de identiteit
    // (lib/fiscal/eligibility.ts, kycStatus), dit voorkomt alleen dat iemand alles opnieuw invult.
    const bewaren = form.get("identityMethod") === "bewaren";
    // Route 1: identity via Stripe — save the rest now, then send the user to Stripe.
    if (bewaren || (form.get("identityMethod") === "stripe" && (await stripeIdentityAvailable()))) {
      const base = baseSchema.safeParse({
        kvkNumber: str("kvkNumber"),
        vatNumber: str("vatNumber"),
        postalCode: form.get("postalCode"),
        country: str("country"),
        city: str("city"),
        houseNumber: str("houseNumber"),
        payoutIban: form.get("payoutIban"),
        ibanCode: str("ibanCode"),
      });
      if (!base.success) throw AppError.validation(base.error.issues[0]?.message ?? "Controleer de ingevulde gegevens");
      const saved = await saveFreelancerBase({
        userId: principal.userId,
        kvkNumber: base.data.kvkNumber ?? "",
        vatNumber: base.data.vatNumber,
        postalCode: base.data.postalCode,
        country: base.data.country,
        city: base.data.city,
        houseNumber: base.data.houseNumber,
        payoutIban: base.data.payoutIban,
        ibanCode: base.data.ibanCode,
      });
      if (bewaren) return NextResponse.json({ opgeslagen: true, checks: saved.checks }, { status: 200 });
      const redirectUrl = await startStripeIdentity(principal.userId, principal.email);
      return NextResponse.json({ redirectUrl, checks: saved.checks }, { status: 200 });
    }

    // "Verder op je telefoon" (lib/kyc/overdracht.ts): de documentgegevens en foto's
    // komen van de telefoon. Eerst het formulier controleren, pas daarna de foto's
    // ophalen (en daarmee de tijdelijke kopie wissen): een tikfout kost geen foto's.
    const viaTelefoon = form.get("overdracht") === "1";
    // (review H1) Of er iets via de telefoon binnenkwam, weet de server zelf (merkteken, 30 dagen):
    // wie de vlag weglaat en de foto's van de telefoon los instuurt, gaat net zo goed naar een mens.
    const merk = await overdrachtMerk(principal.userId);
    const telefoon = viaTelefoon ? await overdrachtGegevens(principal.userId) : null;
    if (viaTelefoon && !telefoon) {
      throw AppError.conflict("De foto's van je telefoon zijn niet (meer) beschikbaar. Maak een nieuwe QR-code en scan opnieuw.");
    }
    const parsed = fieldsSchema.safeParse({
      kvkNumber: str("kvkNumber"),
      vatNumber: str("vatNumber"),
      postalCode: form.get("postalCode"),
      country: str("country"),
      city: str("city"),
      houseNumber: str("houseNumber"),
      payoutIban: form.get("payoutIban"),
      ibanCode: str("ibanCode"),
      documentType: telefoon ? telefoon.soort : form.get("documentType"),
      documentNumber: telefoon ? telefoon.gegevens.nummer : form.get("documentNumber"),
      documentExpiry: telefoon ? telefoon.gegevens.datum : form.get("documentExpiry"),
      nameOnDocument: telefoon ? telefoon.gegevens.naam : form.get("nameOnDocument"),
    });
    if (!parsed.success) {
      throw AppError.validation(
        parsed.error.issues[0]?.message ?? "Controleer de ingevulde gegevens",
        parsed.error.flatten(),
      );
    }
    // Een buitenlands adres dat OSM niet kent: nu al stoppen, vóór de foto's van de
    // telefoon worden opgehaald (en gewist). De uitslag blijft een uur bewaard, dus
    // het insturen hieronder vraagt OSM niet nog eens.
    if (parsed.data.country && parsed.data.country !== "NL") {
      await geocodeThuisbasis({ land: parsed.data.country, postcode: parsed.data.postalCode, plaats: parsed.data.city });
    }

    // Three separate captures in one submission — front, back, selfie — so
    // the freelancer never has to come back for a second, duplicate upload
    // (submitFreelancerOnboarding also satisfies the compliance "id" slot
    // from the front image, see lib/onboarding/verify.ts).
    let documentFront: Awaited<ReturnType<typeof readImage>>;
    let documentBack: Awaited<ReturnType<typeof readImage>>;
    let selfie: Awaited<ReturnType<typeof readImage>>;
    let telefoonNet: string | null = null;
    if (viaTelefoon) {
      const opgehaald = await pakOverdracht(principal.userId);
      if (!opgehaald) throw AppError.conflict("De foto's van je telefoon zijn niet (meer) beschikbaar. Maak een nieuwe QR-code en scan opnieuw.");
      ({ voor: documentFront, achter: documentBack, selfie, net: telefoonNet } = opgehaald);
    } else {
      [documentFront, documentBack, selfie] = await Promise.all([
        readImage(form, "documentFront", "de voorkant van je document"),
        readImage(form, "documentBack", "de achterkant van je document"),
        readImage(form, "selfie", "een selfie"),
      ]);
    }

    const result = await submitFreelancerOnboarding({
      userId: principal.userId,
      kvkNumber: parsed.data.kvkNumber ?? "",
      vatNumber: parsed.data.vatNumber,
      postalCode: parsed.data.postalCode,
      country: parsed.data.country,
      city: parsed.data.city,
      houseNumber: parsed.data.houseNumber,
      payoutIban: parsed.data.payoutIban,
      ibanCode: parsed.data.ibanCode,
      documentType: parsed.data.documentType as DocKind,
      documentNumber: parsed.data.documentNumber,
      documentExpiry: parsed.data.documentExpiry,
      nameOnDocument: parsed.data.nameOnDocument,
      files: { front: documentFront, back: documentBack, selfie },
      ...(viaTelefoon || merk.viaTelefoon ? { viaTweedeToestel: true } : {}),
      // voor de beoordelaar (intern): zelfde netwerk als de telefoon, eerdere "niet mijn account"
      ...(viaTelefoon || merk.viaTelefoon || merk.geweigerd > 0
        ? {
            tweedeToestel: {
              zelfdeNetwerk: zelfdeNetwerk(telefoonNet, netwerkVan(clientIp(request))),
              geweigerd: merk.geweigerd,
              zonderVlag: !viaTelefoon && merk.viaTelefoon,
            },
          }
        : {}),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    // Een gewijzigd IBAN zonder (geldige) bevestigingscode: 423 met eigen code, nooit 403.
    const ibanFout = ibanBevestigingAntwoord(err);
    if (ibanFout) return NextResponse.json(ibanFout.body, { status: ibanFout.status });
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("onboarding failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
