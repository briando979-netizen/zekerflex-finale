import type { HorecaZaak, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { slugify } from "@/lib/sites/types";
import { MODULES, zetModule, type ModuleSleutel } from "@/lib/horeca/modules";
import { schoneAllergenen } from "@/lib/horeca/allergenen";
import { STANDAARD_TIJDEN, type Openingstijden } from "@/lib/horeca/tijden";

// ---------------------------------------------------------------------------
// Opslag van het horeca-pakket. Elke functie krijgt de zaak mee en controleert
// zelf dat categorie, gerecht of tafel daarbij hoort, zodat een id van een
// andere zaak nooit werkt (updateMany/deleteMany met zaakId erbij).
// ---------------------------------------------------------------------------

export const zaakVanSlug = (slug: string) => prisma.horecaZaak.findUnique({ where: { slug } });
export const zaakVanTenant = (tenantId: string) => prisma.horecaZaak.findUnique({ where: { tenantId } });

type VoorbeeldItem = Omit<Prisma.HorecaItemCreateManyInput, "zaakId" | "categorieId" | "volgorde">;

/** Een voorbeeldkaart voor een nieuwe zaak, zodat site en QR-bestellen meteen iets laten zien. De zaak past alles aan. */
const VOORBEELD_KAART: { naam: string; items: VoorbeeldItem[] }[] = [
  { naam: "Voorgerechten", items: [{ naam: "Tomatensoep", omschrijving: "Huisgemaakt, met basilicum en brood.", prijsCent: 695, allergenen: ["gluten", "selderij"], vegetarisch: true }] },
  { naam: "Hoofdgerechten", items: [{ naam: "Saté van kippendij", omschrijving: "Met pindasaus, atjar en friet.", prijsCent: 1950, allergenen: ["pinda", "soja"] }] },
  { naam: "Desserts", items: [{ naam: "Dame blanche", omschrijving: "Vanille-ijs met warme chocoladesaus en slagroom.", prijsCent: 750, allergenen: ["melk", "eieren"], vegetarisch: true }] },
  {
    naam: "Dranken",
    items: [
      { naam: "Verse muntthee", omschrijving: "Met honing.", prijsCent: 350, allergenen: [], vegetarisch: true, veganistisch: true, station: "bar" },
      { naam: "Pils van de tap", omschrijving: "", prijsCent: 395, allergenen: ["gluten"], vegetarisch: true, veganistisch: true, station: "bar" },
    ],
  },
];

async function vrijeSlug(naam: string): Promise<string> {
  const basis = slugify(naam).slice(0, 40) || "zaak";
  for (let i = 1; i <= 50; i++) {
    const kandidaat = i === 1 ? basis : `${basis}-${i}`;
    if (!(await zaakVanSlug(kandidaat))) return kandidaat;
  }
  throw AppError.conflict("Kies een andere naam: deze bestaat al vaak.");
}

/** Het pakket aanzetten: de zaak plus een voorbeeldkaart. Bestaat hij al, dan die. */
export async function maakZaak(tenantId: string, g: { naam: string; soort: string; plaats: string; telefoon: string; email: string }): Promise<HorecaZaak> {
  const bestaat = await zaakVanTenant(tenantId);
  if (bestaat) return bestaat;
  const slug = await vrijeSlug(g.naam);
  return prisma.$transaction(async (tx) => {
    const zaak = await tx.horecaZaak.create({ data: { tenantId, slug, ...g, openingstijden: STANDAARD_TIJDEN } });
    for (const [i, c] of VOORBEELD_KAART.entries()) {
      const cat = await tx.horecaCategorie.create({ data: { zaakId: zaak.id, naam: c.naam, volgorde: i } });
      await tx.horecaItem.createMany({ data: c.items.map((it, j) => ({ ...it, zaakId: zaak.id, categorieId: cat.id, volgorde: j })) });
    }
    return zaak;
  });
}

export async function werkGegevensBij(
  zaak: HorecaZaak,
  g: { naam: string; soort: string; plaats: string; adres: string; telefoon: string; email: string; kvk: string; kleur: string; accent: string; kop: string; intro: string },
): Promise<HorecaZaak> {
  const { kop, intro, ...rest } = g;
  const website = { ...(zaak.website as Record<string, unknown>), kop, intro };
  return prisma.horecaZaak.update({ where: { id: zaak.id }, data: { ...rest, website } });
}

export const zetOnline = (zaak: HorecaZaak, online: boolean) => prisma.horecaZaak.update({ where: { id: zaak.id }, data: { online } });

export const zetOpeningstijden = (zaak: HorecaZaak, tijden: Partial<Openingstijden>) =>
  prisma.horecaZaak.update({ where: { id: zaak.id }, data: { openingstijden: { ...STANDAARD_TIJDEN, ...tijden } } });

export async function zetModuleAan(zaak: HorecaZaak, m: ModuleSleutel, aan: boolean) {
  if (aan && !MODULES[m].klaar) throw AppError.precondition(`${MODULES[m].naam} komt binnenkort; je kunt hem nog niet aanzetten.`);
  return prisma.horecaZaak.update({ where: { id: zaak.id }, data: { modules: zetModule(zaak.modules, m, aan) } });
}

// --- menukaart --------------------------------------------------------------

export async function menukaart(zaakId: string) {
  const [categorieen, items] = await Promise.all([
    prisma.horecaCategorie.findMany({ where: { zaakId }, orderBy: [{ volgorde: "asc" }, { naam: "asc" }] }),
    prisma.horecaItem.findMany({ where: { zaakId }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }] }),
  ]);
  return { categorieen, items };
}

export async function bewaarCategorie(zaak: HorecaZaak, c: { id?: string | undefined; naam: string }) {
  if (!c.id) {
    const volgorde = await prisma.horecaCategorie.count({ where: { zaakId: zaak.id } });
    return prisma.horecaCategorie.create({ data: { zaakId: zaak.id, naam: c.naam, volgorde } });
  }
  const r = await prisma.horecaCategorie.updateMany({ where: { id: c.id, zaakId: zaak.id }, data: { naam: c.naam } });
  if (!r.count) throw AppError.notFound("Categorie niet gevonden.");
  return prisma.horecaCategorie.findUniqueOrThrow({ where: { id: c.id } });
}

/** Weg met de categorie; de gerechten blijven, zonder categorie. */
export async function verwijderCategorie(zaak: HorecaZaak, id: string) {
  const r = await prisma.horecaCategorie.deleteMany({ where: { id, zaakId: zaak.id } });
  if (!r.count) throw AppError.notFound("Categorie niet gevonden.");
}

export async function bewaarItem(
  zaak: HorecaZaak,
  it: {
    id?: string | undefined;
    categorieId: string | null;
    naam: string;
    omschrijving: string;
    prijsCent: number;
    allergenen: string[];
    vegetarisch: boolean;
    veganistisch: boolean;
    beschikbaar: boolean;
    station: "keuken" | "bar";
  },
) {
  if (it.categorieId && !(await prisma.horecaCategorie.findFirst({ where: { id: it.categorieId, zaakId: zaak.id }, select: { id: true } }))) {
    throw AppError.validation("Kies een bestaande categorie.");
  }
  const { id, ...rest } = it;
  // veganistisch is altijd ook vegetarisch
  const data = { ...rest, allergenen: schoneAllergenen(it.allergenen), vegetarisch: it.vegetarisch || it.veganistisch };
  if (!id) {
    const volgorde = await prisma.horecaItem.count({ where: { zaakId: zaak.id, categorieId: it.categorieId } });
    return prisma.horecaItem.create({ data: { ...data, zaakId: zaak.id, volgorde } });
  }
  const r = await prisma.horecaItem.updateMany({ where: { id, zaakId: zaak.id }, data });
  if (!r.count) throw AppError.notFound("Gerecht niet gevonden.");
  return prisma.horecaItem.findUniqueOrThrow({ where: { id } });
}

export async function zetBeschikbaar(zaak: HorecaZaak, id: string, beschikbaar: boolean) {
  const r = await prisma.horecaItem.updateMany({ where: { id, zaakId: zaak.id }, data: { beschikbaar } });
  if (!r.count) throw AppError.notFound("Gerecht niet gevonden.");
}

export async function verwijderItem(zaak: HorecaZaak, id: string) {
  const r = await prisma.horecaItem.deleteMany({ where: { id, zaakId: zaak.id } });
  if (!r.count) throw AppError.notFound("Gerecht niet gevonden.");
}
