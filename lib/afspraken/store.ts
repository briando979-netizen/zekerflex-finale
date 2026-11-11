// ---------------------------------------------------------------------------
// Opslag van afspraken en klantenkaart, in de KV-opslag per organisatie (geen migratie nodig):
//   afspraken:inst:<tenantId>                  de instellingen van het bedrijf
//   afspraken:slug:<slug>                      welke organisatie bij een boekadres hoort
//   afspraken:item:<tenantId>:<dag>~<id>       één afspraak; de dag staat in de sleutel, een dag is zo in één keer op te halen
//   afspraken:klant:<tenantId>:<sleutel>       de notitie bij een klant
// Gegevens van klanten van een bedrijf (naam, telefoon, e-mail) zijn gegevens van derden: een bedrijf kan een klant
// helemaal laten wissen (verwijderKlant), en de boekpagina zegt vooraf waar de gegevens heen gaan.
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { kvDelete, kvGet, kvListEntries, kvListValues, kvSet } from "@/lib/storage/kv";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import {
  AFSPRAAK_ID,
  DAG_SLEUTEL,
  bezet,
  eindVan,
  isVrij,
  klantSleutel,
  klantenUit,
  schoneTekst,
  type Afspraak,
  type AfspraakStatus,
  type Instellingen,
  type Klant,
  type KlantKaart,
} from "@/lib/afspraken/model";

const MAX_AFSPRAKEN = 5_000;

/** Een kort willekeurig id voor een dienst of medewerker (hex, 8 tekens). */
export const nieuwId = (): string => randomBytes(4).toString("hex");

const sleutelInst = (t: string) => `afspraken:inst:${t}`;
const sleutelSlug = (s: string) => `afspraken:slug:${s}`;
const voorvoegselItems = (t: string) => `afspraken:item:${t}:`;
const sleutelItem = (t: string, id: string) => `${voorvoegselItems(t)}${id}`;
const sleutelKlant = (t: string, k: string) => `afspraken:klant:${t}:${k}`;

// --- instellingen ------------------------------------------------------------

export async function leesInstellingen(tenantId: string): Promise<Instellingen | null> {
  return kvGet<Instellingen>(sleutelInst(tenantId));
}

/** Bewaart de instellingen. Het boekadres is van één organisatie tegelijk; een nieuw adres maakt het oude weer vrij. */
export async function bewaarInstellingen(tenantId: string, waarde: Instellingen): Promise<void> {
  const eigenaar = await kvGet<{ tenantId: string }>(sleutelSlug(waarde.slug));
  if (eigenaar && eigenaar.tenantId !== tenantId) throw AppError.conflict("Dit adres is al van een ander bedrijf. Kies een ander adres voor je boekpagina.");
  const oud = await leesInstellingen(tenantId);
  await kvSet(sleutelSlug(waarde.slug), { tenantId });
  await kvSet(sleutelInst(tenantId), waarde);
  if (oud && oud.slug !== waarde.slug) {
    const van = await kvGet<{ tenantId: string }>(sleutelSlug(oud.slug));
    if (van?.tenantId === tenantId) await kvDelete(sleutelSlug(oud.slug));
  }
}

/** De boekpagina van een bedrijf, alleen als hij openstaat voor klanten. */
export async function openInstellingenVanSlug(slug: string): Promise<{ tenantId: string; instellingen: Instellingen } | null> {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return null;
  const eigenaar = await kvGet<{ tenantId: string }>(sleutelSlug(slug));
  if (!eigenaar) return null;
  const instellingen = await leesInstellingen(eigenaar.tenantId);
  return instellingen && instellingen.actief && instellingen.slug === slug ? { tenantId: eigenaar.tenantId, instellingen } : null;
}

// --- afspraken ---------------------------------------------------------------

export async function afsprakenVanDag(tenantId: string, dag: string): Promise<Afspraak[]> {
  if (!DAG_SLEUTEL.test(dag)) return [];
  return kvListValues<Afspraak>(`${voorvoegselItems(tenantId)}${dag}~`, 500);
}

/** Alle afspraken tussen twee dagen (allebei inbegrepen), op tijd. */
export async function afsprakenTussen(tenantId: string, vanDag: string, totDag: string): Promise<Afspraak[]> {
  if (!DAG_SLEUTEL.test(vanDag) || !DAG_SLEUTEL.test(totDag)) return [];
  const alle = await kvListValues<Afspraak>(voorvoegselItems(tenantId), MAX_AFSPRAKEN);
  return alle.filter((a) => a.id.slice(0, 10) >= vanDag && a.id.slice(0, 10) <= totDag).sort((a, b) => a.start.localeCompare(b.start));
}

export interface BoekInvoer {
  dienstId: string;
  medewerkerId: string;
  start: Date;
  klant: Klant;
  opmerking: string;
  bron: "online" | "balie";
}

const overlapt = (a: Afspraak, b: Afspraak) => new Date(a.start).getTime() < new Date(b.eind).getTime() && new Date(a.eind).getTime() > new Date(b.start).getTime();

/**
 * Een afspraak maken. De server controleert zelf of de tijd vrij is (dezelfde regels als de boekpagina), want de klant
 * wordt niet vertrouwd. De opslag kent geen echte vergrendeling: schrijven twee klanten tegelijk dezelfde tijd, dan
 * kijken we na het schrijven nog één keer; de afspraak die het eerst werd gemaakt blijft, de ander krijgt "net bezet".
 * `bron: "balie"` (het bedrijf zelf, bijvoorbeeld na een telefoontje) negeert de voorlooptijd.
 */
export async function boek(tenantId: string, i: Instellingen, invoer: BoekInvoer, nu: Date = new Date()): Promise<Afspraak> {
  const dienst = i.diensten.find((d) => d.id === invoer.dienstId);
  const medewerker = i.medewerkers.find((m) => m.id === invoer.medewerkerId);
  if (!dienst || !medewerker) throw AppError.validation("Kies een dienst en een medewerker uit de lijst.");
  const dag = amsterdamDayKey(invoer.start);
  const bestaand = await afsprakenVanDag(tenantId, dag);
  const handmatig = invoer.bron === "balie";
  if (!isVrij(i, { dienstId: dienst.id, medewerkerId: medewerker.id, start: invoer.start, afspraken: bestaand, nu, ...(handmatig ? { metVoorlooptijd: false } : {}) })) {
    throw AppError.conflict("Deze tijd is net bezet of niet meer beschikbaar. Kies een andere tijd.");
  }
  const afspraak: Afspraak = {
    id: `${dag}~${randomBytes(5).toString("hex")}`,
    dienstId: dienst.id,
    dienstNaam: dienst.naam,
    duurMin: dienst.duurMin,
    prijsCent: dienst.prijsCent,
    medewerkerId: medewerker.id,
    medewerkerNaam: medewerker.naam,
    start: invoer.start.toISOString(),
    eind: eindVan(invoer.start, dienst.duurMin).toISOString(),
    klant: invoer.klant,
    opmerking: schoneTekst(invoer.opmerking, 300),
    status: "bevestigd",
    bron: invoer.bron,
    gemaaktOp: nu.toISOString(),
  };
  await kvSet(sleutelItem(tenantId, afspraak.id), afspraak);
  // na het schrijven nog één keer kijken of een ander tegelijk dezelfde tijd nam
  const na = await afsprakenVanDag(tenantId, dag);
  const eerder = na.find((a) => a.id !== afspraak.id && a.medewerkerId === afspraak.medewerkerId && bezet(a) && overlapt(a, afspraak) && (a.gemaaktOp < afspraak.gemaaktOp || (a.gemaaktOp === afspraak.gemaaktOp && a.id < afspraak.id)));
  if (eerder) {
    await kvDelete(sleutelItem(tenantId, afspraak.id));
    throw AppError.conflict("Deze tijd is net bezet geraakt. Kies een andere tijd.");
  }
  return afspraak;
}

export async function leesAfspraak(tenantId: string, id: string): Promise<Afspraak | null> {
  if (!AFSPRAAK_ID.test(id)) return null;
  return kvGet<Afspraak>(sleutelItem(tenantId, id));
}

export async function zetStatus(tenantId: string, id: string, status: AfspraakStatus): Promise<Afspraak> {
  const a = await leesAfspraak(tenantId, id);
  if (!a) throw AppError.notFound("Deze afspraak bestaat niet (meer).");
  const nieuw: Afspraak = { ...a, status };
  await kvSet(sleutelItem(tenantId, id), nieuw);
  return nieuw;
}

// --- klantenkaart ------------------------------------------------------------

interface Notitie {
  sleutel: string;
  notitie: string;
}

export async function notitiesVan(tenantId: string): Promise<Map<string, string>> {
  const lijst = await kvListEntries<Notitie>(`afspraken:klant:${tenantId}:`, 2_000);
  return new Map(lijst.map((e) => [e.value.sleutel, e.value.notitie]));
}

export async function klantenLijst(tenantId: string, nu: Date = new Date()): Promise<KlantKaart[]> {
  const [afspraken, notities] = await Promise.all([kvListValues<Afspraak>(voorvoegselItems(tenantId), MAX_AFSPRAKEN), notitiesVan(tenantId)]);
  return klantenUit(afspraken, notities, nu);
}

/** Alle afspraken van één klant, de nieuwste eerst. */
export async function afsprakenVanKlant(tenantId: string, sleutel: string): Promise<Afspraak[]> {
  const alle = await kvListValues<Afspraak>(voorvoegselItems(tenantId), MAX_AFSPRAKEN);
  return alle.filter((a) => klantSleutel(a.klant) === sleutel).sort((a, b) => b.start.localeCompare(a.start));
}

export async function bewaarNotitie(tenantId: string, sleutel: string, notitie: string): Promise<void> {
  const schoon = schoneTekst(notitie, 1_000);
  if (!schoon) {
    await kvDelete(sleutelKlant(tenantId, sleutel));
    return;
  }
  await kvSet(sleutelKlant(tenantId, sleutel), { sleutel, notitie: schoon } satisfies Notitie);
}

/**
 * Een klant helemaal wissen (recht op vergetelheid): de notitie weg en alle persoonsgegevens uit zijn afspraken. De
 * afspraken zelf blijven als lege regel bestaan (dienst, tijd, status), zodat de agenda en de cijfers van het bedrijf kloppen.
 */
export async function verwijderKlant(tenantId: string, sleutel: string): Promise<number> {
  const alle = await kvListEntries<Afspraak>(voorvoegselItems(tenantId), MAX_AFSPRAKEN);
  let aantal = 0;
  for (const e of alle) {
    if (klantSleutel(e.value.klant) !== sleutel) continue;
    await kvSet(e.key, { ...e.value, klant: { naam: "Verwijderd", telefoon: "", email: "" }, opmerking: "" } satisfies Afspraak);
    aantal += 1;
  }
  await kvDelete(sleutelKlant(tenantId, sleutel));
  return aantal;
}
