import { beforeEach, describe, expect, it, vi } from "vitest";
import { STANDAARD_AUTOPILOT, type AutopilotInstelling, type Reactie } from "@/lib/social/model";

const o = vi.hoisted(() => ({
  reacties: new Map<string, unknown>(),
  inst: null as unknown,
  gelezenFb: [] as unknown[],
  gelezenIg: [] as unknown[],
  verstuurd: [] as string[],
  voorstel: { antwoord: "Dank je, kijk op zekerflex.com voor meer info.", mensNodig: null as string | null, bron: "model" as "model" | "sjabloon" },
  pushes: 0,
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/social/meta", () => ({
  MetaFout: class MetaFout extends Error {},
  haalReactiesFacebook: async () => o.gelezenFb,
  haalReactiesInstagram: async () => o.gelezenIg,
  antwoordFacebook: async (_t: string, id: string) => {
    o.verstuurd.push(`fb:${id}`);
    return "x";
  },
  antwoordInstagram: async (_t: string, id: string) => {
    o.verstuurd.push(`ig:${id}`);
    return "x";
  },
}));
vi.mock("@/lib/social/schrijf", () => ({ schrijfAntwoord: async () => o.voorstel }));
vi.mock("@/lib/social/store", () => ({
  getAutopilot: async () => o.inst,
  getMetaStatus: async () => ({ verbonden: true, pageId: "PAGE", pageNaam: "ZF", igUserId: "IG", igNaam: "zekerflex", gecontroleerd: null }),
  getReactie: async (id: string) => o.reacties.get(id) ?? null,
  saveReactie: async (r: { id: string }) => {
    o.reacties.set(r.id, r);
  },
  metaToken: async () => ({ token: "t".repeat(30), pageId: "PAGE", igUserId: "IG" }),
  reactieSleutel: (k: string, id: string) => `${k}-${id}`,
}));
vi.mock("@/lib/messaging/contacts", () => ({ platformAdminIds: async () => ["admin1"] }));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async () => {
    o.pushes += 1;
    return 1;
  },
}));

import { synchroniseerReacties } from "@/lib/social/reacties";

const NU = new Date("2026-11-10T12:00:00Z");
const uurGeleden = (u: number) => new Date(NU.getTime() - u * 3600_000).toISOString();
const fb = (extId: string, tekst: string, extra: Record<string, unknown> = {}) => ({ extId, van: "Piet", vanId: "u1", tekst, at: uurGeleden(2), bericht: "Een bericht", heeftAntwoord: false, ...extra });

function zet(inst: Partial<AutopilotInstelling>) {
  o.inst = { ...STANDAARD_AUTOPILOT, ...inst };
}

beforeEach(() => {
  o.reacties.clear();
  o.gelezenFb = [];
  o.gelezenIg = [];
  o.verstuurd = [];
  o.pushes = 0;
  o.voorstel = { antwoord: "Dank je, kijk op zekerflex.com voor meer info.", mensNodig: null, bron: "model" };
  zet({ autoReageren: true });
});

describe("reacties (praten met ze)", () => {
  it("beantwoordt een gewone, recente vraag zelf en bewaart het antwoord", async () => {
    o.gelezenFb = [fb("c1", "Werkt dit ook in Utrecht?")];
    const r = await synchroniseerReacties(NU);
    expect(r).toMatchObject({ nieuw: 1, automatisch: 1, wachtOpMens: 0 });
    expect(o.verstuurd).toEqual(["fb:c1"]);
    expect((o.reacties.get("facebook-c1") as Reactie).status).toBe("beantwoord");
    expect((o.reacties.get("facebook-c1") as Reactie).automatisch).toBe(true);
  });

  it("laat een klacht voor een mens liggen en meldt dat", async () => {
    o.gelezenFb = [fb("c2", "Dit is oplichting, ik wil mijn geld terug")];
    const r = await synchroniseerReacties(NU);
    expect(r).toMatchObject({ nieuw: 1, automatisch: 0, wachtOpMens: 1 });
    expect(o.verstuurd).toEqual([]);
    expect((o.reacties.get("facebook-c2") as Reactie).mensNodig).toBeTruthy();
    expect(o.pushes).toBe(1);
  });

  it("antwoordt nooit op een oude reactie (ouder dan 48 uur) en nooit als er al een antwoord onder staat", async () => {
    o.gelezenFb = [fb("oud", "Leuk!", { at: uurGeleden(72) }), fb("al", "Prima!", { heeftAntwoord: true })];
    const r = await synchroniseerReacties(NU);
    expect(r.automatisch).toBe(0);
    expect(r.wachtOpMens).toBe(2);
    expect(o.verstuurd).toEqual([]);
  });

  it("verstuurt geen vaste zin of onveilig antwoord vanzelf", async () => {
    o.gelezenFb = [fb("c3", "Wat kost het?")];
    o.voorstel = { antwoord: "Slechts € 9,99 per uur, gegarandeerd!", mensNodig: null, bron: "model" };
    expect((await synchroniseerReacties(NU)).automatisch).toBe(0);
    o.reacties.clear();
    o.voorstel = { antwoord: "Bedankt voor je reactie!", mensNodig: "Het AI-model is niet bereikbaar", bron: "sjabloon" };
    expect((await synchroniseerReacties(NU)).automatisch).toBe(0);
    expect(o.verstuurd).toEqual([]);
  });

  it("slaat onze eigen reacties over, ook op Instagram, en verwerkt elke reactie één keer", async () => {
    o.gelezenFb = [fb("eigen", "Dank voor je reactie!", { vanId: "PAGE" })];
    o.gelezenIg = [fb("ig1", "Mooi!", { vanId: "zekerflex" }), fb("ig2", "Mooi bedrijf!", { van: "@anna", vanId: "anna" })];
    const r1 = await synchroniseerReacties(NU);
    expect(r1.nieuw).toBe(1);
    expect(o.verstuurd).toEqual(["ig:ig2"]);
    const r2 = await synchroniseerReacties(NU);
    expect(r2.nieuw).toBe(0);
    expect(o.verstuurd).toEqual(["ig:ig2"]);
  });

  it("hooguit 5 antwoorden per ronde; de rest wacht", async () => {
    o.gelezenFb = Array.from({ length: 8 }, (_, i) => fb(`m${i}`, `Vraag nummer ${i}?`));
    const r = await synchroniseerReacties(NU);
    expect(r.automatisch).toBe(5);
    expect(r.wachtOpMens).toBe(3);
  });

  it("zelf reageren uit: alles blijft voor een mens", async () => {
    zet({ autoReageren: false });
    o.gelezenFb = [fb("c9", "Leuk bericht!")];
    const r = await synchroniseerReacties(NU);
    expect(r).toMatchObject({ automatisch: 0, wachtOpMens: 1 });
    expect(o.verstuurd).toEqual([]);
  });
});
