import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), bestanden: new Map<string, Buffer>(), teller: 0 }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvAppend: async (k: string, item: unknown, keepLast = 2000) => {
    const arr = (m.kv.has(k) ? (structuredClone(m.kv.get(k)) as unknown[]) : []).concat([item]);
    m.kv.set(k, arr.length > keepLast ? arr.slice(arr.length - keepLast) : arr);
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/local", () => ({
  storeUpload: async (i: { filename: string; bytes: Buffer }) => {
    const id = `up${(m.teller += 1)}`;
    m.bestanden.set(id, i.bytes);
    return { id, filename: i.filename, mimeType: "application/pdf", sizeBytes: i.bytes.length, sha256: "x", storageKey: id };
  },
  readUpload: async (id: string) => {
    const b = m.bestanden.get(id);
    if (!b) throw new Error("weg");
    return { bytes: b, filename: "x.pdf", mimeType: "application/pdf" };
  },
  deleteUpload: async (id: string) => void m.bestanden.delete(id),
}));

import { documentenVan, leesDocumentBestand, verwijderDocument, voegDocumentToe } from "@/lib/horeca-personeel/documenten";
import { exportVoorMedewerker } from "@/lib/horeca-personeel/export";
import { voegLoonstrookToe } from "@/lib/horeca-personeel/loonstroken";
import { wisPersoneelBestanden } from "@/lib/horeca-personeel/opruimen";
import { euroTekst, legePlanning, verdeelFooi } from "@/lib/horeca-personeel/planning";
import { bewaarFooi, bewaarUur, leesPlanningVan, meldNietBeschikbaar } from "@/lib/horeca-personeel/planning-store";
import { planningVoorMedewerker } from "@/lib/horeca-personeel/planning-view";
import { plaatsBericht } from "@/lib/horeca-personeel/chat";
import { bewaarDashboard, koppelAccount, leesPersoneelVan, markeerGelezen, nodigUit, plaatsMededeling } from "@/lib/horeca-personeel/store";

const T = "tenantAAAA1";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");

async function team() {
  await bewaarDashboard(T, { naam: "Zaal", blokken: ["taken"] });
  const a = await nodigUit(T, "Zaak", { naam: "Piet", email: "piet@voorbeeld.test", functie: "", dashboardId: "d1" });
  const b = await nodigUit(T, "Zaak", { naam: "Els", email: "els@voorbeeld.test", functie: "", dashboardId: "d1" });
  await koppelAccount(T, a.medewerker.id, "u1");
  await koppelAccount(T, b.medewerker.id, "u2");
  return { a: a.medewerker.id, b: b.medewerker.id };
}

beforeEach(() => {
  m.kv.clear();
  m.bestanden.clear();
});

describe("fooi verdelen", () => {
  const uur = (id: string, datum: string, uit: string | null) => ({ id: `${id}${datum}`, medewerkerId: id, datum, in: "09:00", uit, bron: "klok" as const });

  it("verdeelt naar gewerkte minuten en de som is altijd precies het totaal", () => {
    const p = legePlanning();
    p.uren.push(uur("a", "2026-11-02", "17:00"), uur("b", "2026-11-02", "13:00"), uur("c", "2026-11-03", "12:00"));
    // 8 u, 4 u en 3 u: totaal 15 u
    for (const totaal of [1, 7, 100, 12345, 99_999]) {
      const v = verdeelFooi(p, "2026-11-01", "2026-11-30", totaal);
      expect(v.reduce((s, x) => s + x.cent, 0)).toBe(totaal);
    }
    const v = verdeelFooi(p, "2026-11-01", "2026-11-30", 15_000);
    expect(Object.fromEntries(v.map((x) => [x.medewerkerId, x.cent]))).toEqual({ a: 8000, b: 4000, c: 3000 });
  });

  it("alleen afgeronde regels in de periode tellen; zonder uren is er niets te verdelen", () => {
    const p = legePlanning();
    p.uren.push(uur("a", "2026-11-02", null), uur("b", "2026-10-31", "17:00"));
    expect(verdeelFooi(p, "2026-11-01", "2026-11-30", 1000)).toEqual([]);
    expect(verdeelFooi(p, "2026-11-01", "2026-11-30", 0)).toEqual([]);
  });

  it("een bedrag als tekst met een komma", () => {
    expect(euroTekst(1250)).toBe("12,50");
    expect(euroTekst(5)).toBe("0,05");
  });

  it("de verdeling ligt vast op het moment van maken en de medewerker ziet alleen zijn eigen deel", async () => {
    const { a, b } = await team();
    await bewaarUur(T, { medewerkerId: a, datum: "2026-11-02", in: "09:00", uit: "17:00" });
    await bewaarUur(T, { medewerkerId: b, datum: "2026-11-02", in: "09:00", uit: "13:00" });
    await expect(bewaarFooi(T, { van: "2026-12-01", tot: "2026-12-31", totaalCent: 1000, notitie: "" })).rejects.toThrow(/geen uren/);
    const p = await bewaarFooi(T, { van: "2026-11-01", tot: "2026-11-30", totaalCent: 3000, notitie: "oktober-pot" });
    expect(p.fooien[0]?.verdeling.find((x) => x.medewerkerId === a)?.cent).toBe(2000);
    // later extra uren veranderen de verdeling niet
    await bewaarUur(T, { medewerkerId: b, datum: "2026-11-03", in: "09:00", uit: "20:00" });
    expect((await leesPlanningVan(T)).fooien[0]?.verdeling.find((x) => x.medewerkerId === a)?.cent).toBe(2000);
    const d = await leesPersoneelVan(T);
    const v = planningVoorMedewerker(await leesPlanningVan(T), d, a, "2026-11-15");
    expect(v.fooien).toEqual([{ id: expect.any(String), van: "2026-11-01", tot: "2026-11-30", cent: 2000, totaalCent: 3000, notitie: "oktober-pot" }]);
  });
});

describe("documenten", () => {
  it("een document voor iedereen en een voor één medewerker; een medewerker ziet het document van een collega niet", async () => {
    const { a, b } = await team();
    const voorAllen = await voegDocumentToe(T, { medewerkerId: null, soort: "huisregels", titel: "Huisregels", bestandsnaam: "h.pdf", bytes: PDF, door: "x" });
    const voorPiet = await voegDocumentToe(T, { medewerkerId: a, soort: "contract", titel: "Contract Piet", bestandsnaam: "c.pdf", bytes: PDF, door: "x" });
    expect((await documentenVan(T, a)).map((d) => d.titel).sort()).toEqual(["Contract Piet", "Huisregels"]);
    expect((await documentenVan(T, b)).map((d) => d.titel)).toEqual(["Huisregels"]);
    expect((await documentenVan(T)).length).toBe(2);
    expect((await leesDocumentBestand(T, voorAllen.id, b)).bestand).toBe("h.pdf");
    await expect(leesDocumentBestand(T, voorPiet.id, b)).rejects.toThrow(/bestaat niet/);
    await expect(leesDocumentBestand("tenantBBBB2", voorPiet.id)).rejects.toThrow(/bestaat niet/);
  });

  it("weigert wat geen pdf is, geen titel heeft, een onbekende soort of een onbekende medewerker; verwijderen wist het bestand", async () => {
    const { a } = await team();
    const basis = { medewerkerId: a, soort: "contract", titel: "T", bestandsnaam: "x.pdf", bytes: PDF, door: "x" };
    await expect(voegDocumentToe(T, { ...basis, bytes: Buffer.from("<script>") })).rejects.toThrow(/niet herkend/);
    await expect(voegDocumentToe(T, { ...basis, titel: " " })).rejects.toThrow(/titel/);
    await expect(voegDocumentToe(T, { ...basis, soort: "iets" })).rejects.toThrow(/soort/);
    await expect(voegDocumentToe(T, { ...basis, medewerkerId: "nee" })).rejects.toThrow(/niet in je lijst/);
    expect(m.bestanden.size).toBe(0);
    const d = await voegDocumentToe(T, basis);
    expect(m.bestanden.size).toBe(1);
    await verwijderDocument(T, d.id);
    expect(m.bestanden.size).toBe(0);
  });
});

describe("opruimen en export", () => {
  it("een bedrijf wissen haalt ook de pdf-bestanden weg, en rommel in de opslag geeft geen fout", async () => {
    const { a } = await team();
    await voegLoonstrookToe(T, { medewerkerId: a, periode: "oktober 2026", bestandsnaam: "l.pdf", bytes: PDF, door: "x" });
    await voegDocumentToe(T, { medewerkerId: null, soort: "overig", titel: "Iets", bestandsnaam: "d.pdf", bytes: PDF, door: "x" });
    expect(m.bestanden.size).toBe(2);
    expect(await wisPersoneelBestanden(T)).toBe(2);
    expect(m.bestanden.size).toBe(0);
    m.kv.set(`horeca:documenten:tenantBBBB2`, { rommel: true });
    expect(await wisPersoneelBestanden("tenantBBBB2")).toBe(0);
    expect(await wisPersoneelBestanden("tenantCCCC3")).toBe(0);
  });

  it("de export bevat alleen de eigen gegevens van de medewerker", async () => {
    const { a, b } = await team();
    await meldNietBeschikbaar(T, a, { datum: "2026-11-19", notitie: "mijn reden" });
    await meldNietBeschikbaar(T, b, { datum: "2026-11-20", notitie: "geheim van Els" });
    await bewaarUur(T, { medewerkerId: b, datum: "2026-11-02", in: "09:00", uit: "17:00" });
    await plaatsBericht(T, "team", { id: a, naam: "Piet" }, "van Piet");
    await plaatsBericht(T, "team", { id: b, naam: "Els" }, "van Els");
    const md = await plaatsMededeling(T, { tekst: "mededeling", dashboardIds: [] });
    await markeerGelezen(T, a, [md.mededelingen[0]!.id]);
    const e = await exportVoorMedewerker(T, a);
    const tekst = JSON.stringify(e);
    expect(tekst).toContain("mijn reden");
    expect(tekst).toContain("van Piet");
    expect(tekst).not.toContain("geheim van Els");
    expect(tekst).not.toContain("van Els");
    expect((e.uren as unknown[]).length).toBe(0);
    expect((e.gelezenMededelingen as unknown[]).length).toBe(1);
    expect((e.medewerker as { email: string }).email).toBe("piet@voorbeeld.test");
  });
});
