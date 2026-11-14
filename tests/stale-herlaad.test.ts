import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { STALE_HERLAAD_MIN_MS, STALE_HERLAAD_SLEUTEL, magStaleHerladen, type TabOpslag } from "@/lib/ops/stale-herlaad";
import { isStaleDeployment } from "@/lib/ops/stale-deployment";

// Gemeten 14 nov (foutenlogboek): 7 meldingen "An unexpected response was received from the server" op /login, /verifieer-email, /dashboard/account, /os
// en /admin/shop, allemaal vóór 11 nov 00:00 (toen kreeg app/error.tsx het herlaad-vangnet voor deze melding), daarna geen één. De beheeromgeving heeft
// een eigen foutgrens (app/admin/error.tsx) die dat vangnet NIET had: daar bleef "Opnieuw proberen" (een reset zonder herlading) op een verouderd tabblad hangen.
const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

function opslag(): TabOpslag & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("de herlaad-beveiliging na een uitrol", () => {
  it("herlaadt de eerste keer en onthoudt het tijdstip", () => {
    const o = opslag();
    expect(magStaleHerladen(o, 1_000_000)).toBe(true);
    expect(o.data.get(STALE_HERLAAD_SLEUTEL)).toBe("1000000");
  });

  it("herlaadt niet nog eens binnen 10 seconden (geen lus), daarna weer wel", () => {
    const o = opslag();
    expect(magStaleHerladen(o, 1_000_000)).toBe(true);
    expect(magStaleHerladen(o, 1_000_000 + STALE_HERLAAD_MIN_MS)).toBe(false);
    expect(magStaleHerladen(o, 1_000_000 + STALE_HERLAAD_MIN_MS + 1)).toBe(true);
  });

  it("herlaadt niet zonder werkende opslag, en niet bij een kapotte opslag", () => {
    expect(magStaleHerladen(null, 5_000_000)).toBe(false);
    const kapot: TabOpslag = { getItem: () => { throw new Error("geblokkeerd"); }, setItem: () => { throw new Error("geblokkeerd"); } };
    expect(magStaleHerladen(kapot, 5_000_000)).toBe(false);
    const vol: TabOpslag = { getItem: () => null, setItem: () => { throw new Error("vol"); } };
    expect(magStaleHerladen(vol, 5_000_000)).toBe(false);
  });

  it("een onleesbare waarde in de opslag telt als nooit herladen", () => {
    const o = opslag();
    o.data.set(STALE_HERLAAD_SLEUTEL, "rommel");
    expect(magStaleHerladen(o, 5_000_000)).toBe(true);
  });
});

describe("de foutgrenzen", () => {
  it("de melding van de uitrol wordt herkend (ook die van /admin/shop)", () => {
    expect(isStaleDeployment({ message: "An unexpected response was received from the server." })).toBe(true);
  });

  it.each(["app/error.tsx", "app/admin/error.tsx"])("%s herlaadt eenmaal bij een verouderd tabblad, via de gedeelde beveiliging", (pad) => {
    const bron = lees(pad);
    expect(bron).toContain("isStaleDeployment(error)");
    expect(bron).toContain("magStaleHerladen(tabOpslag(), Date.now())");
    expect(bron).toContain("window.location.reload()");
    // geen eigen sessionStorage-logica meer in de foutgrens
    expect(bron).not.toContain("sessionStorage");
  });

  it("de beheer-foutgrens zegt in gewoon Nederlands dat er een nieuwe versie live staat en biedt Pagina vernieuwen", () => {
    const bron = lees("app/admin/error.tsx");
    expect(bron).toContain("Er is net een nieuwe versie live gezet");
    expect(bron).toContain("Pagina vernieuwen");
    expect(bron).toContain('onClick={() => (stale ? window.location.reload() : reset())}');
  });
});