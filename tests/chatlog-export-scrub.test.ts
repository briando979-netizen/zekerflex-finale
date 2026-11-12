import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Vervolg op het privacygat in de leerlijsten (lib/learn/store.ts): (1) inzage (AVG art. 15): de eigen vragen van een gebruiker in
// de export; (2) eenmalig opschonen van wat vóór de scrub al bewaard was, eerst droog tellen (alleen aantallen), dan schrijven.

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (kv.has(k) ? structuredClone(kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  kvAppend: async (k: string, item: unknown, keepLast = 2000) => {
    const arr = ((kv.get(k) as unknown[] | undefined) ?? []).slice();
    arr.push(structuredClone(item));
    kv.set(k, arr.length > keepLast ? arr.slice(arr.length - keepLast) : arr);
  },
}));
vi.mock("@/lib/internal-auth", () => ({
  checkInternalToken: (r: Request) => (r.headers.get("x-internal-token") === "geheim" ? { ok: true } : { ok: false, status: 401, message: "Niet toegestaan" }),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { exportChatlogVan, scrubBestaandeChatlog } from "@/lib/learn/store";
import { soortenPersoonsgegevens } from "@/lib/learn/schoon";
import { POST } from "@/app/api/internal/privacy/chatlog-scrub/route";

const ROOT = process.cwd();
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const rec = (id: string, q: string, a: string, over: Record<string, unknown> = {}) => ({ id, at: "2026-11-01T10:00:00.000Z", q, a, ...over });

/** Een lijst zoals die vóór de scrub bestond: ruwe vragen met allerlei persoonsgegevens. */
function oudeLijsten() {
  kv.set("learn-log:public", [
    rec("p1", "Hoe werkt uitbetaling?", "Via je IBAN."),
    rec("p2", "Mail me op jan@x.nl", "ok"),
    rec("p3", "Bel 06 12345678 en jan@y.nl", "Genoteerd"),
    rec("p4", "Mijn IBAN is NL91 ABNA 0417 1643 00", "Dank"),
  ]);
  kv.set("learn-log:jarvis", [rec("j1", "wat is mijn BSN 123456782?", "Dat staat niet in het systeem", { userId: "u1" }), rec("j2", "geen gegevens", "nee", { userId: "u2" })]);
  kv.set("learn-log:brain", []);
}

beforeEach(() => kv.clear());

describe("export (AVG art. 15): de eigen vragen van een gebruiker", () => {
  it("alleen de vragen en antwoorden van deze gebruiker, met hun beoordeling; niets van een ander", async () => {
    kv.set("learn-log:jarvis", [rec("j1", "mijn vraag", "antwoord", { userId: "u1" }), rec("j2", "vraag van een ander", "geheim antwoord", { userId: "u2" })]);
    kv.set("learn-log:brain", [rec("b1", "brain vraag", "brain antwoord", { userId: "u1" })]);
    kv.set("learn-log:public", [rec("p1", "anoniem", "x")]);
    kv.set("learn-rated:jarvis", [{ id: "j1", up: true, at: "2026-11-01T11:00:00.000Z" }, { id: "j2", up: false, at: "2026-11-01T11:00:00.000Z" }]);
    const uit = await exportChatlogVan("u1");
    expect(uit.map((r) => [r.assistent, r.vraag, r.beoordeling])).toEqual([
      ["jarvis", "mijn vraag", "goed"],
      ["brain", "brain vraag", null],
    ]);
    expect(JSON.stringify(uit)).not.toMatch(/ander|geheim antwoord|anoniem|"userId"|u2/);
  });

  it("een gebruiker zonder vragen geeft een lege lijst, en de export neemt de sectie op", async () => {
    expect(await exportChatlogVan("niemand")).toEqual([]);
    const src = bron("lib/privacy/export.ts");
    expect(src).toContain('sections.assistentChat = await safe("assistentChat", () => exportChatlogVan(userId))');
  });
});

describe("eenmalig opschonen van de bestaande lijsten", () => {
  it("de herkenning geeft alleen ja/nee per soort", () => {
    expect(soortenPersoonsgegevens("jan@x.nl en 06 12345678")).toEqual({ mail: true, iban: false, tel: true, bsn: false });
    expect(soortenPersoonsgegevens("gewone vraag over uitbetaling")).toEqual({ mail: false, iban: false, tel: false, bsn: false });
    expect(soortenPersoonsgegevens("mijn BSN 123456782")).toMatchObject({ bsn: true });
  });

  it("droge telling: telt per soort, schrijft niets en toont geen inhoud", async () => {
    oudeLijsten();
    const voor = JSON.stringify([...kv.entries()]);
    const t = await scrubBestaandeChatlog(true);
    expect(t).toEqual({ regels: 6, metPersoonsgegevens: 4, perSoort: { mail: 2, tel: 1, iban: 1, bsn: 1 }, herschreven: 0 });
    expect(JSON.stringify([...kv.entries()])).toBe(voor);
    expect(JSON.stringify(t)).not.toMatch(/jan@|0612|NL91|123456782/);
  });

  it("schrijven: alleen de regels met persoonsgegevens worden herschreven, de rest blijft byte voor byte gelijk, ook id, tijd en userId", async () => {
    oudeLijsten();
    const t = await scrubBestaandeChatlog(false);
    expect(t.herschreven).toBe(4);
    const pub = kv.get("learn-log:public") as { id: string; q: string; a: string; at: string }[];
    expect(pub[0]).toEqual(rec("p1", "Hoe werkt uitbetaling?", "Via je IBAN."));
    expect(pub[1]!.q).toBe("Mail me op [e-mailadres]");
    expect(pub[2]!.q).toBe("Bel [telefoonnummer] en [e-mailadres]");
    expect(pub[3]!.q).toBe("Mijn IBAN is [rekeningnummer]");
    expect(pub.map((r) => r.id)).toEqual(["p1", "p2", "p3", "p4"]);
    const jarvis = kv.get("learn-log:jarvis") as { userId: string; q: string; at: string }[];
    expect(jarvis[0]).toMatchObject({ userId: "u1", q: "wat is mijn [BSN]?", at: "2026-11-01T10:00:00.000Z" });
    expect(jarvis[1]).toEqual(rec("j2", "geen gegevens", "nee", { userId: "u2" }));
    expect(JSON.stringify([...kv.values()])).not.toMatch(/jan@|0612|NL91|123456782/);
  });

  it("idempotent: een tweede keer vindt niets meer en verandert niets", async () => {
    oudeLijsten();
    await scrubBestaandeChatlog(false);
    const na = JSON.stringify([...kv.entries()]);
    const tweede = await scrubBestaandeChatlog(false);
    expect(tweede.metPersoonsgegevens).toBe(0);
    expect(tweede.herschreven).toBe(0);
    expect(JSON.stringify([...kv.entries()])).toBe(na);
  });

  it("lege lijsten en ontbrekende sleutels geven nullen", async () => {
    expect(await scrubBestaandeChatlog(true)).toEqual({ regels: 0, metPersoonsgegevens: 0, perSoort: { mail: 0, tel: 0, iban: 0, bsn: 0 }, herschreven: 0 });
  });
});

describe("POST /api/internal/privacy/chatlog-scrub", () => {
  const post = (url: string, token?: string) => POST(new Request(`http://app:3000${url}`, { method: "POST", ...(token ? { headers: { "x-internal-token": token } } : {}) }));

  it("zonder geheim 401 (nooit 403), en er gebeurt niets", async () => {
    oudeLijsten();
    const voor = JSON.stringify([...kv.entries()]);
    const res = await post("/api/internal/privacy/chatlog-scrub?schrijf=1");
    expect(res.status).toBe(401);
    expect(JSON.stringify([...kv.entries()])).toBe(voor);
  });

  it("standaard een droge telling: alleen aantallen in het antwoord, niets geschreven", async () => {
    oudeLijsten();
    const voor = JSON.stringify([...kv.entries()]);
    const res = await post("/api/internal/privacy/chatlog-scrub", "geheim");
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d).toMatchObject({ modus: "droog", regels: 6, metPersoonsgegevens: 4, herschreven: 0 });
    expect(JSON.stringify(d)).not.toMatch(/jan@|0612|NL91|123456782|uitbetaling/);
    expect(JSON.stringify([...kv.entries()])).toBe(voor);
  });

  it("alleen met ?schrijf=1 wordt geschreven", async () => {
    oudeLijsten();
    const d = await (await post("/api/internal/privacy/chatlog-scrub?schrijf=1", "geheim")).json();
    expect(d).toMatchObject({ modus: "geschreven", herschreven: 4 });
    expect(JSON.stringify([...kv.values()])).not.toMatch(/jan@|0612|NL91|123456782/);
  });

  it("de route staat onder /api/internal (eigen geheim) en logt geen inhoud", () => {
    expect(bron("lib/auth/public-routes.ts")).toContain('"/api/internal"');
    const s = bron("app/api/internal/privacy/chatlog-scrub/route.ts");
    expect(s).toContain("checkInternalToken(request)");
    expect(s).not.toMatch(/logger\.\w+\([^)]*\b(q|a|vraag|antwoord)\b/);
  });
});
