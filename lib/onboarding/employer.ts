import { notifyPendingReactions, setKvkBewijs } from "@/lib/company/verified";
import { eigendomVanEmail } from "@/lib/company/eigendom";
import { alertOwnerLater } from "@/lib/ops/alert";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { geocodePostcode, type GeocodeResult } from "@/lib/integrations/pdok";
import { werkInBelgieAan, zoekBelgischAdres } from "@/lib/geo/vestiging-belgie";
import { isBelgischePostcode } from "@/lib/geo/vestiging-land";
import { registerTenantCompany } from "@/lib/company/registration";
import { kvkLimietVan } from "@/lib/kvk/tegoed";
import { wisKvkWacht, zetKvkWacht } from "@/lib/kvk/tegoed-opslag";
import { setBuitenlandBewijs, getBuitenlandBewijs, type BuitenlandBewijs } from "@/lib/company/buitenland";
import { checkVies } from "@/lib/integrations/vies";
import { landNaam, landSoort, normaliseerLand, controleerBuitenlandInvoer, viesLandCode } from "@/lib/onboarding/buitenland";

const bedrijfVelden = {
  /** Standaard Nederland: dan telt alleen het KVK-nummer, zoals altijd. */
  land: z.string().trim().max(2).default("NL"),
  kvkNumber: z.string().trim().max(20).default(""),
  btwNummer: z.string().trim().max(24).default(""),
  registratieNummer: z.string().trim().max(40).default(""),
};

function controleerBedrijf(v: { land: string; kvkNumber: string; btwNummer: string; registratieNummer: string }, ctx: z.RefinementCtx): void {
  const soort = landSoort(v.land);
  if (soort === null) {
    ctx.addIssue({ code: "custom", path: ["land"], message: "Kies een land uit de lijst." });
  } else if (soort === "NL") {
    if (v.kvkNumber.replace(/[^\d]/g, "").length < 6) ctx.addIssue({ code: "custom", path: ["kvkNumber"], message: "Vul het KVK-nummer van je organisatie in (8 cijfers)." });
  } else {
    const c = controleerBuitenlandInvoer({ land: v.land, btwNummer: v.btwNummer, registratieNummer: v.registratieNummer });
    if (!c.ok) ctx.addIssue({ code: "custom", path: [soort === "EU" ? "btwNummer" : "registratieNummer"], message: c.fout });
  }
}

const POSTCODE_MELDING = "Gebruik een geldige postcode";

// De vestiging is de werklocatie in Nederland (postcode en geofence), ook voor een buitenlands bedrijf. 28 nov 2026: met
// vestigingLand "BE" een werklocatie in België (vier cijfers), maar alleen als de vlag `werk-in-belgie` aan staat; dat
// controleert submitEmployerOnboarding. Zonder vestigingLand blijft het Nederland met precies de oude postcoderegel.
// Let op: `land` is het land van het bedrijf (KVK of btw), vestigingLand dat van de werkplek; die lopen niet door elkaar.
export const employerOnboardingSchema = z
  .object({
    ...bedrijfVelden,
    branchName: z.string().trim().min(2).max(120),
    addressLine: z.string().trim().min(3).max(160),
    postalCode: z.string().trim().regex(/^\s*(\d{4}\s*[A-Za-z]{2}|[1-9]\d{3})\s*$/, POSTCODE_MELDING),
    houseNumber: z.string().trim().min(1).max(12),
    vestigingLand: z.enum(["NL", "BE"]).default("NL"),
  })
  .superRefine((v, ctx) => {
    const ok = v.vestigingLand === "BE" ? isBelgischePostcode(v.postalCode) : /^\s*\d{4}\s*[A-Za-z]{2}\s*$/.test(v.postalCode);
    if (!ok) ctx.addIssue({ code: "custom", path: ["postalCode"], message: POSTCODE_MELDING });
  })
  .superRefine(controleerBedrijf);
export type EmployerOnboardingInput = z.infer<typeof employerOnboardingSchema>;

/**
 * Alleen het bedrijf (KVK, btw- of registratienummer): de vestiging staat er al, toegevoegd op Locaties of op Klus
 * uitzetten. 22 nov 2026 (gebruikersonderzoek B27): het startscherm vroeg naam, adres en postcode van de "eerste
 * vestiging" opnieuw. De verificatie zelf verandert niet.
 */
export const employerKvkSchema = z.object(bedrijfVelden).superRefine(controleerBedrijf);
export type EmployerKvkInput = z.infer<typeof employerKvkSchema>;

const heeftVestigingVelden = (input: EmployerOnboardingInput | EmployerKvkInput): input is EmployerOnboardingInput =>
  "branchName" in input && typeof input.branchName === "string";

const DEFAULT_MATCHING_CONFIG = {
  minScore: 0.55,
  maxTravelMinutes: 60,
  weights: { reliability: 0.4, travel: 0.35, skill: 0.25 },
  travelModes: ["TRANSIT", "BICYCLING", "DRIVING"],
  offerTtlMinutes: 15,
  notificationWaveSize: 5,
  autoAcceptance: {
    enabled: false,
    minScore: 0.82,
    minAcceptanceScore: 0.8,
    minReliabilityScore: 0.9,
    requireWithinGeofence: false,
    maxSeatsToAutoFill: 1,
  },
} satisfies Prisma.InputJsonValue;

export interface EmployerOnboardingResult {
  kvkValid: boolean;
  /** KVK klopt, maar niet aantoonbaar dat de aanmelder erbij hoort: ZekerFlex controleert met de hand */
  inControle: boolean;
  companyName: string | null;
  branchId: string;
  reasons: string[];
  /** Een bedrijf buiten Nederland: geen KVK, een beheerder keurt het goed. */
  buitenlands: boolean;
}

/**
 * Een buitenlands bedrijf: EU met btw-nummer (gecontroleerd in VIES), daarbuiten met een
 * registratienummer als vrije tekst. Land en btw-nummer komen op Tenant; wat daar niet past in KV.
 */
async function meldBuitenlandsBedrijf(
  tenantId: string,
  input: EmployerKvkInput,
): Promise<{ valid: boolean; companyName: string | null; reasons: string[]; detail: string }> {
  const land = normaliseerLand(input.land);
  const invoer = controleerBuitenlandInvoer({ land, btwNummer: input.btwNummer, registratieNummer: input.registratieNummer });
  if (!invoer.ok) return { valid: false, companyName: null, reasons: [invoer.fout], detail: "" };

  let bewijs: BuitenlandBewijs = { land, btw: null, registratieNummer: null, at: new Date().toISOString() };
  let vatNumber: string | null = null;
  let companyName: string | null = null;
  let detail: string;

  if (invoer.soort === "EU") {
    const vies = await checkVies(input.btwNummer);
    if (vies.status === "malformed") {
      return { valid: false, companyName: null, reasons: ["Dit btw-nummer is niet in de juiste vorm. Begin met de landcode, bijvoorbeeld DE123456789."], detail: "" };
    }
    if (vies.countryCode !== viesLandCode(land)) {
      return { valid: false, companyName: null, reasons: [`Dit btw-nummer hoort niet bij ${landNaam(land)}. Kies het land waar het btw-nummer van is.`], detail: "" };
    }
    if (vies.status === "invalid") {
      return { valid: false, companyName: null, reasons: ["Dit btw-nummer staat niet als geldig in het Europese btw-register (VIES). Controleer het nummer en probeer het opnieuw."], detail: "" };
    }
    vatNumber = vies.vatNumber;
    companyName = vies.name;
    // VIES kan even uit de lucht zijn: dat is geen "ongeldig". De beheerder controleert het dan met de hand.
    bewijs = { ...bewijs, btw: vies.status === "valid" ? "geldig" : "niet-bereikbaar" };
    detail = `btw-nummer ${vies.vatNumber} (${vies.status === "valid" ? "geldig in VIES" : "VIES was niet bereikbaar, nog te controleren"})`;
  } else {
    bewijs = { ...bewijs, registratieNummer: input.registratieNummer.trim() };
    detail = `registratienummer ${input.registratieNummer.trim()} (door het bedrijf zelf opgegeven, nog te controleren)`;
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { country: land, ...(vatNumber ? { vatNumber } : {}) },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { valid: false, companyName: null, reasons: ["Dit btw-nummer hoort al bij een ander ZekerFlex-account. Is dit jouw bedrijf? Neem contact met ons op, dan zoeken we het uit."], detail: "" };
    }
    throw err;
  }
  await setBuitenlandBewijs(tenantId, bewijs);
  return { valid: true, companyName, reasons: [], detail };
}

/** Wat het koppelen van een bedrijf opleverde (KVK in Nederland, btw- of registratienummer erbuiten). */
export interface BedrijfUitslag {
  kvkValid: boolean;
  /** klopt, maar niet aantoonbaar van deze aanmelder: ZekerFlex controleert met de hand */
  inControle: boolean;
  companyName: string | null;
  reasons: string[];
  buitenlands: boolean;
  /** de controle kon nu niet (tegoed op, onbekende storing): ZekerFlex doet hem zelf, het bedrijf hoeft niets te doen */
  zelfControle: boolean;
}

/**
 * Het bedrijf koppelen aan de organisatie: het KVK-nummer (Nederland) of het btw- of registratienummer (buitenland), en de
 * naam uit het Handelsregister. Gedeeld door de onboarding hieronder en "Nog een paar laatste checks" bij het inplannen
 * (koppelBedrijfsgegevens). De verificatie zelf verandert niet.
 */
async function meldBedrijf(userId: string, tenantId: string, input: EmployerOnboardingInput | EmployerKvkInput): Promise<BedrijfUitslag> {
  const cleanKvk = input.kvkNumber.replace(/[^\d]/g, "");
  const reasons: string[] = [];

  let kvkValid = false;
  let inControle = false;
  let zelfControle = false;
  let companyName: string | null = null;
  const buitenlands = landSoort(input.land) !== "NL";
  if (buitenlands) {
    const b = await meldBuitenlandsBedrijf(tenantId, input);
    kvkValid = b.valid;
    inControle = b.valid; // een buitenlands bedrijf wacht altijd op een beheerder
    companyName = b.companyName;
    reasons.push(...b.reasons);
    if (b.valid) {
      alertOwnerLater({
        key: `bedrijf-controle:${tenantId}`,
        title: `Buitenlands bedrijf wacht op controle: ${b.companyName ?? "nieuwe opdrachtgever"} (${landNaam(input.land)})`,
        detail: `Dit bedrijf zit niet in het KVK. Opgegeven: ${b.detail}. Zoek het bedrijf zelf op, neem zo nodig contact op en keur het goed in Admin → Bedrijven. Tot die tijd kan het klussen plaatsen, maar nog niemand inplannen.`,
        severity: "warning",
        url: `/admin/bedrijven/${tenantId}`,
      });
    }
  } else try {
    const reg = await registerTenantCompany({ tenantId, kvkNumber: cleanKvk, allowInactive: true });
    kvkValid = reg.kvkValid;
    companyName = reg.profile.legalName;
    if (!kvkValid) reasons.push(...reg.validation.reasons);
    // Een geldig KVK-nummer bewijst alleen dat het bedrijf bestaat. Hoort de
    // aanmelder er aantoonbaar bij (eigen maildomein dat bij de naam past)?
    if (kvkValid && (await koppelKvkAanAanmelder(tenantId, userId, reg.profile)).inControle) inControle = true;
    // gecontroleerd: een eerdere wachtende controle is niet meer nodig
    await wisKvkWacht("bedrijf", tenantId);
  } catch (err) {
    // tegoed op of te veel vragen bij de KVK-dienst (13 nov 2026): later opnieuw, via de cron /api/internal/kvk/herkansing
    const limiet = kvkLimietVan(err);
    if (limiet) await zetKvkWacht("bedrijf", tenantId, cleanKvk, limiet);
    const nietGevonden = err instanceof AppError && err.status === 404;
    const cijfers = err instanceof AppError && err.status === 422 && /cijfers/.test(err.message);
    const nietBereikbaar = err instanceof AppError && err.status >= 500;
    const alInGebruik = (err as { code?: string }).code === "P2002";
    zelfControle = !nietGevonden && !cijfers && !nietBereikbaar && !alInGebruik;
    // De KVK-koppeling geeft technische, Engelse fouten ("No Handelsregister entry…"): hier in gewoon Nederlands.
    reasons.push(
      limiet
        ? "We controleren je KVK-nummer zelf; je hoort binnen 1 werkdag van ons. Je kunt gewoon verder met je aanmelding."
        : nietGevonden
        ? "Dit KVK-nummer staat niet in het Handelsregister."
        : cijfers
          ? (err as AppError).message
          : nietBereikbaar
            ? "Het Handelsregister is nu niet bereikbaar. Probeer het over een paar minuten opnieuw."
            : alInGebruik
              ? "Dit KVK-nummer hoort al bij een ander ZekerFlex-account. Is dit jouw bedrijf? Neem contact met ons op, dan zoeken we het uit."
              : "We controleren je KVK-nummer zelf; je hoort binnen 1 werkdag van ons.",
    );
  }

  // De naam uit het Handelsregister (KVK) komt op de organisatie; een naam uit VIES blijft ernaast staan.
  if (companyName && !buitenlands) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: companyName },
    }).catch(() => undefined);
  }
  return { kvkValid, inControle, companyName, reasons: [...new Set(reasons)], buitenlands, zelfControle };
}

/**
 * Alleen het bedrijf koppelen, zonder vestiging: "Nog een paar laatste checks" bij het inplannen (23 nov 2026). Alleen de
 * beheerder van het bedrijf (423, geen 403: CrowdSec). De werkers die al reageerden hoeven hier nog niets te horen: dat doet de
 * aanroeper (lib/company/controle-aanvraag.ts) na het bewaren van de aanvraag.
 */
export async function koppelBedrijfsgegevens(userId: string, tenantId: string, input: EmployerKvkInput): Promise<BedrijfUitslag> {
  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId, role: { in: ["HQ_ADMIN", "PLATFORM_ADMIN"] } },
    select: { id: true },
  });
  if (!membership) throw AppError.alleenBeheerder("Alleen de beheerder van het bedrijf kan de bedrijfsgegevens invullen. Vraag de beheerder om dit te doen.");
  return meldBedrijf(userId, tenantId, input);
}

/**
 * De werkplek als coördinaat. Nederland via PDOK, zoals altijd. België (vestigingLand "BE") alleen met de vlag
 * `werk-in-belgie`, via OpenStreetMap; vindt die niets, dan een eerlijke fout (lib/geo/vestiging-belgie.ts), nooit het midden
 * van Nederland. Staat de vlag uit, dan dezelfde melding als een ongeldige postcode, zoals vóór 28 nov 2026.
 */
async function geocodeVestiging(userId: string, v: EmployerOnboardingInput): Promise<GeocodeResult> {
  if (v.vestigingLand !== "BE") return geocodePostcode(v.postalCode, v.houseNumber);
  if (!(await werkInBelgieAan({ userId }))) throw AppError.validation(POSTCODE_MELDING);
  // het huisnummer staat hier in een eigen veld; zit er al een nummer in de adresregel, dan niet nog eens
  const straat = /\d/.test(v.addressLine) ? v.addressLine : `${v.addressLine} ${v.houseNumber}`;
  const be = await zoekBelgischAdres({ straat, postcode: v.postalCode });
  return { latitude: be.latitude, longitude: be.longitude, postalCode: be.postalCode, city: be.city || null, street: be.straat, approximate: false };
}

export async function submitEmployerOnboarding(
  userId: string,
  tenantId: string,
  input: EmployerOnboardingInput | EmployerKvkInput,
): Promise<EmployerOnboardingResult> {
  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId, role: { in: ["HQ_ADMIN", "PLATFORM_ADMIN"] } },
    select: { id: true },
  });
  if (!membership) throw AppError.forbidden("Je beheert deze organisatie niet.");

  // Alleen het bedrijf (employerKvkSchema): dan moet er al een vaste werklocatie zijn; die blijft zoals hij is.
  const vestiging = heeftVestigingVelden(input) ? input : null;
  const bestaand = vestiging
    ? null
    : await prisma.branch.findFirst({ where: { tenantId, kind: "PERMANENT" }, select: { id: true } });
  if (!vestiging && !bestaand) throw AppError.validation("Vul eerst het adres van je werklocatie in.");

  const geo = vestiging ? await geocodeVestiging(userId, vestiging) : null;
  const { kvkValid, inControle, companyName, reasons, buitenlands } = await meldBedrijf(userId, tenantId, input);

  // First branch for the organization, only when the form asked for it; otherwise the existing one stays as it is.
  let branch: { id: string };
  if (bestaand) {
    branch = bestaand;
  } else if (vestiging && geo) {
    const existing = await prisma.branch.findFirst({
      where: { tenantId },
      select: { id: true },
    });
    const adres = {
      name: vestiging.branchName,
      addressLine: vestiging.addressLine,
      postalCode: geo.postalCode,
      city: geo.city ?? "Onbekend",
      latitude: geo.latitude,
      longitude: geo.longitude,
    };
    branch = existing
      ? await prisma.branch.update({ where: { id: existing.id }, data: adres, select: { id: true } })
      : await prisma.branch.create({
          data: { tenantId, ...adres, geofenceRadiusMeters: 150, matchingConfig: DEFAULT_MATCHING_CONFIG },
          select: { id: true },
        });
  } else {
    throw AppError.validation("Vul eerst het adres van je werklocatie in.");
  }

  await recordAudit({
    category: "COMPANY",
    action: "employer.onboarding",
    actorUserId: userId,
    actorLabel: "user",
    summary: buitenlands
      ? `Werkgever-onboarding: ${companyName ?? "organisatie"} (buitenlands bedrijf, ${landNaam(input.land)}, ${kvkValid ? "controle met de hand" : "open"})`
      : `Werkgever-onboarding: ${companyName ?? "organisatie"} (KVK ${kvkValid ? (inControle ? "geldig, controle met de hand" : "geldig en gekoppeld") : "open"})`,
    targetType: "tenant",
    targetId: tenantId,
    metadata: { kvkValid, inControle, branchId: branch.id, ...(buitenlands ? { land: normaliseerLand(input.land) } : {}) },
  });

  if (kvkValid && !inControle) void notifyPendingReactions(tenantId);

  return { kvkValid, inControle, companyName, branchId: branch.id, reasons: [...new Set(reasons)], buitenlands };
}

/**
 * Heeft de organisatie een vaste werklocatie? Dat is de stap "adres bevestigen" van Jouw start (23 nov 2026): het KVK-nummer
 * hoort daar niet meer bij, dat komt pas als het bedrijf iemand wil inplannen (lib/company/controle-aanvraag.ts).
 */
export async function heeftVestiging(tenantIds: string[]): Promise<boolean> {
  if (tenantIds.length === 0) return false;
  return (await prisma.branch.count({ where: { tenantId: { in: tenantIds }, kind: "PERMANENT" } })) > 0;
}

/**
 * Has this organization completed onboarding (company linked + at least one branch)? Linked means a
 * KVK registration, or for a company outside the Netherlands a btw-nummer / registration number.
 */
export async function isEmployerOnboarded(tenantIds: string[]): Promise<boolean> {
  if (tenantIds.length === 0) return false;
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, country: true, vatNumber: true, companyRegistrationId: true, branches: { take: 1, select: { id: true } } },
  });
  for (const t of tenants) {
    if (t.branches.length === 0) continue;
    if (t.companyRegistrationId) return true;
    if ((t.country ?? "NL") !== "NL" && (t.vatNumber || (await getBuitenlandBewijs(t.id)))) return true;
  }
  return false;
}

/**
 * Een geldig KVK-nummer bewijst alleen dat het bedrijf bestaat. Hoort de aanmelder er aantoonbaar bij (eigen maildomein dat
 * bij de naam past)? Dan het bewijs; anders een controle door de eigenaar. Ook voor de KVK-herkansing (lib/kvk/herkansing.ts).
 */
export async function koppelKvkAanAanmelder(
  tenantId: string,
  userId: string,
  profiel: { legalName: string; tradeName: string | null; kvkNumber: string },
): Promise<{ inControle: boolean }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const bewijs = eigendomVanEmail(user?.email ?? "", [profiel.legalName, profiel.tradeName]);
  if (bewijs.ok) {
    await setKvkBewijs(tenantId, { via: "domein", domein: bewijs.domein, at: new Date().toISOString() });
    return { inControle: false };
  }
  alertOwnerLater({
    key: `bedrijf-controle:${tenantId}`,
    title: `Bedrijf wacht op controle: ${profiel.legalName}`,
    detail: `KVK ${profiel.kvkNumber} is geldig, maar de aanmelder (${bewijs.reden === "gratis-mail" ? "gratis maildienst" : "maildomein past niet bij de naam"}) is niet automatisch aan dit bedrijf te koppelen. Bel of mail het bedrijf en keur het goed in Admin → Bedrijven.`,
    severity: "warning",
    url: `/admin/bedrijven/${tenantId}`,
  });
  return { inControle: true };
}
