import { beforeEach, describe, expect, it, vi } from "vitest";

// De opslag draait in dit bestand op een gewone Map: dezelfde functies als lib/storage/kv, zonder database.
// Elke aanroep geeft het uitvoeren even vrij (await), zodat tegelijk lopende bonnen echt door elkaar heen schrijven.
const m = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
const tik = () => new Promise<void>((r) => setTimeout(r, 0));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => {
    await tik();
    return m.kv.has(k) ? structuredClone(m.kv.get(k)) : null;
  },
  kvSet: async (k: string, v: unknown) => {
    await tik();
    m.kv.set(k, structuredClone(v));
  },
  kvDelete: async (k: string) => {
    await tik();
    m.kv.delete(k);
  },
  kvListValues: async (p: string, limit: number) => {
    await tik();
    return [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([, v]) => structuredClone(v));
  },
  kvListEntries: async (p: string, limit: number) => {
    await tik();
    return [...m.kv].filter(([k]) => k.startsWith(p)).slice(0, limit).map(([key, v]) => ({ key, value: structuredClone(v) }));
  },
}));

import { bewaarTeam, leesBon, leesTeam, lijstBonnen, nieuweBon, nieuwId, verwijderBon, wijzigBon, wisKlant, zetStatus } from "@/lib/werkbonnen/store";
import { controleerInvoer, leegeKlant, type WerkbonInhoud } from "@/lib/werkbonnen/model";

const NU = new Date("2026-11-12T06:00:00Z");
const T = "tenant1";

const inhoud = (over: Record<string, unknown> = {}): WerkbonInhoud => {
  const r = controleerInvoer({ omschrijving: "Kozijnen schilderen", klant: { naam: "Piet Jansen", telefoon: "0612345678", email: "piet@voorbeeld.nl", plaats: "Utrecht" }, ...over }, nieuwId);
  if (!r.ok) throw new Error(r.fout);
  return r.waarde;
};

beforeEach(() => m.kv.clear());

describe("nummering", () => {
  it("geeft WB-<jaar>-<volgnummer> per organisatie en per jaar", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    const b = await nieuweBon(T, inhoud(), NU);
    expect(a.nummer).toBe("WB-2026-0001");
    expect(b.nummer).toBe("WB-2026-0002");
    expect(a.id).toBe("2026-0001");
    expect(a.status).toBe("nieuw");
    const ander = await nieuweBon("tenant2", inhoud(), NU);
    expect(ander.nummer).toBe("WB-2026-0001");
    const volgendJaar = await nieuweBon(T, inhoud(), new Date("2027-02-01T10:00:00Z"));
    expect(volgendJaar.nummer).toBe("WB-2027-0001");
  });

  it("het jaar telt in Nederlandse tijd: 31 december 23:30 UTC is al 1 januari in Nederland", async () => {
    expect((await nieuweBon(T, inhoud(), new Date("2026-12-31T22:59:00Z"))).nummer).toBe("WB-2026-0001");
    expect((await nieuweBon(T, inhoud(), new Date("2026-12-31T23:30:00Z"))).nummer).toBe("WB-2027-0001");
  });

  it("twee bonnen tegelijk krijgen niet hetzelfde nummer", async () => {
    const [a, b] = await Promise.all([nieuweBon(T, inhoud({ omschrijving: "Eerste" }), NU), nieuweBon(T, inhoud({ omschrijving: "Tweede" }), NU)]);
    expect(a.nummer).not.toBe(b.nummer);
    expect(await lijstBonnen(T)).toHaveLength(2);
  });

  it("vijfentwintig bonnen tegelijk: allemaal een eigen, doorlopend nummer en geen enkele bon overschreven", async () => {
    const bonnen = await Promise.all(Array.from({ length: 25 }, (_, n) => nieuweBon(T, inhoud({ omschrijving: `Opdracht ${n}` }), NU)));
    const nummers = bonnen.map((b) => b.nummer);
    expect(new Set(nummers).size).toBe(25);
    expect([...nummers].sort()).toEqual(Array.from({ length: 25 }, (_, n) => `WB-2026-${String(n + 1).padStart(4, "0")}`));
    const opgeslagen = await lijstBonnen(T);
    expect(opgeslagen).toHaveLength(25);
    // elke opgeslagen bon hoort bij de aanvrager met dat nummer
    for (const b of bonnen) expect((await leesBon(T, b.id))?.omschrijving).toBe(b.omschrijving);
  });

  it("een verwijderd nummer wordt niet opnieuw uitgegeven", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    await verwijderBon(T, a.id);
    const b = await nieuweBon(T, inhoud(), NU);
    expect(b.nummer).toBe("WB-2026-0002");
  });

  it("raakt de teller kwijt, dan gaat het nummer toch door na het aantal bonnen", async () => {
    await nieuweBon(T, inhoud(), NU);
    await nieuweBon(T, inhoud(), NU);
    for (const k of [...m.kv.keys()]) if (k.startsWith("werkbonnen:teller:")) m.kv.delete(k);
    expect((await nieuweBon(T, inhoud(), NU)).nummer).toBe("WB-2026-0003");
  });

  it("een nummer dat al in gebruik is (claim zonder teller) wordt overgeslagen", async () => {
    m.kv.set(`werkbonnen:nr:${T}:2026:0001~abc`, { rand: "abc", at: 1 });
    expect((await nieuweBon(T, inhoud(), NU)).nummer).toBe("WB-2026-0002");
  });
});

describe("lezen en wijzigen", () => {
  it("bewaart en leest terug, alleen binnen de eigen organisatie", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    expect(await leesBon(T, a.id)).toEqual(a);
    expect(await leesBon("tenant2", a.id)).toBeNull();
    expect(await lijstBonnen("tenant2")).toEqual([]);
  });

  it("ongeldige id's geven niets terug en komen niet in de opslag", async () => {
    for (const id of ["", "x", "2026-1", "../tenant2", "2026-0001/../x", "constructor", "__proto__", "2026-0001 "]) expect(await leesBon(T, id)).toBeNull();
    await expect(wijzigBon(T, "constructor", inhoud())).rejects.toThrow(/bestaat niet/);
    await expect(zetStatus(T, "constructor", "bezig")).rejects.toThrow(/bestaat niet/);
    await expect(verwijderBon(T, "../x")).rejects.toThrow(/bestaat niet/);
    await expect(wisKlant(T, "x")).rejects.toThrow(/bestaat niet/);
  });

  it("wijzigen verandert de velden maar niet het nummer, de status of de afrondtijd", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    await zetStatus(T, a.id, "bezig", { nu: NU });
    const later = new Date("2026-11-13T08:00:00Z");
    const w = await wijzigBon(T, a.id, inhoud({ omschrijving: "Anders" }), later);
    expect(w).toMatchObject({ id: a.id, nummer: a.nummer, status: "bezig", omschrijving: "Anders", gemaaktOp: a.gemaaktOp, bijgewerktOp: later.toISOString() });
  });

  it("een wijziging in een andere organisatie raakt deze bon niet", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    await expect(wijzigBon("tenant2", a.id, inhoud({ omschrijving: "Overgenomen" }))).rejects.toThrow(/bestaat niet/);
    expect((await leesBon(T, a.id))?.omschrijving).toBe("Kozijnen schilderen");
  });

  it("de lijst filtert op status en zoekterm", async () => {
    const a = await nieuweBon(T, inhoud({ klant: { naam: "Jansen" } }), NU);
    await nieuweBon(T, inhoud({ klant: { naam: "De Vries" } }), NU);
    await zetStatus(T, a.id, "ingepland", { nu: NU });
    expect((await lijstBonnen(T, { status: "ingepland" })).map((b) => b.id)).toEqual([a.id]);
    expect(await lijstBonnen(T, { q: "vries" })).toHaveLength(1);
    expect((await lijstBonnen(T)).map((b) => b.id)).toEqual(["2026-0002", "2026-0001"]);
  });
});

describe("status", () => {
  it("weigert een overgang die niet mag, met een Nederlandse fout (422)", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    await expect(zetStatus(T, a.id, "bezig", { nu: NU })).resolves.toMatchObject({ status: "bezig" });
    await expect(zetStatus(T, a.id, "bezig", { nu: NU })).resolves.toMatchObject({ status: "bezig" });
    const b = await nieuweBon(T, inhoud(), NU);
    await zetStatus(T, b.id, "geannuleerd", { nu: NU });
    await expect(zetStatus(T, b.id, "afgerond", { nu: NU })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/kan niet naar/) });
  });

  it("afronden zonder uren geeft code ZONDER_UREN, met zonderUren lukt het en bewaart het tijdstip", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    await zetStatus(T, a.id, "bezig", { nu: NU });
    await expect(zetStatus(T, a.id, "afgerond", { nu: NU })).rejects.toMatchObject({ status: 422, details: { code: "ZONDER_UREN" } });
    expect((await leesBon(T, a.id))?.status).toBe("bezig");
    const klaar = await zetStatus(T, a.id, "afgerond", { nu: NU, zonderUren: true });
    expect(klaar.afgerondOp).toBe(NU.toISOString());
    expect((await leesBon(T, a.id))?.afgerondOp).toBe(NU.toISOString());
    const terug = await zetStatus(T, a.id, "bezig", { nu: NU });
    expect(terug.afgerondOp).toBeNull();
  });
});

describe("verwijderen en klantgegevens wissen", () => {
  it("verwijderen kan alleen bij nieuw of geannuleerd", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    await zetStatus(T, a.id, "bezig", { nu: NU });
    await expect(verwijderBon(T, a.id)).rejects.toMatchObject({ status: 409 });
    expect(await leesBon(T, a.id)).not.toBeNull();
    await zetStatus(T, a.id, "geannuleerd", { nu: NU });
    await verwijderBon(T, a.id);
    expect(await leesBon(T, a.id)).toBeNull();
    const b = await nieuweBon(T, inhoud(), NU);
    await verwijderBon(T, b.id);
    expect(await leesBon(T, b.id)).toBeNull();
  });

  it("klantgegevens wissen leegt de klant en laat de bon staan", async () => {
    const a = await nieuweBon(T, inhoud({ uren: [{ medewerker: "Piet", datum: "2026-11-12", minuten: 60 }] }), NU);
    const w = await wisKlant(T, a.id, NU);
    expect(w.klant).toEqual(leegeKlant());
    const opgeslagen = await leesBon(T, a.id);
    expect(opgeslagen?.klant).toEqual(leegeKlant());
    expect(opgeslagen?.uren).toHaveLength(1);
    expect(JSON.stringify([...m.kv.values()])).not.toContain("piet@voorbeeld.nl");
    expect(JSON.stringify([...m.kv.values()])).not.toContain("0612345678");
  });

  it("wissen in een andere organisatie raakt de bon niet", async () => {
    const a = await nieuweBon(T, inhoud(), NU);
    await expect(wisKlant("tenant2", a.id, NU)).rejects.toThrow(/bestaat niet/);
    expect((await leesBon(T, a.id))?.klant.naam).toBe("Piet Jansen");
  });
});

describe("medewerkerslijst", () => {
  it("is per organisatie en leeg zolang niets is ingesteld", async () => {
    expect(await leesTeam(T)).toEqual([]);
    await bewaarTeam(T, ["Piet", "Klaas"]);
    expect(await leesTeam(T)).toEqual(["Piet", "Klaas"]);
    expect(await leesTeam("tenant2")).toEqual([]);
  });
});
