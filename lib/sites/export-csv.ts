import type { BestelStatus, SiteBestelling } from "@/lib/sites/bestellingen";
import type { SiteProduct, Winkel } from "@/lib/sites/types";
import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";
import { isUitverkocht } from "@/lib/sites/winkel";

// ---------------------------------------------------------------------------
// Studio → Webshop → Groei → Exporteren: bestellingen, klanten en producten als
// CSV die Nederlandse Excel meteen goed opent: UTF-8 met BOM, puntkomma's,
// bedragen met een komma, kolomnamen in het Nederlands. Wat klanten zelf typten
// kan geen formule worden: een cel die met = + - @ (of tab/return) begint, krijgt
// een apostrof ervoor. Puur; de routes staan in app/api/werkgever/sites/export.
// (Klanten: klantenCsv in lib/sites/klanten.ts, met dezelfde regels.)
// ---------------------------------------------------------------------------

const BOM = "﻿";

/** Eén cel: altijd tussen aanhalingstekens (dan mogen puntkomma's en regeleinden erin), nooit een formule. */
export function csvCel(waarde: string | number): string {
  const s = String(waarde);
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

/** Een heel bestand: de kopregel en de rijen, Windows-regeleinden, met BOM. */
export function csvBestand(kop: string[], rijen: (string | number)[][]): string {
  return BOM + [kop, ...rijen].map((r) => r.map(csvCel).join(";")).join("\r\n");
}

/** 1295 → "12,95" (zonder euroteken, zodat Excel er een getal van maakt). */
export const csvBedrag = (cents: number) => (Math.round(cents) / 100).toFixed(2).replace(".", ",");

const STATUS_TEKST: Record<BestelStatus, string> = { nieuw: "Nieuw", bevestigd: "Bevestigd", klaar: "Klaar", afgerond: "Afgerond", geannuleerd: "Geannuleerd" };

export function bestellingenCsv(rows: SiteBestelling[]): string {
  const kop = ["Bestelnummer", "Datum", "Tijd", "Status", "Naam", "E-mail", "Telefoon", "Levering", "Straat en huisnummer", "Postcode", "Plaats", "Producten", "Aantal artikelen", "Subtotaal", "Bezorgkosten", "Totaal", "Opmerking"];
  const rijen = rows.map((b) => {
    const i = b.invoer;
    const bezorgen = i.levering === "bezorgen";
    return [
      b.nr,
      amsterdamDayKey(b.at),
      amsterdamClock(b.at),
      STATUS_TEKST[b.status] ?? b.status,
      i.naam,
      i.email,
      i.telefoon,
      bezorgen ? "Bezorgen" : "Afhalen",
      bezorgen ? i.straat : "",
      bezorgen ? i.postcode : "",
      bezorgen ? i.plaats : "",
      b.regels.map((r) => `${r.aantal} × ${r.naam}`).join(", "),
      b.regels.reduce((som, r) => som + r.aantal, 0),
      csvBedrag(b.subtotaalCents),
      csvBedrag(b.bezorgkostenCents),
      csvBedrag(b.totaalCents),
      i.opmerking,
    ];
  });
  return csvBestand(kop, rijen);
}

const jaNee = (b: boolean) => (b ? "ja" : "nee");
const opties = (p: SiteProduct) => (p.opties ?? []).map((o) => `${o.naam}: ${o.waarden.join(", ")}`).join(" | ");

/** De producten in de volgorde van de winkel; `adres` is waar de site staat ("https://jouwwinkel.nl"), voor de link. */
export function productenCsv(w: Winkel, adres: string): string {
  const kop = ["Naam", "Categorie", "Prijs", "Oude prijs", "Voorraad", "Uitverkocht", "Zichtbaar", "Opties", "Korte tekst", "Omschrijving", "Aantal foto's", "Link"];
  const basis = adres.replace(/\/+$/, "");
  const rijen = w.producten.map((p) => [
    p.naam,
    p.categorie,
    csvBedrag(p.prijsCents),
    p.oudePrijsCents != null && p.oudePrijsCents > p.prijsCents ? csvBedrag(p.oudePrijsCents) : "",
    p.voorraad == null ? "niet bijgehouden" : p.voorraad,
    jaNee(isUitverkocht(p)),
    jaNee(p.zichtbaar),
    opties(p),
    p.korteTekst,
    p.omschrijving,
    p.fotos.length,
    `${basis}/p/${p.slug}`,
  ]);
  return csvBestand(kop, rijen);
}

/** De bestandsnaam met de dag erin: "bestellingen-2026-11-10.csv". */
export const csvNaam = (wat: string, nu: Date) => `${wat}-${amsterdamDayKey(nu)}.csv`;
