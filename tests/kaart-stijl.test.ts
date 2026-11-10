import { describe, expect, it } from "vitest";
import { layers } from "@protomaps/basemaps";
import { GEBOUWEN_3D, KAART_STIJLEN, KAART_SYMBOLEN, kaartStijl, VERFIJNINGEN } from "@/lib/kaart/stijl";
import { KAART_LETTERTYPES, ZF_DONKER, ZF_LICHT } from "@/lib/kaart/kleuren";

const ORIGIN = "https://zekerflex.test";
const ALLE = KAART_STIJLEN.flatMap((s) => [false, true].map((drie) => ({ naam: `${s.id}${drie ? " + 3D" : ""}`, stijl: s.id, drie, st: kaartStijl(ORIGIN, s.id, drie) })));

type Laag = { id: string; type: string; source?: string; layout?: Record<string, unknown>; paint?: Record<string, unknown>; filter?: unknown };
const lagenVan = (st: ReturnType<typeof kaartStijl>) => st.layers as unknown as Laag[];

// lettertypes uit een text-font: een lijst namen, of een expressie met ["literal", [namen]]
const OPERATOREN = new Set(["case", "match", "step", "coalesce", "get", "has", "any", "all", "!", "==", "!=", "<", "<=", ">", ">="]);
function letters(waarde: unknown): string[] {
  if (!Array.isArray(waarde)) return [];
  if (waarde[0] === "literal") return Array.isArray(waarde[1]) ? waarde[1].filter((w): w is string => typeof w === "string") : [];
  if (typeof waarde[0] === "string" && OPERATOREN.has(waarde[0])) return waarde.slice(1).flatMap(letters);
  return waarde.every((w) => typeof w === "string") ? (waarde as string[]) : waarde.flatMap(letters);
}
function alleLetters(x: unknown, uit: Set<string>): Set<string> {
  if (Array.isArray(x)) x.forEach((w) => alleLetters(w, uit));
  else if (x && typeof x === "object")
    for (const [sleutel, w] of Object.entries(x)) {
      if (sleutel === "text-font") letters(w).forEach((l) => uit.add(l));
      alleLetters(w, uit);
    }
  return uit;
}

/** De uitkomst van ["match", invoer, label, uitkomst, …, anders] voor één waarde (uitkomst ["get", …] = de waarde zelf). */
function kiesUitMatch(expr: unknown[], waarde: string): unknown {
  for (let i = 2; i + 1 < expr.length; i += 2) {
    const label = expr[i];
    if (label === waarde || (Array.isArray(label) && label.includes(waarde))) {
      const uit = expr[i + 1];
      return Array.isArray(uit) && uit[0] === "get" ? waarde : uit;
    }
  }
  return expr[expr.length - 1];
}

function hex(kleur: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(kleur);
  if (!m) throw new Error(`geen kleur: ${kleur}`);
  return [parseInt(m[1] ?? "0", 16), parseInt(m[2] ?? "0", 16), parseInt(m[3] ?? "0", 16)];
}
function helderheid(kleur: string): number {
  const [r, g, b] = hex(kleur).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [helderheid(a), helderheid(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("ZekerFlex Kaart: de stijl", () => {
  it.each(ALLE)("$naam: geldige opbouw met unieke laag-id's en bestaande bronnen", ({ st }) => {
    expect(st.version).toBe(8);
    const ids = lagenVan(st).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of lagenVan(st)) if (l.source) expect(Object.keys(st.sources)).toContain(l.source);
  });

  it.each(ALLE)("$naam: haalt niets van buiten (tegels, letters en symbolen van onze eigen site)", ({ st }) => {
    expect(st.glyphs?.startsWith(`${ORIGIN}/kaart-data/fonts/`)).toBe(true);
    expect(typeof st.sprite === "string" && st.sprite.startsWith(`${ORIGIN}/kaart-data/sprites/`)).toBe(true);
    for (const bron of Object.values(st.sources)) {
      const b = bron as { url?: string; tiles?: string[] };
      if (b.url) expect(b.url.startsWith(`pmtiles://${ORIGIN}/`)).toBe(true);
      for (const t of b.tiles ?? []) expect(t.startsWith(`${ORIGIN}/`)).toBe(true);
    }
  });

  it.each(ALLE)("$naam: alleen lettertypes die op de server staan", ({ st }) => {
    const gebruikt = alleLetters(st.layers, new Set());
    expect(gebruikt.size).toBeGreaterThanOrEqual(3);
    for (const l of gebruikt) expect(KAART_LETTERTYPES as readonly string[]).toContain(l);
    expect(JSON.stringify(st)).not.toContain("Noto Sans Devanagari");
  });

  it.each(ALLE)("$naam: elke plek met een icoon krijgt een symbool dat in de set staat", ({ st }) => {
    const pois = lagenVan(st).find((l) => l.id === "pois");
    expect(pois).toBeDefined();
    const soorten = JSON.stringify(pois?.filter).match(/\["literal",\[([^\]]+)\]\]/)?.[1];
    const lijst = JSON.parse(`[${soorten ?? ""}]`) as string[];
    expect(lijst).toContain("restaurant");
    expect(lijst).toContain("townhall");
    for (const soort of lijst) {
      const icoon = kiesUitMatch(pois?.layout?.["icon-image"] as unknown[], soort);
      if (icoon !== "") expect(KAART_SYMBOLEN as readonly string[]).toContain(icoon);
    }
    expect(kiesUitMatch(pois?.layout?.["icon-image"] as unknown[], "townhall")).toBe("building");
    expect(kiesUitMatch(pois?.layout?.["icon-image"] as unknown[], "station")).toBe("train_station");
  });

  it("houdt alle Protomaps-lagen (andere kaarten mogen erop rekenen) en verfijnt alleen lagen die bestaan", () => {
    const protomaps = layers("protomaps", ZF_LICHT.smaak, { lang: "nl" }).map((l) => l.id);
    for (const { stijl, st } of ALLE) {
      if (stijl === "luchtfoto") continue;
      const ids = lagenVan(st).map((l) => l.id);
      for (const id of protomaps) expect(ids).toContain(id);
      for (const id of ids) expect(protomaps.includes(id) || id === GEBOUWEN_3D || id.startsWith("zf-")).toBe(true);
    }
    for (const id of Object.keys(VERFIJNINGEN)) expect(protomaps).toContain(id);
  });

  it.each(ALLE)("$naam: 3D-gebouwen aan/uit en onder de namen", ({ stijl, drie, st }) => {
    const lagen = lagenVan(st);
    const i = lagen.findIndex((l) => l.id === GEBOUWEN_3D);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(lagen[i]?.layout?.visibility).toBe(drie ? "visible" : "none");
    expect(lagen.slice(0, i).some((l) => l.type === "symbol")).toBe(false);
    if (stijl === "luchtfoto") expect(lagen[0]).toMatchObject({ id: "luchtfoto", type: "raster", source: "luchtfoto" });
  });

  it("wegen hebben een volgorde: snelweg, autoweg, hoofdweg en straat elk anders", () => {
    const st = kaartStijl(ORIGIN, "licht", false);
    const hoofdweg = lagenVan(st).find((l) => l.id === "roads_major");
    const kleur = hoofdweg?.paint?.["line-color"] as unknown[];
    expect(kiesUitMatch(kleur, "trunk")).toBe(ZF_LICHT.wegen.autoweg);
    expect(kiesUitMatch(kleur, "primary")).toBe(ZF_LICHT.wegen.hoofdweg);
    expect(kiesUitMatch(kleur, "tertiary")).toBe(ZF_LICHT.wegen.gebiedsweg);
    expect(ZF_LICHT.smaak.highway).not.toBe(ZF_LICHT.wegen.autoweg);
    expect(ZF_LICHT.wegen.hoofdwegRand).not.toBe(ZF_LICHT.smaak.minor_casing);
  });
});

describe("ZekerFlex Kaart: de kleuren", () => {
  it.each([
    ["licht", ZF_LICHT],
    ["donker", ZF_DONKER],
  ] as const)("%s: alleen gewone #rrggbb-kleuren, en geen merkoranje in de ondergrond", (_naam, k) => {
    const kleuren = JSON.stringify(k).match(/#[0-9a-fA-F]+/g) ?? [];
    expect(kleuren.length).toBeGreaterThan(50);
    for (const c of kleuren) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    // oranje is van onze eigen stippen en routes (ZekerKaart, VolgKaart)
    expect(kleuren.map((c) => c.toUpperCase())).not.toContain("#FF5F1F");
  });

  it.each([
    ["licht", ZF_LICHT],
    ["donker", ZF_DONKER],
  ] as const)("%s: namen zijn goed leesbaar op hun halo", (_naam, k) => {
    const s = k.smaak;
    expect(contrast(s.city_label, s.city_label_halo)).toBeGreaterThanOrEqual(7);
    expect(contrast(k.plaats.dorp, s.city_label_halo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s.roads_label_major, s.roads_label_major_halo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s.roads_label_minor, s.roads_label_minor_halo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(s.ocean_label, s.water)).toBeGreaterThanOrEqual(3);
    // water en land duidelijk uit elkaar
    expect(contrast(s.water, s.earth)).toBeGreaterThanOrEqual(1.3);
  });
});
