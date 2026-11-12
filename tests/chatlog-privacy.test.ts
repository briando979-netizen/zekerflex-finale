import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Privacygat (12 nov 2026): lib/learn/store.ts bewaarde elke vraag en elk antwoord van de assistenten in gedeelde KV-lijsten,
// alleen begrensd op aantal, met userId bij een ingelogde gebruiker. Nu: persoonsgegevens eruit vóór het bewaren, 90 dagen
// bewaartermijn in de sweep (met droge telling) en AVG-wissen per gebruiker, ook van de beoordelingen.

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

import { schoonPersoonsgegevens, WEG } from "@/lib/learn/schoon";
import { CHATLOG_DAGEN, logExchange, rateExchange, ruimChatlogOp, topExamples, wisChatlogVan } from "@/lib/learn/store";
import { RETENTION_RULES, retentionRule } from "@/lib/privacy/retention";

const ROOT = process.cwd();
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");
const DAG = 24 * 60 * 60 * 1000;
const NU = new Date("2026-11-12T10:00:00+01:00");

beforeEach(() => kv.clear());

describe("scrub vóór het opslaan", () => {
  it("e-mailadressen weg", () => {
    expect(schoonPersoonsgegevens("Mail me op jan.de-vries+zf@bedrijf.nl graag")).toBe(`Mail me op ${WEG.mail} graag`);
  });

  it("telefoonnummers weg, in de gangbare Nederlandse schrijfwijzen", () => {
    for (const nr of ["06 12345678", "06-12345678", "0612345678", "06 1234 5678", "020 1234567", "+31 6 12345678", "+31612345678", "0031 6 12345678", "+48 512 345 678"]) {
      const uit = schoonPersoonsgegevens(`Bel mij op ${nr} morgen`);
      expect(uit, nr).toBe(`Bel mij op ${WEG.tel} morgen`);
    }
  });

  it("rekeningnummer en BSN weg", () => {
    expect(schoonPersoonsgegevens("Mijn IBAN is NL91 ABNA 0417 1643 00, dank")).toBe(`Mijn IBAN is ${WEG.iban}, dank`);
    expect(schoonPersoonsgegevens("rekening NL91ABNA0417164300")).toBe(`rekening ${WEG.iban}`);
    expect(schoonPersoonsgegevens("mijn BSN is 123456782")).toBe(`mijn ${WEG.bsn}`);
  });

  it("gewone cijfers blijven staan: prijs, datum, KVK-nummer, postcode, uren", () => {
    const zin = "De fee is € 3,50 per uur, ik begin op 2026-11-12 om 09:00, KVK 12345678, postcode 1234 AB, 8 uur.";
    expect(schoonPersoonsgegevens(zin)).toBe(zin);
  });

  it("een vraag zonder persoonsgegevens verandert niet", () => {
    const zin = "Hoe werkt de uitbetaling bij uitzenden?";
    expect(schoonPersoonsgegevens(zin)).toBe(zin);
  });
});

describe("logExchange bewaart de gezuiverde tekst", () => {
  it("vraag én antwoord zonder e-mail, telefoon of IBAN, ook voor een ingelogde gebruiker", async () => {
    await logExchange("public", { q: "Ik ben jan@x.nl, bel 0612345678", a: "Ik stuur het naar jan@x.nl; rekening NL91ABNA0417164300" });
    await logExchange("jarvis", { q: "Mail piet@y.nl", a: "ok", userId: "u1" });
    const pub = kv.get("learn-log:public") as { q: string; a: string }[];
    expect(JSON.stringify(pub)).not.toMatch(/jan@x\.nl|0612345678|NL91ABNA/);
    expect(pub[0]!.q).toContain(WEG.mail);
    expect(pub[0]!.q).toContain(WEG.tel);
    const jarvis = kv.get("learn-log:jarvis") as { q: string; userId: string }[];
    expect(jarvis[0]!.q).toBe(`Mail ${WEG.mail}`);
    expect(jarvis[0]!.userId).toBe("u1");
  });
});

describe("AVG-wissen: de vragen van een gebruiker en hun beoordelingen", () => {
  it("haalt alleen de regels van deze gebruiker uit learn-log:* en hun beoordelingen uit learn-rated:*", async () => {
    const a1 = await logExchange("jarvis", { q: "vraag van u1", a: "antwoord", userId: "u1" });
    const a2 = await logExchange("jarvis", { q: "vraag van u2", a: "antwoord", userId: "u2" });
    const b1 = await logExchange("brain", { q: "brain u1", a: "x", userId: "u1" });
    const p = await logExchange("public", { q: "anoniem", a: "x" });
    await rateExchange("jarvis", a1, true);
    await rateExchange("jarvis", a2, true);
    await rateExchange("brain", b1, false);
    await rateExchange("public", p, true);

    expect(await wisChatlogVan("u1")).toBe(2);

    const jarvis = kv.get("learn-log:jarvis") as { id: string; userId?: string }[];
    expect(jarvis.map((e) => e.id)).toEqual([a2]);
    expect((kv.get("learn-log:brain") as unknown[]).length).toBe(0);
    expect((kv.get("learn-log:public") as unknown[]).length).toBe(1);
    expect((kv.get("learn-rated:jarvis") as { id: string }[]).map((r) => r.id)).toEqual([a2]);
    expect((kv.get("learn-rated:brain") as unknown[]).length).toBe(0);
    expect((kv.get("learn-rated:public") as { id: string }[]).map((r) => r.id)).toEqual([p]);
    expect(JSON.stringify([...kv.values()])).not.toContain("u1");
  });

  it("een gebruiker zonder vragen: niets aangeraakt, 0 teruggegeven; en een tweede keer is een no-op", async () => {
    await logExchange("jarvis", { q: "a", a: "b", userId: "u2" });
    const voor = JSON.stringify([...kv.entries()]);
    expect(await wisChatlogVan("u1")).toBe(0);
    expect(JSON.stringify([...kv.entries()])).toBe(voor);
    await logExchange("jarvis", { q: "c", a: "d", userId: "u1" });
    expect(await wisChatlogVan("u1")).toBe(1);
    expect(await wisChatlogVan("u1")).toBe(0);
  });

  it("een gewiste vraag komt niet meer terug als voorbeeld voor een andere gebruiker", async () => {
    const id = await logExchange("jarvis", { q: "geheime vraag", a: "antwoord", userId: "u1" });
    await rateExchange("jarvis", id, true);
    expect((await topExamples("jarvis")).length).toBe(1);
    await wisChatlogVan("u1");
    expect(await topExamples("jarvis")).toEqual([]);
  });

  it("anonymizeUser roept het wissen aan (best effort) en meldt het aantal onder 'chatlog'", () => {
    const s = bron("lib/privacy/anonymize.ts");
    expect(s).toContain('import { wisChatlogVan } from "@/lib/learn/store"');
    expect(s).toContain("await wisChatlogVan(userId)");
    expect(s).toContain("cleared.chatlog = n");
    expect(s).toMatch(/wisChatlogVan\(userId\)[\s\S]{0,300}\.catch\(/);
  });
});

describe("bewaartermijn van 90 dagen", () => {
  const rec = (id: string, dagenGeleden: number, over: Record<string, unknown> = {}) => ({ id, at: new Date(NU.getTime() - dagenGeleden * DAG).toISOString(), q: "v", a: "a", ...over });

  it("de termijn is 90 dagen en staat als regel in het retentieschema (delete, geen wettelijke plicht)", () => {
    expect(CHATLOG_DAGEN).toBe(90);
    const r = retentionRule("chatlog")!;
    expect(r.days).toBe(90);
    expect(r.onExpiry).toBe("delete");
    expect(r.blocksErasure).toBe(false);
    expect(RETENTION_RULES.filter((x) => x.key === "chatlog").length).toBe(1);
  });

  it("verwijdert vragen en beoordelingen ouder dan 90 dagen en laat de rest staan", async () => {
    kv.set("learn-log:public", [rec("oud", 91), rec("grens", 89), rec("nieuw", 1)]);
    kv.set("learn-log:jarvis", [rec("j-oud", 200, { userId: "u1" })]);
    kv.set("learn-rated:public", [{ id: "oud", up: true, at: rec("x", 120).at }, { id: "nieuw", up: true, at: rec("x", 2).at }]);
    expect(await ruimChatlogOp(NU, false)).toBe(3);
    expect((kv.get("learn-log:public") as { id: string }[]).map((e) => e.id)).toEqual(["grens", "nieuw"]);
    expect((kv.get("learn-log:jarvis") as unknown[]).length).toBe(0);
    expect((kv.get("learn-rated:public") as { id: string }[]).map((e) => e.id)).toEqual(["nieuw"]);
    expect(await ruimChatlogOp(NU, false)).toBe(0);
  });

  it("droge telling: telt wat zou verdwijnen en raakt niets aan", async () => {
    kv.set("learn-log:brain", [rec("a", 100), rec("b", 5)]);
    const voor = JSON.stringify([...kv.entries()]);
    expect(await ruimChatlogOp(NU, true)).toBe(1);
    expect(JSON.stringify([...kv.entries()])).toBe(voor);
  });

  it("een regel zonder geldige tijd telt als verlopen", async () => {
    kv.set("learn-log:public", [{ id: "zonder", q: "v", a: "a" }, { id: "kapot", at: "geen datum", q: "v", a: "a" }, rec("ok", 1)]);
    expect(await ruimChatlogOp(NU, false)).toBe(2);
    expect((kv.get("learn-log:public") as { id: string }[]).map((e) => e.id)).toEqual(["ok"]);
  });

  it("de nachtelijke sweep heeft een eigen blok voor de chatlog (en hij valt niet om bij een storing)", () => {
    const s = bron("lib/privacy/sweep.ts");
    expect(s).toContain("cleared.chatlog = await ruimChatlogOp(now, dryRun)");
    expect(s).toMatch(/ruimChatlogOp\(now, dryRun\)\.catch\(/);
  });
});
