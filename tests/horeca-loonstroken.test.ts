import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ kv: new Map<string, unknown>(), bestanden: new Map<string, { bytes: Buffer; filename: string }>(), teller: 0 }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/local", () => ({
  storeUpload: async (i: { filename: string; bytes: Buffer }) => {
    const id = `up${(m.teller += 1)}`;
    m.bestanden.set(id, { bytes: i.bytes, filename: i.filename });
    return { id, filename: i.filename, mimeType: "application/pdf", sizeBytes: i.bytes.length, sha256: "x", storageKey: id };
  },
  readUpload: async (id: string) => {
    const f = m.bestanden.get(id);
    if (!f) throw new Error("weg");
    return { bytes: f.bytes, filename: f.filename, mimeType: "application/pdf" };
  },
  deleteUpload: async (id: string) => void m.bestanden.delete(id),
}));

import { MAX_LOONSTROOK_BYTES, leesLoonstrookBestand, loonstrokenVan, pdfAntwoord, verwijderLoonstrook, voegLoonstrookToe } from "@/lib/horeca-personeel/loonstroken";
import { bewaarDashboard, koppelAccount, nodigUit } from "@/lib/horeca-personeel/store";

// Loonstroken van het eigen personeel: alleen een pdf, alleen voor een medewerker van deze zaak, en een medewerker leest alleen
// zijn eigen strook.

const T = "tenantAAAA1";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");

async function twee() {
  await bewaarDashboard(T, { naam: "Zaal", blokken: ["taken", "loonstroken"] });
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

describe("loonstroken", () => {
  it("bewaart een pdf met periode en geeft hem terug, nieuwste eerst", async () => {
    const { a } = await twee();
    await voegLoonstrookToe(T, { medewerkerId: a, periode: " oktober 2026 ", bestandsnaam: "okt.pdf", bytes: PDF, door: "beheerder" }, new Date("2026-11-01T10:00:00Z"));
    await voegLoonstrookToe(T, { medewerkerId: a, periode: "november 2026", bestandsnaam: "nov.pdf", bytes: PDF, door: "beheerder" }, new Date("2026-12-01T10:00:00Z"));
    const lijst = await loonstrokenVan(T, a);
    expect(lijst.map((l) => l.periode)).toEqual(["november 2026", "oktober 2026"]);
  });

  it("weigert wat geen pdf is, te groot is, geen periode heeft of bij een onbekende medewerker hoort", async () => {
    const { a } = await twee();
    const basis = { medewerkerId: a, periode: "oktober 2026", bestandsnaam: "x.pdf", bytes: PDF, door: "b" };
    await expect(voegLoonstrookToe(T, { ...basis, bytes: Buffer.from("<html><script>alert(1)</script></html>") })).rejects.toThrow(/niet herkend/);
    await expect(voegLoonstrookToe(T, { ...basis, bytes: Buffer.alloc(MAX_LOONSTROOK_BYTES + 1, 1) })).rejects.toThrow(/te groot/);
    await expect(voegLoonstrookToe(T, { ...basis, bytes: Buffer.alloc(0) })).rejects.toThrow(/pdf/);
    await expect(voegLoonstrookToe(T, { ...basis, periode: "  " })).rejects.toThrow(/periode/);
    await expect(voegLoonstrookToe(T, { ...basis, medewerkerId: "bestaatniet" })).rejects.toThrow(/niet in je lijst/);
    expect(m.bestanden.size).toBe(0);
  });

  it("een medewerker leest alleen zijn eigen strook; een strook van een collega bestaat voor hem niet", async () => {
    const { a, b } = await twee();
    const l = await voegLoonstrookToe(T, { medewerkerId: a, periode: "oktober 2026", bestandsnaam: "okt.pdf", bytes: PDF, door: "b" });
    expect((await leesLoonstrookBestand(T, l.id, a)).bestand).toBe("okt.pdf");
    await expect(leesLoonstrookBestand(T, l.id, b)).rejects.toThrow(/bestaat niet/);
    // de beheerder (zonder medewerkerId) mag elke strook van zijn bedrijf lezen, een ander bedrijf niet
    expect((await leesLoonstrookBestand(T, l.id)).bytes.length).toBe(PDF.length);
    await expect(leesLoonstrookBestand("tenantBBBB2", l.id)).rejects.toThrow(/bestaat niet/);
  });

  it("verwijderen haalt ook het bestand weg", async () => {
    const { a } = await twee();
    const l = await voegLoonstrookToe(T, { medewerkerId: a, periode: "oktober 2026", bestandsnaam: "okt.pdf", bytes: PDF, door: "b" });
    expect(m.bestanden.size).toBe(1);
    await verwijderLoonstrook(T, l.id);
    expect(m.bestanden.size).toBe(0);
    expect(await loonstrokenVan(T, a)).toEqual([]);
    await verwijderLoonstrook(T, l.id); // een tweede keer doet niets
  });

  it("het antwoord is een pdf-download die nooit in de cache komt en geen naam met rare tekens heeft", () => {
    const r = pdfAntwoord(PDF, 'ok"t\r\nX-Evil: 1.pdf');
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
    expect(r.headers.get("content-disposition")).not.toContain('"t');
  });
});
