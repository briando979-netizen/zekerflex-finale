import { kvkLimietVan } from "@/lib/kvk/tegoed";
import { isKvkNummer, schonePostcode } from "@/lib/kvk/normaliseer";
import type { KvkBedrijf, KvkTreffer } from "@/lib/kvk/types";

// ---------------------------------------------------------------------------
// Antwoorden van de bronnen omzetten naar onze eigen vorm. Puur (alleen
// types), zodat de tests ze zonder netwerk kunnen draaien.
// ---------------------------------------------------------------------------

/** Het deel van een KVKBase-profiel (types/company.ts) dat de index nodig heeft. */
export interface ProfielVoorIndex {
  kvkNumber: string;
  legalName: string;
  tradeName: string | null;
  legalForm: string | null;
  status: string;
  insolvent: boolean;
  address: { street: string | null; houseNumber: string | null; postalCode: string | null; city: string | null };
  vat: { number: string | null } | null;
}

/** Een volledig KVKBase-profiel naar een indexrecord; null zonder geldig nummer. */
export function profielNaarBedrijf(p: ProfielVoorIndex, nu: Date = new Date()): KvkBedrijf | null {
  if (!isKvkNummer(p.kvkNumber) || !p.legalName.trim() || p.legalName === "Onbekend") return null;
  const btw = p.vat?.number?.replace(/[\s.-]/g, "").toUpperCase() ?? null;
  return {
    kvk: p.kvkNumber,
    naam: p.legalName.trim().slice(0, 160),
    handelsnaam: p.tradeName,
    rechtsvorm: p.legalForm,
    straat: p.address.street,
    huisnummer: p.address.houseNumber,
    postcode: schonePostcode(p.address.postalCode),
    plaats: p.address.city,
    btw: btw && /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(btw) ? btw : null,
    actief: p.insolvent ? false : p.status === "ACTIVE" ? true : p.status === "DISSOLVED" ? false : null,
    bron: "kvkbase",
    bijgewerkt: nu.toISOString(),
  };
}

/** Een zoektreffer van KVKBase (alleen naam en plaats) naar een indexrecord. */
export function treffNaarBedrijf(t: { kvkNumber: string; name: string; city: string | null; actief?: boolean | null }, nu: Date = new Date()): KvkBedrijf | null {
  if (!isKvkNummer(t.kvkNumber) || !t.name.trim()) return null;
  return {
    kvk: t.kvkNumber,
    naam: t.name.trim().slice(0, 160),
    handelsnaam: null,
    rechtsvorm: null,
    straat: null,
    huisnummer: null,
    postcode: null,
    plaats: t.city,
    btw: null,
    actief: t.actief ?? null,
    bron: "kvkbase",
    bijgewerkt: nu.toISOString(),
  };
}

export interface AdresDelen {
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
}

/** "Oudegracht 1a, 3511 AA Utrecht" (zoals lib/integrations/osm-plaatsen.ts het maakt) in losse delen. */
export function parseOsmAdres(adres: string): AdresDelen {
  const [links = "", rechts = ""] = adres.split(",").map((s) => s.trim());
  const straat = /^(.*?)\s+(\d+\s?[A-Za-z0-9-]{0,4})$/.exec(links);
  const pc = /^(\d{4}\s?[A-Za-z]{2})\s+(.+)$/.exec(rechts);
  return {
    street: straat?.[1] ? straat[1] : links || null,
    houseNumber: straat?.[2] ? straat[2].replace(/\s+/g, "") : null,
    postalCode: schonePostcode(pc?.[1] ?? ""),
    city: pc?.[2] ?? (rechts && !pc ? rechts : null),
  };
}

/** Een OpenStreetMap-plaats als treffer. Geen KVK-nummer: OSM kent dat niet. */
export function osmNaarTreffer(p: { naam: string; adres: string; plaats: string | null }): KvkTreffer {
  const delen = parseOsmAdres(p.adres);
  return {
    kvkNumber: null,
    name: p.naam,
    city: p.plaats ?? delen.city,
    legalForm: null,
    street: delen.street,
    houseNumber: delen.houseNumber,
    postalCode: delen.postalCode,
    vatNumber: null,
    source: "osm",
    active: null,
  };
}

/** Een tijdslimiet om een belofte: na `ms` geeft hij `terugval`, zonder de bron te laten crashen. */
export async function metTijdslimiet<T>(belofte: Promise<T>, ms: number, terugval: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      belofte,
      new Promise<T>((klaar) => {
        timer = setTimeout(() => klaar(terugval), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Zit de betaalde dienst aan zijn limiet of tegoed? (Zie lib/integrations/kvkbase.ts en lib/kvk/tegoed.ts: 402/429.) */
export function isLimiet(err: unknown): boolean {
  return kvkLimietVan(err) !== null;
}
