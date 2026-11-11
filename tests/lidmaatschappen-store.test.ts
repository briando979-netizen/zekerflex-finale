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
  bewerkLid,
  bewerkVorm,
  leesLeden,
  leesLid,
  leesLidmaatschap,
  leesLidmaatschappen,
  leesVorm,
  leesVormen,
  logboek,
  maakLid,
  maakLidmaatschap,
  maakVorm,
  registreerBezoek,
  wijzigLidmaatschap,
  wisLid,
  wisVerlopenLeden,
  zetVormArchief,
} from "@/lib/lidmaatschappen/store";

const NU = new Date("2026-11-12T06:00:00Z");
const na = (sec: number) => new Date(NU.getTime() + sec * 1000);

const fout = async (p: Promise<unknown>): Promise<{ status: number; message: string }> => {
  try {
    await p;
  } catch (e) {
    return e as { status: number; message: string };
  }
  return { status: 0, message: "" };
};

const maand = { type: "vorm", naam: "Maandabonnement", soort: "maand", prijsCent: 3000 };
const tien = { type: "vorm", naam: "Tienrittenkaart", soort: "strippenkaart", prijsCent: 8000, strippen: 10, geldigheidMaanden: 6 };
const sanne = { naam: "Sanne de Vries", telefoon: "06 12345678", email: "sanne@example.test", notitie: "Knie sparen" };

/** Een lid met een abonnement of een kaart; geeft de ids terug. */
async function lidMet(t: string, vormInvoer: Record<string, unknown>, lidInvoer: Record<string, unknown> = sanne) {
  const vorm = await maakVorm(t, vormInvoer, NU);
  const lid = await maakLid(t, lidInvoer, NU);
  const lm = await maakLidmaatschap(t, { lidId: lid.id, vormId: vorm.id }, NU);
  return { vorm, lid, lm };
}

beforeEach(() => m.kv.clear());

describe("vormen", () => {
  it("maakt, vindt terug en sorteert op naam; een andere organisatie ziet ze niet", async () => {
    const a = await maakVorm("t1", maand, NU);
    await maakVorm("t1", { ...maand, naam: "Jaarkaart", soort: "jaar", prijsCent: 30000 }, NU);
    expect((await leesVormen("t1")).map((v) => v.naam)).toEqual(["Jaarkaart", "Maandabonnement"]);
    expect((await leesVorm("t1", a.id))?.id).toBe(a.id);
    expect(await leesVormen("t2")).toEqual([]);
    expect(await leesVorm("t2", a.id)).toBeNull();
  });
  it("ongeldige id's geven null, ook 'constructor'", async () => {
    expect(await leesVorm("t1", "constructor")).toBeNull();
    expect(await leesVorm("t1", "")).toBeNull();
    expect(await leesVorm("t1", "../etc")).toBeNull();
  });
  it("een wijziging van de vorm raakt bestaande lidmaatschappen niet", async () => {
    const { vorm, lm } = await lidMet("t1", { ...maand, looptijdPerioden: 3 });
    await bewerkVorm("t1", vorm.id, { ...maand, prijsCent: 4500, looptijdPerioden: 6 });
    const nu = await leesLidmaatschap("t1", lm.id);
    expect(nu).toMatchObject({ prijsCent: 3000, einddatum: lm.einddatum });
  });
  it("archiveren en terughalen; een gearchiveerde vorm krijgt geen nieuw lidmaatschap", async () => {
    const { vorm, lid } = await lidMet("t1", maand);
    expect((await zetVormArchief("t1", vorm.id, true)).gearchiveerd).toBe(true);
    const e = await fout(maakLidmaatschap("t1", { lidId: lid.id, vormId: vorm.id }, NU));
    expect(e.status).toBe(409);
    expect(e.message).toMatch(/gearchiveerd/);
    await zetVormArchief("t1", vorm.id, false);
    expect((await maakLidmaatschap("t1", { lidId: lid.id, vormId: vorm.id }, NU)).status).toBe("actief");
  });
  it("een onbekende vorm geeft 404", async () => {
    expect((await fout(bewerkVorm("t1", "aaaaaaaaaaaa", maand))).status).toBe(404);
    expect((await fout(zetVormArchief("t1", "aaaaaaaaaaaa", true))).status).toBe(404);
  });
});

describe("leden en lidnummers", () => {
  it("nummert per organisatie door vanaf L-0001, en een andere organisatie begint zelf bij L-0001", async () => {
    expect((await maakLid("t1", sanne, NU)).nummer).toBe("L-0001");
    expect((await maakLid("t1", { ...sanne, naam: "Piet" }, NU)).nummer).toBe("L-0002");
    expect((await maakLid("t2", sanne, NU)).nummer).toBe("L-0001");
    expect(await leesLeden("t3")).toEqual([]);
  });
  it("een lid dat tegelijk wordt aangemaakt krijgt nooit een dubbel nummer", async () => {
    const lid = await Promise.all(Array.from({ length: 12 }, (_, i) => maakLid("t1", { ...sanne, naam: `Lid ${i + 10}` }, NU)));
    const nummers = lid.map((l) => l.nummer);
    expect(new Set(nummers).size).toBe(12);
    expect([...nummers].sort()[0]).toBe("L-0001");
    expect((await leesLeden("t1")).length).toBe(12);
  });
  it("een nummer waar al een claim op staat wordt overgeslagen, en een gewist lid geeft zijn nummer niet vrij", async () => {
    m.kv.set("lidmaatschappen:nr:t1:L-0001~spook", { rand: "spook", at: 1 });
    const a = await maakLid("t1", sanne, NU);
    expect(a.nummer).toBe("L-0002");
    await wisLid("t1", a.id, NU);
    expect((await maakLid("t1", sanne, NU)).nummer).toBe("L-0003");
  });
  it("nummers boven 9999 groeien gewoon door", async () => {
    m.kv.set("lidmaatschappen:teller:t1", { n: 9999 });
    expect((await maakLid("t1", sanne, NU)).nummer).toBe("L-10000");
  });
  it("bewaart nooit een geboortedatum", async () => {
    const l = await maakLid("t1", { ...sanne, geboortedatum: "1990-05-17", leeftijd: 36 }, NU);
    expect(JSON.stringify(l)).not.toMatch(/1990|leeftijd|geboorte/);
    expect(JSON.stringify([...m.kv])).not.toMatch(/1990|geboorte/);
  });
  it("een ongeldig lid geeft 422", async () => {
    expect((await fout(maakLid("t1", { naam: "Sanne" }, NU))).status).toBe(422);
    expect(await leesLeden("t1")).toEqual([]);
  });
  it("bewerken; een lid van een andere organisatie of met een ongeldig id bestaat niet", async () => {
    const l = await maakLid("t1", sanne, NU);
    expect((await bewerkLid("t1", l.id, { ...sanne, naam: "Sanne Jansen" })).naam).toBe("Sanne Jansen");
    expect((await fout(bewerkLid("t2", l.id, sanne))).status).toBe(404);
    expect((await fout(bewerkLid("t1", "constructor", sanne))).status).toBe(404);
    expect(await leesLid("t2", l.id)).toBeNull();
  });
});

describe("lid wissen", () => {
  it("haalt naam, telefoon, e-mail en notitie overal weg; lidmaatschappen en bezoeken blijven anoniem staan", async () => {
    const { lid, lm } = await lidMet("t1", maand);
    await registreerBezoek("t1", lid.id, {}, "u1", NU);
    const gewist = await wisLid("t1", lid.id, na(60));
    expect(gewist).toMatchObject({ gewist: true, naam: "", telefoon: "", email: "", notitie: "", nummer: "L-0001" });
    const alles = JSON.stringify([...m.kv]);
    for (const spoor of ["Sanne", "06 12345678", "sanne@example.test", "Knie sparen"]) expect(alles).not.toContain(spoor);
    expect((await leesLidmaatschap("t1", lm.id))?.lidId).toBe(lid.id);
    expect(await logboek("t1", lid.id)).toHaveLength(1);
  });
  it("een gewist lid is niet meer te bewerken en krijgt geen bezoek of lidmaatschap; nog eens wissen is veilig", async () => {
    const { vorm, lid } = await lidMet("t1", maand);
    await wisLid("t1", lid.id, NU);
    expect((await fout(bewerkLid("t1", lid.id, sanne))).status).toBe(409);
    expect((await fout(registreerBezoek("t1", lid.id, {}, "u1", NU))).status).toBe(409);
    expect((await fout(maakLidmaatschap("t1", { lidId: lid.id, vormId: vorm.id }, NU))).status).toBe(409);
    expect((await wisLid("t1", lid.id, na(5))).gewist).toBe(true);
  });
  it("een lid van een andere organisatie wissen kan niet", async () => {
    const { lid } = await lidMet("t1", maand);
    expect((await fout(wisLid("t2", lid.id))).status).toBe(404);
    expect((await leesLid("t1", lid.id))?.naam).toBe("Sanne de Vries");
  });
  it("wisVerlopenLeden wist alleen beëindigde leden na twee jaar", async () => {
    const verleden = new Date("2024-01-10T10:00:00Z");
    const vorm = await maakVorm("t1", maand, verleden);
    const oud = await maakLid("t1", sanne, verleden);
    const lm = await maakLidmaatschap("t1", { lidId: oud.id, vormId: vorm.id }, verleden);
    await wijzigLidmaatschap("t1", lm.id, { actie: "beeindigen", reden: "Verhuisd" }, new Date("2024-02-01T10:00:00Z"));
    const recent = await maakLid("t1", { ...sanne, naam: "Piet" }, NU);
    expect(await wisVerlopenLeden("t1", new Date("2026-11-12T06:00:00Z"))).toBe(1);
    expect((await leesLid("t1", oud.id))?.gewist).toBe(true);
    expect((await leesLid("t1", recent.id))?.gewist).toBe(false);
    expect(await wisVerlopenLeden("t1", new Date("2026-11-12T06:00:00Z"))).toBe(0);
  });
});

describe("lidmaatschappen", () => {
  it("een lid kan meerdere lidmaatschappen hebben (abonnement plus strippenkaart)", async () => {
    const { lid } = await lidMet("t1", maand);
    const kaart = await maakVorm("t1", tien, NU);
    await maakLidmaatschap("t1", { lidId: lid.id, vormId: kaart.id, startdatum: "2026-11-01" }, NU);
    const lijst = (await leesLidmaatschappen("t1")).filter((l) => l.lidId === lid.id);
    expect(lijst).toHaveLength(2);
    expect(lijst.find((l) => l.soort === "strippenkaart")).toMatchObject({ strippenBegin: 10, einddatum: "2027-04-30", startdatum: "2026-11-01" });
  });
  it("een onbekend lid of een vorm van een andere organisatie wordt geweigerd", async () => {
    const { vorm, lid } = await lidMet("t1", maand);
    expect((await fout(maakLidmaatschap("t1", { lidId: "aaaaaaaaaaaa", vormId: vorm.id }, NU))).status).toBe(404);
    expect((await fout(maakLidmaatschap("t1", { lidId: "constructor", vormId: vorm.id }, NU))).status).toBe(404);
    expect((await fout(maakLidmaatschap("t2", { lidId: lid.id, vormId: vorm.id }, NU))).status).toBe(404);
    const eigen = await maakLid("t2", sanne, NU);
    const e = await fout(maakLidmaatschap("t2", { lidId: eigen.id, vormId: vorm.id }, NU));
    expect(e.status).toBe(422);
    expect(e.message).toMatch(/vorm/);
  });
  it("pauzeren, hervatten en beëindigen worden bewaard; een andere organisatie kan ze niet raken", async () => {
    const { lm } = await lidMet("t1", maand);
    expect((await wijzigLidmaatschap("t1", lm.id, { actie: "pauzeren" }, NU)).status).toBe("gepauzeerd");
    expect((await leesLidmaatschap("t1", lm.id))?.pauzeSinds).toBe("2026-11-12");
    expect((await wijzigLidmaatschap("t1", lm.id, { actie: "hervatten" }, NU)).status).toBe("actief");
    expect((await wijzigLidmaatschap("t1", lm.id, { actie: "beeindigen", reden: "Verhuisd" }, NU)).status).toBe("beeindigd");
    expect((await fout(wijzigLidmaatschap("t2", lm.id, { actie: "pauzeren" }, NU))).status).toBe(404);
    expect((await fout(wijzigLidmaatschap("t1", "constructor", { actie: "pauzeren" }, NU))).status).toBe(404);
  });
});

describe("bezoeken", () => {
  it("registreert een bezoek bij een abonnement zonder strip, met het tijdstip van de server en laatst gezien", async () => {
    const { lid, lm } = await lidMet("t1", maand);
    const r = await registreerBezoek("t1", lid.id, {}, "u1", na(10));
    expect(r.bezoek).toMatchObject({ lidId: lid.id, lidmaatschapId: lm.id, strip: false, op: na(10).toISOString(), dag: "2026-11-12", door: "u1" });
    expect(r.lid.laatstGezien).toBe(na(10).toISOString());
    expect((await leesLid("t1", lid.id))?.laatstGezien).toBe(na(10).toISOString());
    expect(r.lidmaatschap.strippenGebruikt).toBe(0);
  });
  it("een strippenkaart verliest bij elk bezoek één strip, nooit onder nul, en weigert het bezoek met een uitleg", async () => {
    const { lid, lm } = await lidMet("t1", tien);
    for (let i = 0; i < 10; i += 1) await registreerBezoek("t1", lid.id, {}, "u1", na(i));
    expect((await leesLidmaatschap("t1", lm.id))?.strippenGebruikt).toBe(10);
    const e = await fout(registreerBezoek("t1", lid.id, {}, "u1", na(11)));
    expect(e.status).toBe(409);
    expect(e.message).toMatch(/is op/);
    const gekozen = await fout(registreerBezoek("t1", lid.id, { lidmaatschapId: lm.id }, "u1", na(12)));
    expect(gekozen.message).toMatch(/is op/);
    expect((await leesLidmaatschap("t1", lm.id))?.strippenGebruikt).toBe(10);
    expect(await logboek("t1", lid.id)).toHaveLength(10);
  });
  it("gelijktijdige bezoeken op de laatste strippen halen er nooit meer af dan er op staan", async () => {
    const { lid, lm } = await lidMet("t1", { ...tien, strippen: 3 });
    const uitkomsten = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => registreerBezoek("t1", lid.id, { lidmaatschapId: lm.id }, "u1", na(i))));
    const gelukt = uitkomsten.filter((u) => u.status === "fulfilled").length;
    expect(gelukt).toBeGreaterThanOrEqual(1);
    expect(gelukt).toBeLessThanOrEqual(3);
    const regels = (await logboek("t1", lid.id)).filter((b) => b.strip);
    expect(regels.length).toBeLessThanOrEqual(3);
    expect((await leesLidmaatschap("t1", lm.id))?.strippenGebruikt ?? 0).toBeLessThanOrEqual(3);
  });
  it("zonder gekozen lidmaatschap gaat een abonnement voor; met een gekozen kaart gaat er een strip af", async () => {
    const { lid, lm } = await lidMet("t1", maand);
    const kaartVorm = await maakVorm("t1", tien, NU);
    const kaart = await maakLidmaatschap("t1", { lidId: lid.id, vormId: kaartVorm.id }, NU);
    expect((await registreerBezoek("t1", lid.id, {}, "u1", na(1))).lidmaatschap.id).toBe(lm.id);
    const r = await registreerBezoek("t1", lid.id, { lidmaatschapId: kaart.id }, "u1", na(2));
    expect(r.bezoek.strip).toBe(true);
    expect(r.lidmaatschap.strippenGebruikt).toBe(1);
  });
  it("wordt geweigerd zonder lidmaatschap, bij pauze, einde of verlopen kaart", async () => {
    const zonder = await maakLid("t1", sanne, NU);
    expect((await fout(registreerBezoek("t1", zonder.id, {}, "u1", NU))).message).toMatch(/nog geen lidmaatschap/);
    const { lid, lm } = await lidMet("t1", maand, { ...sanne, naam: "Piet" });
    await wijzigLidmaatschap("t1", lm.id, { actie: "pauzeren" }, NU);
    expect((await fout(registreerBezoek("t1", lid.id, {}, "u1", na(5)))).message).toMatch(/gepauzeerd/);
    await wijzigLidmaatschap("t1", lm.id, { actie: "hervatten" }, NU);
    await wijzigLidmaatschap("t1", lm.id, { actie: "beeindigen", reden: "Verhuisd" }, NU);
    expect((await fout(registreerBezoek("t1", lid.id, {}, "u1", na(5)))).message).toMatch(/beëindigd/);
    const k = await lidMet("t1", tien, { ...sanne, naam: "Els" });
    expect((await fout(registreerBezoek("t1", k.lid.id, {}, "u1", new Date("2027-05-12T10:00:00Z")))).message).toMatch(/verlopen/);
  });
  it("een lidmaatschap van een ander lid, een andere organisatie of een onzin-id bestaat niet", async () => {
    const a = await lidMet("t1", maand);
    const b = await lidMet("t1", maand, { ...sanne, naam: "Piet" });
    for (const id of [b.lm.id, "constructor", "__proto__", "zzzzzzzzzzzz", 42]) {
      expect((await fout(registreerBezoek("t1", a.lid.id, { lidmaatschapId: id }, "u1", NU))).status).toBe(404);
    }
    expect((await fout(registreerBezoek("t2", a.lid.id, {}, "u1", NU))).status).toBe(404);
    expect((await fout(registreerBezoek("t1", "constructor", {}, "u1", NU))).status).toBe(404);
  });
  it("de dag van een bezoek is de Nederlandse dag, ook rond zomer- en wintertijd", async () => {
    const { lid } = await lidMet("t1", maand);
    const dagen = async (iso: string) => (await registreerBezoek("t1", lid.id, {}, "u1", new Date(iso))).bezoek.dag;
    expect(await dagen("2026-11-12T23:30:00Z")).toBe("2026-11-13");
    expect(await dagen("2026-11-12T22:30:00Z")).toBe("2026-11-12");
  });
  it("het logboek: de nieuwste eerst, hoogstens 100, alleen van dit lid", async () => {
    const { lid } = await lidMet("t1", maand);
    const ander = await maakLid("t1", { ...sanne, naam: "Piet" }, NU);
    const vorm = await maakVorm("t1", { ...maand, naam: "Anders" }, NU);
    await maakLidmaatschap("t1", { lidId: ander.id, vormId: vorm.id }, NU);
    await registreerBezoek("t1", ander.id, {}, "u1", NU);
    for (let i = 0; i < 105; i += 1) await registreerBezoek("t1", lid.id, {}, "u1", na(i));
    const regels = await logboek("t1", lid.id);
    expect(regels).toHaveLength(100);
    expect(regels[0]?.op).toBe(na(104).toISOString());
    expect(regels[99]?.op).toBe(na(5).toISOString());
    expect(regels.every((r) => r.lidId === lid.id)).toBe(true);
    expect(await logboek("t2", lid.id)).toEqual([]);
    expect(await logboek("t1", "constructor")).toEqual([]);
  });
  it("laatst gezien wint het latere tijdstip", async () => {
    const { lid } = await lidMet("t1", maand);
    await registreerBezoek("t1", lid.id, {}, "u1", na(50));
    const r = await registreerBezoek("t1", lid.id, {}, "u1", na(10));
    expect(r.lid.laatstGezien).toBe(na(50).toISOString());
  });
});
