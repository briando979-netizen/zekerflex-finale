import { notifyPendingReactions, setKvkBewijs } from "@/lib/company/verified";
import { eigendomVanEmail } from "@/lib/company/eigendom";
import { alertOwnerLater } from "@/lib/ops/alert";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { geocodePostcode } from "@/lib/integrations/pdok";
import { registerTenantCompany } from "@/lib/company/registration";
import { kvkLimietVan } from "@/lib/kvk/tegoed";
import { wisKvkWacht, zetKvkWacht } from "@/lib/kvk/tegoed-opslag";
import { setBuitenlandBewijs, getBuitenlandBewijs, type BuitenlandBewijs } from "@/lib/company/buitenland";
import { checkVies } from "@/lib/integrations/vies";
import { landNaam, landSoort, normaliseerLand, controleerBuitenlandInvoer, viesLandCode } from "@/lib/onboarding/buitenland";

// De vestiging is de werklocatie in Nederland (postcode en geofence), ook voor een buitenlands bedrijf.
export const employerOnboardingSchema = z
  .object({
    /** Standaard Nederland: dan telt alleen het KVK-nummer, zoals altijd. */
    land: z.string().trim().max(2).default("NL"),
    kvkNumber: z.string().trim().max(20).default(""),
    btwNummer: z.string().trim().max(24).default(""),
    registratieNummer: z.string().trim().max(40).default(""),
    branchName: z.string().trim().min(2).max(120),
    addressLine: z.string().trim().min(3).max(160),
    postalCode: z.string().trim().regex(/^\s*\d{4}\s*[A-Za-z]{2}\s*$/, "Gebruik een geldige postcode"),
    houseNumber: z.string().trim().min(1).max(12),
  })
  .superRefine((v, ctx) => {
    const soort = landSoort(v.land);
    if (soort === null) {
      ctx.addIssue({ code: "custom", path: ["land"], message: "Kies een land uit de lijst." });
    } else if (soort === "NL") {
      if (v.kvkNumber.replace(/[^\d]/g, "").length < 6) ctx.addIssue({ code: "custom", path: ["kvkNumber"], message: "Vul het KVK-nummer van je organisatie in (8 cijfers)." });
    } else {
      const c = controleerBuitenlandInvoer({ land: v.land, btwNummer: v.btwNummer, registratieNummer: v.registratieNummer });
      if (!c.ok) ctx.addIssue({ code: "custom", path: [soort === "EU" ? "btwNummer" : "registratieNummer"], message: c.fout });
    }
  });
export type EmployerOnboardingInput = z.infer<typeof employerOnboardingSchema>;

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
  input: EmployerOnboardingInput,
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

export async function submitEmployerOnboarding(
  userId: string,
  tenantId: string,
  input: EmployerOnboardingInput,
): Promise<EmployerOnboardingResult> {
  const membership = await prisma.membership.findFirst({
    where: { userId, tenantId, role: { in: ["HQ_ADMIN", "PLATFORM_ADMIN"] } },
    select: { id: true },
  });
  if (!membership) throw AppError.forbidden("Je beheert deze organisatie niet.");

  const cleanKvk = input.kvkNumber.replace(/[^\d]/g, "");
  const geo = await geocodePostcode(input.postalCode, input.houseNumber);
  const reasons: string[] = [];

  let kvkValid = false;
  let inControle = false;
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
        detail: `Dit bedrijf zit niet in het KVK. Opgegeven: ${b.detail}. Zoek het bedrijf zelf op, neem zo nodig contact op en keur het goed in Admin → Bedrijven. Tot die tijd kan het één testklus plaatsen.`,
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
    // De KVK-koppeling geeft technische, Engelse fouten ("No Handelsregister entry…"): hier in gewoon Nederlands.
    reasons.push(
      limiet
        ? "We controleren je KVK-nummer later; je kunt verder met je aanmelding."
        : err instanceof AppError && err.status === 404
        ? "Dit KVK-nummer staat niet in het Handelsregister."
        : err instanceof AppError && err.status === 422 && /cijfers/.test(err.message)
          ? err.message
          : err instanceof AppError && err.status >= 500
            ? "Het Handelsregister is nu niet bereikbaar. Probeer het over een paar minuten opnieuw."
            : (err as { code?: string }).code === "P2002"
              ? "Dit KVK-nummer hoort al bij een ander ZekerFlex-account. Is dit jouw bedrijf? Neem contact met ons op, dan zoeken we het uit."
              : "Het KVK-nummer kon niet worden gecontroleerd.",
    );
  }

  // First branch for the organization.
  const existing = await prisma.branch.findFirst({
    where: { tenantId },
    select: { id: true },
  });

  const branch = existing
    ? await prisma.branch.update({
        where: { id: existing.id },
        data: {
          name: input.branchName,
          addressLine: input.addressLine,
          postalCode: geo.postalCode,
          city: geo.city ?? "Onbekend",
          latitude: geo.latitude,
          longitude: geo.longitude,
        },
        select: { id: true },
      })
    : await prisma.branch.create({
        data: {
          tenantId,
          name: input.branchName,
          addressLine: input.addressLine,
          postalCode: geo.postalCode,
          city: geo.city ?? "Onbekend",
          latitude: geo.latitude,
          longitude: geo.longitude,
          geofenceRadiusMeters: 150,
          matchingConfig: DEFAULT_MATCHING_CONFIG,
        },
        select: { id: true },
      });

  // De naam uit het Handelsregister (KVK) komt op de organisatie; een naam uit VIES blijft ernaast staan.
  if (companyName && !buitenlands) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: companyName },
    }).catch(() => undefined);
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
