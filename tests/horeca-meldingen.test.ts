import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  push: [] as { ids: string[]; title: string; body: string; url: string; tag: string }[],
  beheerders: ["beheerder1"] as string[],
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => (m.kv.has(k) ? structuredClone(m.kv.get(k)) : null),
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, structuredClone(v)),
  kvDelete: async (k: string) => void m.kv.delete(k),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { membership: { findMany: async () => m.beheerders.map((userId) => ({ userId })) } },
}));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (ids: string[], p: { title: string; body: string; data: { url: string; tag: string } }) => {
    m.push.push({ ids, title: p.title, body: p.body, url: p.data.url, tag: p.data.tag });
    return ids.length;
  },
}));

import { meldBeheerders, meldBesluit, meldChat, meldDienst, meldMededeling } from "@/lib/horeca-personeel/meldingen";
import { bewaarDashboard, koppelAccount, markeerGelezen, leesPersoneelVan, nodigUit, plaatsMededeling } from "@/lib/horeca-personeel/store";

// Pushmeldingen voor het eigen personeel en het gelezen-vinkje bij mededelingen.

const T = "tenantAAAA1";

async function team() {
  await bewaarDashboard(T, { naam: "Zaal", blokken: ["taken"] });
  await bewaarDashboard(T, { naam: "Keuken", blokken: ["taken"] });
  const a = await nodigUit(T, "Zaak", { naam: "Piet", email: "piet@voorbeeld.test", functie: "", dashboardId: "d1" });
  const b = await nodigUit(T, "Zaak", { naam: "Els", email: "els@voorbeeld.test", functie: "", dashboardId: "d2" });
  await koppelAccount(T, a.medewerker.id, "uP");
  await koppelAccount(T, b.medewerker.id, "uE");
  return { a: a.medewerker.id, b: b.medewerker.id };
}

beforeEach(() => {
  m.kv.clear();
  m.push.length = 0;
  m.beheerders = ["beheerder1"];
});

describe("chatmeldingen", () => {
  it("een teambericht van een medewerker gaat naar de collega's en de beheerder, niet naar de schrijver", async () => {
    const { a } = await team();
    await meldChat(T, "team", { id: a, naam: "Piet" }, 1_000_000);
    expect(m.push).toHaveLength(1);
    expect(m.push[0]?.ids.sort()).toEqual(["beheerder1", "uE"]);
    expect(m.push[0]?.url).toBe("/personeel");
    expect(m.push[0]?.body).not.toMatch(/ben je/); // geen tekst van het bericht zelf
  });

  it("een teambericht van de beheerder gaat naar alle actieve medewerkers", async () => {
    await team();
    await meldChat(T, "team", { id: "beheer", naam: "Els B" }, 1_000_000);
    expect(m.push[0]?.ids.sort()).toEqual(["uE", "uP"]);
  });

  it("een gesprek: medewerker naar de beheerder, beheerder naar die ene medewerker", async () => {
    const { a } = await team();
    await meldChat(T, `dm-${a}`, { id: a, naam: "Piet" }, 1_000_000);
    expect(m.push[0]?.ids).toEqual(["beheerder1"]);
    expect(m.push[0]?.url).toContain("/werkgever/horeca");
    await meldChat(T, `dm-${a}`, { id: "beheer", naam: "Els B" }, 1_000_000);
    expect(m.push[1]?.ids).toEqual(["uP"]);
  });

  it("hooguit één melding per kanaal en ontvanger per 10 minuten", async () => {
    const { a } = await team();
    await meldChat(T, "team", { id: a, naam: "Piet" }, 1_000_000);
    await meldChat(T, "team", { id: a, naam: "Piet" }, 1_000_000 + 5 * 60_000);
    expect(m.push).toHaveLength(1);
    await meldChat(T, "team", { id: a, naam: "Piet" }, 1_000_000 + 11 * 60_000);
    expect(m.push).toHaveLength(2);
  });
});

describe("andere meldingen", () => {
  it("een mededeling gaat alleen naar de medewerkers van die dashboards, ingekort", async () => {
    await team();
    await meldMededeling(T, ["d1"], "x".repeat(200));
    expect(m.push[0]?.ids).toEqual(["uP"]);
    expect(m.push[0]?.body.length).toBeLessThanOrEqual(90);
    await meldMededeling(T, [], "voor iedereen");
    expect(m.push[1]?.ids.sort()).toEqual(["uE", "uP"]);
  });

  it("een dienst, een besluit en een wachtend verzoek", async () => {
    const { a, b } = await team();
    await meldDienst(T, a, "nieuw", "2026-11-17", "09:00–13:00");
    expect(m.push[0]).toMatchObject({ ids: ["uP"], title: "Nieuwe dienst" });
    expect(m.push[0]?.body).toContain("09:00–13:00");
    await meldDienst(T, null, "nieuw", "2026-11-17", "09:00–13:00"); // een open dienst: niemand om te melden
    expect(m.push).toHaveLength(1);
    await meldBesluit(T, [a, b, null], "ruil", "goedgekeurd");
    expect(m.push[1]?.ids.sort()).toEqual(["uE", "uP"]);
    await meldBeheerders(T, "Piet vraagt verlof aan", "verlof-wacht");
    expect(m.push[2]).toMatchObject({ ids: ["beheerder1"], tag: "verlof-wacht" });
  });

  it("een gestopte medewerker krijgt niets meer", async () => {
    const { a } = await team();
    const d = await leesPersoneelVan(T);
    m.kv.set(`horeca:personeel:${T}`, { ...d, medewerkers: d.medewerkers.map((x) => (x.id === a ? { ...x, status: "gestopt" } : x)) });
    await meldMededeling(T, [], "hoi");
    expect(m.push[0]?.ids).toEqual(["uE"]);
  });
});

describe("gelezen", () => {
  it("een medewerker telt hooguit één keer en alleen voor bestaande mededelingen", async () => {
    const { a, b } = await team();
    const d = await plaatsMededeling(T, { tekst: "hoi", dashboardIds: [] });
    const id = d.mededelingen[0]!.id;
    await markeerGelezen(T, a, [id, "bestaatniet"]);
    await markeerGelezen(T, a, [id]);
    await markeerGelezen(T, b, [id]);
    expect((await leesPersoneelVan(T)).mededelingen[0]?.gelezen).toEqual([a, b]);
  });

  it("een oude waarde zonder 'gelezen' wordt gewoon gelezen (leeg)", async () => {
    await team();
    const d = await leesPersoneelVan(T);
    m.kv.set(`horeca:personeel:${T}`, { ...d, mededelingen: [{ id: "x", tekst: "oud", datum: "2026-11-01T10:00:00Z", dashboardIds: [] }] });
    expect((await leesPersoneelVan(T)).mededelingen[0]?.gelezen).toEqual([]);
  });
});
