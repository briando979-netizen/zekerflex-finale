// ---------------------------------------------------------------------------
// Websitestudio → Klanten (4 nov 2026): iedereen die via de eigen website heeft
// besteld of gereserveerd, samengevoegd per e-mailadres (anders telefoon, dan
// naam). Geen aparte klantenlijst om bij te houden: het komt uit de bestellingen
// (lib/sites/bestellingen.ts) en reserveringen (lib/sites/reserveringen-opslag.ts).
// Puur, zodat de tests en het scherm dezelfde regels gebruiken.
// ---------------------------------------------------------------------------

export interface KlantBestelling {
  at: string;
  status: string;
  totaalCents: number;
  invoer: { naam: string; email: string; telefoon: string; plaats: string };
}

export interface KlantReservering {
  at: string;
  datum: string;
  status: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
}

export interface Klant {
  sleutel: string;
  naam: string;
  email: string;
  telefoon: string;
  plaats: string;
  bestellingen: number;
  /** besteed in centen, zonder geannuleerde bestellingen */
  besteedCents: number;
  reserveringen: number;
  /** de eerste en laatste keer dat de klant iets deed (ISO) */
  eerste: string;
  laatste: string;
}

const sleutelVan = (naam: string, email: string, telefoon: string) => {
  if (email.trim()) return `e:${email.trim().toLowerCase()}`;
  const tel = telefoon.replace(/\D/g, "");
  if (tel.length >= 8) return `t:${tel.slice(-9)}`;
  return `n:${naam.trim().toLowerCase()}`;
};

/** De klanten, wie het laatst iets deed bovenaan. */
export function klantenUit(bestellingen: KlantBestelling[], reserveringen: KlantReservering[]): Klant[] {
  const m = new Map<string, Klant>();
  const pak = (naam: string, email: string, telefoon: string, at: string): Klant => {
    const sleutel = sleutelVan(naam, email, telefoon);
    let k = m.get(sleutel);
    if (!k) {
      k = { sleutel, naam: naam.trim(), email: email.trim(), telefoon: telefoon.trim(), plaats: "", bestellingen: 0, besteedCents: 0, reserveringen: 0, eerste: at, laatste: at };
      m.set(sleutel, k);
    }
    // de nieuwste gegevens winnen (iemand verhuist of krijgt een ander nummer)
    if (at >= k.laatste) {
      k.laatste = at;
      if (naam.trim()) k.naam = naam.trim();
      if (telefoon.trim()) k.telefoon = telefoon.trim();
    }
    if (at < k.eerste) k.eerste = at;
    return k;
  };
  for (const b of bestellingen) {
    const i = b.invoer;
    if (!i.naam && !i.email && !i.telefoon) continue;
    const k = pak(i.naam, i.email, i.telefoon, b.at);
    k.bestellingen += 1;
    if (b.status !== "geannuleerd") k.besteedCents += b.totaalCents;
    if (i.plaats && b.at >= k.laatste) k.plaats = i.plaats;
    else if (i.plaats && !k.plaats) k.plaats = i.plaats;
  }
  for (const r of reserveringen) {
    if (!r.naam && !r.email && !r.telefoon) continue;
    const k = pak(r.naam, r.email, r.telefoon, r.at);
    if (r.status !== "geannuleerd") k.reserveringen += 1;
  }
  return [...m.values()].sort((a, b) => b.laatste.localeCompare(a.laatste));
}

/** Kerncijfers boven de lijst. */
export function klantCijfers(klanten: Klant[]): { aantal: number; terugkerend: number; gemiddeldCents: number } {
  const kopers = klanten.filter((k) => k.bestellingen > 0);
  const terugkerend = klanten.filter((k) => k.bestellingen + k.reserveringen >= 2).length;
  const totaal = kopers.reduce((s, k) => s + k.besteedCents, 0);
  return { aantal: klanten.length, terugkerend, gemiddeldCents: kopers.length ? Math.round(totaal / kopers.length) : 0 };
}

/** Puntkomma's en een BOM, zodat Excel het Nederlands opent; geen formules uit wat klanten typen. */
export function klantenCsv(klanten: Klant[]): string {
  const cel = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const bedrag = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const kop = ["Naam", "E-mail", "Telefoon", "Plaats", "Bestellingen", "Besteed", "Reserveringen", "Klant sinds", "Laatst"];
  const rij = (k: Klant) => [k.naam, k.email, k.telefoon, k.plaats, String(k.bestellingen), bedrag(k.besteedCents), String(k.reserveringen), k.eerste.slice(0, 10), k.laatste.slice(0, 10)];
  return "﻿" + [kop, ...klanten.map(rij)].map((r) => r.map(cel).join(";")).join("\r\n");
}
