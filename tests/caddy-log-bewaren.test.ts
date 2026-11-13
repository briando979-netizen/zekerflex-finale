import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Het toegangslog van Caddy (deploy/caddy/Caddyfile, blok toegangslog): hoe lang en hoeveel (13 nov 2026). Met roll_keep 3
// bleef er maar ±1,7 dag over, terwijl de privacyverklaring en /beveiliging "zeven dagen" beloven. De termijn (roll_keep_for)
// moet gelijk zijn aan wat die twee teksten zeggen: het log bevat IP-adressen (AVG). Het aantal bestanden moet die termijn
// dekken, en de ruimte blijft onder een plafond van ±1,5 GB.

const caddy = readFileSync("deploy/caddy/Caddyfile", "utf8");
// zonder commentaarregels: de toelichting in het blok noemt ook waarden ("roll_keep 3")
const blok = caddy
  .slice(caddy.indexOf("(toegangslog) {"), caddy.indexOf("format filter", caddy.indexOf("(toegangslog) {")))
  .split("\n")
  .filter((regel) => !regel.trim().startsWith("#"))
  .join("\n");
const getal = (re: RegExp) => Number(re.exec(blok)?.[1] ?? Number.NaN);

const rollMb = getal(/roll_size (\d+)mb/);
const keep = getal(/roll_keep (\d+)\b/);
const keepUur = getal(/roll_keep_for (\d+)h/);
const dagen = keepUur / 24;
const WOORD: Record<number, string> = { 7: "zeven", 14: "veertien" };

/** Gemeten op 13 nov: ±120 MB toegangslog per dag; een gerold bestand is gezipt ±16× kleiner (hier voorzichtig 10×). */
const MB_PER_DAG = 120;
const ZIP = 10;

describe("toegangslog van Caddy: termijn, aantal en ruimte", () => {
  it("de waarden staan er en zijn hele dagen", () => {
    expect(rollMb).toBeGreaterThan(0);
    expect(keep).toBeGreaterThan(0);
    expect(Number.isInteger(dagen)).toBe(true);
    // zippen staat standaard aan; roll_uncompressed zou het uitzetten (en roll_gzip bestaat in de Caddyfile niet)
    expect(blok).not.toMatch(/roll_uncompressed|roll_gzip/);
  });

  it("de termijn is gelijk aan wat de privacyverklaring en /beveiliging beloven", () => {
    const privacy = readFileSync("app/(marketing)/privacy/page.tsx", "utf8");
    const woord = WOORD[dagen] ?? String(dagen);
    expect(privacy).toMatch(new RegExp(`toegangslog (${dagen}|${woord}) dagen`));
    const beveiliging = readFileSync("app/(marketing)/beveiliging/page.tsx", "utf8");
    const regel = beveiliging.slice(beveiliging.indexOf("Toegangslog van de webserver"), beveiliging.indexOf("Toegangslog van de webserver") + 400);
    expect(regel).toContain(`hoelang: "${dagen} dagen"`);
    expect(dagen).toBeLessThanOrEqual(14);
  });

  it("genoeg bestanden voor die termijn, en onder ±1,5 GB", () => {
    const dagenGedekt = (keep * rollMb) / MB_PER_DAG;
    expect(dagenGedekt).toBeGreaterThanOrEqual(dagen);
    const ruimteMb = (keep * rollMb) / ZIP + rollMb;
    expect(ruimteMb).toBeLessThanOrEqual(1500);
  });
});
