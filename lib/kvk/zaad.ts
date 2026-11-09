import { prisma } from "@/lib/prisma";
import { kvDeleteStale, kvGet, kvSet } from "@/lib/storage/kv";
import { logger } from "@/lib/logger";
import { onthoudBedrijven } from "@/lib/kvk/index-opslag";
import { schoonKvk, schonePostcode } from "@/lib/kvk/normaliseer";
import type { KvkBedrijf } from "@/lib/kvk/types";

// ---------------------------------------------------------------------------
// De index vullen met wat ZekerFlex al in de database heeft, zodat hij niet
// leeg begint: eerder opgehaalde KVK-profielen (CompanyRegistration), de
// organisaties (Tenant) en de verkoopleads met een KVK-nummer. Eenmalig, en
// daarna hooguit eens per week (nieuwe gegevens erbij, oude records opruimen).
//
// Bewust niet meegenomen: werkersprofielen (een eenmanszaak draagt vaak een
// persoonsnaam) en alles wat een contactpersoon of e-mailadres bevat.
// ---------------------------------------------------------------------------

const MARKER = "kvk-index:zaad";
const OPNIEUW_NA_MS = 7 * 86_400_000;
const BEWAAR_MS = 540 * 86_400_000;
const PER_BRON = 4000;
const BLOK = 300;

interface Marker {
  at: string;
}

async function verzamel(nu: Date): Promise<KvkBedrijf[]> {
  const tijd = nu.toISOString();
  const uit: KvkBedrijf[] = [];
  const leeg = { handelsnaam: null, rechtsvorm: null, straat: null, huisnummer: null, postcode: null, plaats: null, btw: null, actief: null } as const;

  const leads = await prisma.salesLead.findMany({
    where: { kvkNumber: { not: null } },
    select: { kvkNumber: true, companyName: true, city: true },
    orderBy: { updatedAt: "desc" },
    take: PER_BRON,
  });
  for (const l of leads) {
    const kvk = schoonKvk(l.kvkNumber ?? "");
    if (kvk && l.companyName.trim()) uit.push({ ...leeg, kvk, naam: l.companyName.trim().slice(0, 160), plaats: l.city?.trim() || null, bron: "bestaand", bijgewerkt: tijd });
  }

  const tenants = await prisma.tenant.findMany({
    where: { kvkNumber: { not: null } },
    select: { kvkNumber: true, name: true },
    orderBy: { updatedAt: "desc" },
    take: PER_BRON,
  });
  for (const t of tenants) {
    const kvk = schoonKvk(t.kvkNumber ?? "");
    if (kvk && t.name.trim()) uit.push({ ...leeg, kvk, naam: t.name.trim().slice(0, 160), bron: "bestaand", bijgewerkt: tijd });
  }

  // de volledige profielen als laatste: die winnen van de korte gegevens hierboven
  const registraties = await prisma.companyRegistration.findMany({
    select: {
      kvkNumber: true,
      legalName: true,
      tradeName: true,
      legalForm: true,
      isActive: true,
      insolvent: true,
      status: true,
      street: true,
      houseNumber: true,
      postalCode: true,
      city: true,
      vatNumber: true,
    },
    orderBy: { fetchedAt: "desc" },
    take: PER_BRON,
  });
  for (const r of registraties) {
    const kvk = schoonKvk(r.kvkNumber);
    if (!kvk || !r.legalName.trim()) continue;
    uit.push({
      kvk,
      naam: r.legalName.trim().slice(0, 160),
      handelsnaam: r.tradeName,
      rechtsvorm: r.legalForm,
      straat: r.street,
      huisnummer: r.houseNumber,
      postcode: schonePostcode(r.postalCode),
      plaats: r.city,
      btw: r.vatNumber && /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(r.vatNumber) ? r.vatNumber : null,
      actief: r.insolvent ? false : r.status === "ACTIVE" ? true : r.status === "DISSOLVED" ? false : null,
      bron: "kvkbase",
      bijgewerkt: tijd,
    });
  }
  return uit;
}

/** Zaai de index als dat nog niet (of langer dan een week geleden) gebeurde. Gooit nooit. */
export async function zaaiAlsNodig(nu: Date = new Date()): Promise<void> {
  try {
    const eerder = await kvGet<Marker>(MARKER);
    if (eerder && nu.getTime() - Date.parse(eerder.at) < OPNIEUW_NA_MS) return;
    // de markering eerst: zo beginnen twee zoekvragen tegelijk niet allebei aan het zaaien
    await kvSet(MARKER, { at: nu.toISOString() } satisfies Marker);

    const alles = await verzamel(nu);
    let nieuw = 0;
    for (let i = 0; i < alles.length; i += BLOK) nieuw += await onthoudBedrijven(alles.slice(i, i + BLOK));
    const opgeruimd = await kvDeleteStale("kvk-bedrijf:", new Date(nu.getTime() - BEWAAR_MS));
    logger.info("kvk-index gezaaid", { gelezen: alles.length, geschreven: nieuw, opgeruimd });
  } catch (err) {
    logger.warn("kvk-index zaaien mislukt", { fout: (err as Error).message.slice(0, 160) });
  }
}
