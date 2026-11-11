import { beforeEach, describe, expect, it, vi } from "vitest";

// De opslag draait in dit bestand op een gewone Map: dezelfde functies als lib/storage/kv, zonder database.
const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
  kvListValues: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v)),
  kvListEntries: async (p: string, limit: number) => [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) })),
}));

import {
  aantalTeSchonen,
  bewerkKamer,
  boekingenInPeriode,
  leesBoeking,
  leesBoekingen,
  leesKamer,
  leesKamers,
  maakBoeking,
  maakKamer,
  schoonNaBewaartermijn,
  verwijderKamer,
  wijzigBoeking,
  wisGast,
  zetArchief,
  zetSchoon,
  zetStatus,
  zoekVrijeKamers,
} from "@/lib/kamers/store";

const NU = new Date("2026-11-12T06:00:00Z");
const fout = async (p: Promise<unknown>): Promise<{ status: number; message: string }> => {
  try {
    await p;
  } catch (e) {
    return e as { status: number; message: string };
  }
  return { status: 0, message: "" };
};

const kamerInv = (over: Record<string, unknown> = {}) => ({ naam: "1", type: "Tweepersoonskamer", capaciteit: 2, prijsCent: 10_000, ...over });
const boekInv = (kamerId: string, aankomst: string, vertrek: string, over: Record<string, unknown> = {}) => ({ kamerId, aankomst, vertrek, naam: "Jansen", telefoon: "0612345678", email: "j@test.example", personen: 2, opmerking: "hond", ...over });

beforeEach(() => m.kv.clear());

describe("kamers", () => {
  it("maakt een kamer die schoon en actief begint, gesorteerd op nummer", async () => {
    const a = await maakKamer("t1", kamerInv({ naam: "10" }), NU);
    await maakKamer("t1", kamerInv({ naam: "2" }), NU);
    expect(a).toMatchObject({ naam: "10", schoon: "schoon", gearchiveerd: false, capaciteit: 2 });
    expect((await leesKamers("t1")).map((k) => k.naam)).toEqual(["2", "10"]);
  });
  it("een naam is uniek per organisatie, ook zonder hoofdletters en met een gearchiveerde", async () => {
    const a = await maakKamer("t1", kamerInv({ naam: "Suite A" }), NU);
    expect((await fout(maakKamer("t1", kamerInv({ naam: "suite a" }), NU))).status).toBe(409);
    await zetArchief("t1", a.id, true, NU);
    expect((await fout(maakKamer("t1", kamerInv({ naam: "SUITE A" }), NU))).status).toBe(409);
    await maakKamer("t2", kamerInv({ naam: "Suite A" }), NU); // andere organisatie mag
  });
  it("ongeldige invoer geeft 422 met een Nederlandse tekst", async () => {
    const f = await fout(maakKamer("t1", kamerInv({ capaciteit: 99 }), NU));
    expect(f.status).toBe(422);
    expect(f.message).toMatch(/capaciteit/);
    expect((await fout(maakKamer("t1", null, NU))).status).toBe(422);
  });
  it("een andere organisatie ziet de kamer niet en kan hem niet wijzigen", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    expect(await leesKamers("t2")).toEqual([]);
    expect(await leesKamer("t2", a.id)).toBeNull();
    expect((await fout(bewerkKamer("t2", a.id, kamerInv(), NU))).status).toBe(404);
    expect((await fout(zetSchoon("t2", a.id, "vuil", NU))).status).toBe(404);
    expect((await fout(zetArchief("t2", a.id, true, NU))).status).toBe(404);
  });
  it("een ongeldig id is een kamer die niet bestaat", async () => {
    expect(await leesKamer("t1", "constructor")).toBeNull();
    expect(await leesKamer("t1", "../x")).toBeNull();
    expect((await fout(zetSchoon("t1", "constructor", "vuil", NU))).status).toBe(404);
  });
  it("de schoonmaakstatus wijzigt", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    expect((await zetSchoon("t1", a.id, "in-schoonmaak", NU)).schoon).toBe("in-schoonmaak");
    expect((await leesKamer("t1", a.id))?.schoon).toBe("in-schoonmaak");
  });
  it("bewerken houdt de naam uniek en verlaagt de capaciteit niet onder een toekomstige boeking", async () => {
    const a = await maakKamer("t1", kamerInv({ naam: "1" }), NU);
    await maakKamer("t1", kamerInv({ naam: "2" }), NU);
    expect((await fout(bewerkKamer("t1", a.id, kamerInv({ naam: "2" }), NU))).status).toBe(409);
    expect((await bewerkKamer("t1", a.id, kamerInv({ naam: "1", type: "Suite", prijsCent: null }), NU)).type).toBe("Suite");
    await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03", { personen: 2 }), NU);
    const f = await fout(bewerkKamer("t1", a.id, kamerInv({ capaciteit: 1 }), NU));
    expect(f.status).toBe(409);
    expect(f.message).toMatch(/K-2026-0001/);
  });
  it("een kamer met een toekomstige boeking is niet te archiveren, een kamer met een afgelopen boeking wel", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const b = await maakBoeking("t1", boekInv(a.id, "2026-11-20", "2026-11-22"), NU);
    const f = await fout(zetArchief("t1", a.id, true, NU));
    expect(f.status).toBe(409);
    expect(f.message).toMatch(/K-2026-0001/);
    expect(f.message).toMatch(/Annuleer of verplaats/);
    await zetStatus("t1", b.id, "geannuleerd", NU);
    expect((await zetArchief("t1", a.id, true, NU)).gearchiveerd).toBe(true);
    expect((await zetArchief("t1", a.id, false, NU)).gearchiveerd).toBe(false);
    // een afgelopen verblijf blokkeert niets
    const c = await maakKamer("t1", kamerInv({ naam: "2" }), NU);
    await maakBoeking("t1", boekInv(c.id, "2026-11-01", "2026-11-05"), NU);
    expect((await zetArchief("t1", c.id, true, NU)).gearchiveerd).toBe(true);
  });
  it("wissen kan alleen zonder boekingen", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const b = await maakKamer("t1", kamerInv({ naam: "2" }), NU);
    const boeking = await maakBoeking("t1", boekInv(b.id, "2026-12-01", "2026-12-02"), NU);
    await verwijderKamer("t1", a.id);
    expect(await leesKamer("t1", a.id)).toBeNull();
    expect((await fout(verwijderKamer("t1", b.id))).status).toBe(409);
    await zetStatus("t1", boeking.id, "geannuleerd", NU);
    expect((await fout(verwijderKamer("t1", b.id))).status).toBe(409); // ook een geannuleerde boeking blijft de geschiedenis
    expect((await fout(verwijderKamer("t2", b.id))).status).toBe(404);
  });
});

describe("boekingen maken", () => {
  it("geeft volgnummers K-2026-0001, 0002, … per organisatie", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU);
    const y = await maakBoeking("t1", boekInv(a.id, "2026-12-03", "2026-12-05"), NU);
    expect([x.nummer, y.nummer]).toEqual(["K-2026-0001", "K-2026-0002"]);
    expect(x).toMatchObject({ id: "2026-0001", status: "gereserveerd", prijsPerNachtCent: 10_000, gastGewistOp: null, prijsOverschrijfCent: null });
    const b = await maakKamer("t2", kamerInv(), NU);
    expect((await maakBoeking("t2", boekInv(b.id, "2026-12-01", "2026-12-03"), NU)).nummer).toBe("K-2026-0001");
  });
  it("het nummer van een verdwenen boeking wordt niet opnieuw gebruikt", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU);
    m.kv.delete(`kamers:boeking:t1:${x.id}`);
    m.kv.delete("kamers:teller:t1:2026");
    expect((await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU)).nummer).toBe("K-2026-0002");
  });
  it("het nummer begint opnieuw in een nieuw jaar, volgens Nederlandse tijd", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU);
    // 23:30 UTC op 31 december is 00:30 op 1 januari in Amsterdam
    const nieuwjaar = new Date("2026-12-31T23:30:00Z");
    expect((await maakBoeking("t1", boekInv(a.id, "2027-02-01", "2027-02-03"), nieuwjaar)).nummer).toBe("K-2027-0001");
    expect((await maakBoeking("t1", boekInv(a.id, "2026-12-10", "2026-12-12"), new Date("2026-12-31T22:30:00Z"))).nummer).toBe("K-2026-0002");
  });
  it("gelijktijdig aanmaken geeft nooit hetzelfde nummer", async () => {
    const kamers = await Promise.all(Array.from({ length: 6 }, (_, i) => maakKamer("t1", kamerInv({ naam: `K${i}` }), NU)));
    const r = await Promise.all(kamers.map((k) => maakBoeking("t1", boekInv(k.id, "2026-12-01", "2026-12-03"), NU)));
    expect(new Set(r.map((b) => b.nummer)).size).toBe(6);
    expect((await leesBoekingen("t1")).length).toBe(6);
  });
  it("twee gelijktijdige boekingen van dezelfde kamer in dezelfde nachten: er blijft er één over", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const r = await Promise.allSettled([maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-04"), NU), maakBoeking("t1", boekInv(a.id, "2026-12-02", "2026-12-05"), NU)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const af = r.find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(af.reason.status).toBe(409);
    expect(await leesBoekingen("t1")).toHaveLength(1);
  });
  it("weigert een dubbele boeking en laat aansluitende dagen toe", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-04"), NU);
    const f = await fout(maakBoeking("t1", boekInv(a.id, "2026-12-03", "2026-12-06"), NU));
    expect(f.status).toBe(409);
    expect(f.message).toMatch(/al bezet/);
    await maakBoeking("t1", boekInv(a.id, "2026-12-04", "2026-12-06"), NU); // vertrek 4 dec, aankomst 4 dec
    await maakBoeking("t1", boekInv(a.id, "2026-11-28", "2026-12-01"), NU);
    expect(await leesBoekingen("t1")).toHaveLength(3);
  });
  it("een boeking over de jaarwisseling blokkeert de nachten aan beide kanten", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    await maakBoeking("t1", boekInv(a.id, "2026-12-30", "2027-01-03"), NU);
    expect((await fout(maakBoeking("t1", boekInv(a.id, "2027-01-02", "2027-01-04"), NU))).status).toBe(409);
    expect((await fout(maakBoeking("t1", boekInv(a.id, "2026-12-28", "2026-12-31"), NU))).status).toBe(409);
    await maakBoeking("t1", boekInv(a.id, "2027-01-03", "2027-01-05"), NU);
  });
  it("weigert te veel personen, een gearchiveerde kamer, een kamer van een andere organisatie en een onbekende kamer", async () => {
    const a = await maakKamer("t1", kamerInv({ capaciteit: 2 }), NU);
    expect((await fout(maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-02", { personen: 3 }), NU))).message).toMatch(/hoogstens 2 personen/);
    expect((await fout(maakBoeking("t2", boekInv(a.id, "2026-12-01", "2026-12-02"), NU))).status).toBe(404);
    expect((await fout(maakBoeking("t1", boekInv("cccccccccccc", "2026-12-01", "2026-12-02"), NU))).status).toBe(404);
    await zetArchief("t1", a.id, true, NU);
    expect((await fout(maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-02"), NU))).message).toMatch(/gearchiveerd/);
  });
  it("weigert vertrek vóór aankomst en ontbrekende gegevens met 422", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    expect((await fout(maakBoeking("t1", boekInv(a.id, "2026-12-05", "2026-12-04"), NU))).status).toBe(422);
    expect((await fout(maakBoeking("t1", boekInv(a.id, "2026-12-05", "2026-12-05"), NU))).status).toBe(422);
    expect((await fout(maakBoeking("t1", boekInv(a.id, "2026-12-05", "2026-12-06", { naam: "" }), NU))).status).toBe(422);
    expect(await leesBoekingen("t1")).toEqual([]);
  });
  it("een geannuleerde boeking maakt de nachten weer vrij", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-04"), NU);
    await zetStatus("t1", x.id, "geannuleerd", NU);
    await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-04"), NU);
    // terugzetten kan nu niet meer: de nachten zijn vergeven
    const f = await fout(zetStatus("t1", x.id, "gereserveerd", NU));
    expect(f.status).toBe(422);
    expect(f.message).toMatch(/al bezet/);
  });
  it("een prijs op de kamer wordt vastgelegd; zonder prijs blijft het totaal leeg", async () => {
    const a = await maakKamer("t1", kamerInv({ prijsCent: null }), NU);
    expect((await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU)).prijsPerNachtCent).toBeNull();
    await bewerkKamer("t1", a.id, kamerInv({ prijsCent: 9_900 }), NU);
    expect((await maakBoeking("t1", boekInv(a.id, "2026-12-10", "2026-12-12", { prijsOverschrijfCent: 15_000 }), NU))).toMatchObject({ prijsPerNachtCent: 9_900, prijsOverschrijfCent: 15_000 });
  });
});

describe("boekingen wijzigen en status", () => {
  it("lezen is per organisatie en met een geldig id", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU);
    expect(await leesBoeking("t2", x.id)).toBeNull();
    expect(await leesBoeking("t1", "constructor")).toBeNull();
    expect((await fout(wijzigBoeking("t2", x.id, boekInv(a.id, "2026-12-01", "2026-12-03"), NU))).status).toBe(404);
    expect((await fout(zetStatus("t2", x.id, "ingecheckt", NU))).status).toBe(404);
    expect((await fout(wisGast("t2", x.id, NU))).status).toBe(404);
    expect((await fout(zetStatus("t1", "constructor", "ingecheckt", NU))).status).toBe(404);
  });
  it("verlengen en verplaatsen controleert de botsing, niet met zichzelf", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU);
    await maakBoeking("t1", boekInv(a.id, "2026-12-05", "2026-12-07"), NU);
    expect((await wijzigBoeking("t1", x.id, boekInv(a.id, "2026-12-01", "2026-12-05"), NU)).vertrek).toBe("2026-12-05");
    expect((await fout(wijzigBoeking("t1", x.id, boekInv(a.id, "2026-12-01", "2026-12-06"), NU))).status).toBe(409);
  });
  it("een andere kamer neemt de prijs van die kamer; dezelfde kamer houdt de vastgelegde prijs", async () => {
    const a = await maakKamer("t1", kamerInv({ naam: "1", prijsCent: 10_000 }), NU);
    const b = await maakKamer("t1", kamerInv({ naam: "2", prijsCent: 20_000 }), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU);
    await bewerkKamer("t1", a.id, kamerInv({ naam: "1", prijsCent: 50_000 }), NU);
    expect((await wijzigBoeking("t1", x.id, boekInv(a.id, "2026-12-01", "2026-12-04"), NU)).prijsPerNachtCent).toBe(10_000);
    expect((await wijzigBoeking("t1", x.id, boekInv(b.id, "2026-12-01", "2026-12-04"), NU)).prijsPerNachtCent).toBe(20_000);
  });
  it("een geannuleerde boeking is niet te bewerken", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU);
    await zetStatus("t1", x.id, "geannuleerd", NU);
    expect((await fout(wijzigBoeking("t1", x.id, boekInv(a.id, "2026-12-01", "2026-12-03"), NU))).status).toBe(409);
  });
  it("uitchecken zet de kamer op vuil; andere overgangen niet", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-11-10", "2026-11-12"), NU);
    expect((await fout(zetStatus("t1", x.id, "uitgecheckt", NU))).status).toBe(422); // eerst inchecken
    await zetStatus("t1", x.id, "ingecheckt", NU);
    expect((await leesKamer("t1", a.id))?.schoon).toBe("schoon");
    const r = await zetStatus("t1", x.id, "uitgecheckt", NU);
    expect(r.boeking.status).toBe("uitgecheckt");
    expect(r.kamer?.schoon).toBe("vuil");
    expect((await leesKamer("t1", a.id))?.schoon).toBe("vuil");
    await zetSchoon("t1", a.id, "schoon", NU);
    await zetStatus("t1", x.id, "ingecheckt", NU); // vergissing herstellen maakt de kamer niet vuil
    expect((await leesKamer("t1", a.id))?.schoon).toBe("schoon");
  });
});

describe("persoonsgegevens", () => {
  it("gastgegevens wissen laat een lege regel staan die nog bezet telt", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-03"), NU);
    const w = await wisGast("t1", x.id, NU);
    expect(w).toMatchObject({ naam: "", telefoon: "", email: "", opmerking: "", aankomst: "2026-12-01", vertrek: "2026-12-03", personen: 2, gastGewistOp: NU.toISOString() });
    expect(JSON.stringify([...m.kv.values()])).not.toMatch(/Jansen|0612345678|j@test|hond/);
    expect((await fout(maakBoeking("t1", boekInv(a.id, "2026-12-02", "2026-12-04"), NU))).status).toBe(409);
    // bewerken van een gewiste boeking vraagt geen naam en bewaart geen gastgegevens
    const b = await wijzigBoeking("t1", x.id, boekInv(a.id, "2026-12-01", "2026-12-04", { naam: "", telefoon: "0611111111" }), NU);
    expect(b).toMatchObject({ naam: "", telefoon: "", vertrek: "2026-12-04" });
    expect((await wisGast("t1", x.id, new Date("2027-01-01T00:00:00Z"))).gastGewistOp).toBe(NU.toISOString());
  });
  it("de bewaartermijn wist alleen uitgecheckte boekingen van langer dan twee jaar geleden", async () => {
    const a = await maakKamer("t1", kamerInv(), NU);
    const oud = await maakBoeking("t1", boekInv(a.id, "2024-10-01", "2024-10-03"), NU);
    const recent = await maakBoeking("t1", boekInv(a.id, "2025-10-01", "2025-10-03"), NU);
    const oudGeannuleerd = await maakBoeking("t1", boekInv(a.id, "2024-09-01", "2024-09-03"), NU);
    for (const x of [oud, recent]) {
      await zetStatus("t1", x.id, "ingecheckt", NU);
      await zetStatus("t1", x.id, "uitgecheckt", NU);
    }
    await zetStatus("t1", oudGeannuleerd.id, "geannuleerd", NU);
    expect(await aantalTeSchonen("t1", NU)).toBe(1);
    expect(await aantalTeSchonen("t2", NU)).toBe(0);
    expect(await schoonNaBewaartermijn("t2", NU)).toBe(0);
    expect(await schoonNaBewaartermijn("t1", NU)).toBe(1);
    expect((await leesBoeking("t1", oud.id))?.naam).toBe("");
    expect((await leesBoeking("t1", recent.id))?.naam).toBe("Jansen");
    expect((await leesBoeking("t1", oudGeannuleerd.id))?.naam).toBe("Jansen");
    expect(await schoonNaBewaartermijn("t1", NU)).toBe(0);
  });
});

describe("zoeken", () => {
  it("vrije kamers en boekingen in een periode", async () => {
    const a = await maakKamer("t1", kamerInv({ naam: "1", capaciteit: 2 }), NU);
    const b = await maakKamer("t1", kamerInv({ naam: "2", capaciteit: 4 }), NU);
    const x = await maakBoeking("t1", boekInv(a.id, "2026-12-01", "2026-12-05"), NU);
    expect((await zoekVrijeKamers("t1", "2026-12-03", "2026-12-06", 2)).map((k) => k.id)).toEqual([b.id]);
    expect((await zoekVrijeKamers("t1", "2026-12-05", "2026-12-06", 2)).map((k) => k.id)).toEqual([a.id, b.id]);
    expect((await zoekVrijeKamers("t1", "2026-12-03", "2026-12-06", 2, x.id)).map((k) => k.id)).toEqual([a.id, b.id]);
    expect(await zoekVrijeKamers("t2", "2026-12-03", "2026-12-06", 2)).toEqual([]);
    expect(await boekingenInPeriode("t1", "2026-12-05", "2026-12-10")).toEqual([]);
    expect(await boekingenInPeriode("t1", "2026-12-04", "2026-12-10")).toHaveLength(1);
  });
});
