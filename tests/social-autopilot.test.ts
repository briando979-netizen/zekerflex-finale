import { beforeEach, describe, expect, it, vi } from "vitest";
import { STANDAARD_AUTOPILOT, type AutopilotInstelling, type SocialPost } from "@/lib/social/model";

const opslag = vi.hoisted(() => ({
  posts: [] as unknown[],
  inst: null as unknown,
  meta: null as unknown,
  pushes: [] as string[],
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/social/schrijf", () => ({
  schrijfPosts: vi.fn(async ({ aantal }: { aantal: number }) => ({
    bron: "sjabloon",
    posts: Array.from({ length: aantal }, (_, i) => ({ tekst: `Testbericht nummer ${i + 1} van de autopilot`, hashtags: ["flexwerk"], beeldIdee: "beeld" })),
  })),
  alleenVeilig: (posts: unknown[], _d: string, aantal: number) => ({ posts: posts.slice(0, aantal), afgekeurd: 0 }),
}));
vi.mock("@/lib/social/reacties", () => ({ synchroniseerReacties: async () => ({ nieuw: 0, automatisch: 0, wachtOpMens: 0, fout: null }) }));
vi.mock("@/lib/social/store", () => ({
  getAutopilot: async () => opslag.inst,
  setAutopilot: async (a: unknown) => {
    opslag.inst = a;
  },
  listPosts: async () => opslag.posts,
  savePost: async (p: { id: string }) => {
    opslag.posts = [...(opslag.posts as { id: string }[]).filter((x) => x.id !== p.id), p];
  },
  metaToken: async () => opslag.meta,
  nieuwId: (() => {
    let n = 0;
    return () => `id${++n}`;
  })(),
}));
vi.mock("@/lib/messaging/contacts", () => ({ platformAdminIds: async () => ["admin1"] }));
vi.mock("@/lib/notifications/push", () => ({
  sendUserPush: async (_ids: string[], m: { title: string }) => {
    opslag.pushes.push(m.title);
    return 1;
  },
}));

import { autopilotRonde, verwerkBerichten } from "@/lib/social/publiceer";

const NU = new Date("2026-11-10T09:00:00+01:00"); // dinsdag

function zet(inst: Partial<AutopilotInstelling>) {
  opslag.inst = { ...STANDAARD_AUTOPILOT, ...inst };
}

beforeEach(() => {
  opslag.posts = [];
  opslag.meta = null;
  opslag.pushes = [];
  zet({});
});

describe("autopilot", () => {
  it("doet niets zolang hij uit staat", async () => {
    zet({ aan: false });
    const r = await autopilotRonde(NU);
    expect(r).toEqual({ gemaakt: 0, reden: "uit" });
    expect(opslag.posts).toHaveLength(0);
  });

  it("staat standaard aan, met zelf plaatsen en zelf reageren (eigenaar, 10 nov)", () => {
    expect(STANDAARD_AUTOPILOT).toMatchObject({ aan: true, zelfPlaatsen: true, autoReageren: true });
  });

  it("zet berichten klaar op werkdagen, als concept (niet goedgekeurd) en meldt het de beheerders", async () => {
    zet({ aan: true, perWeek: 3, zelfPlaatsen: false });
    const r = await autopilotRonde(NU);
    expect(r.gemaakt).toBe(3);
    const posts = opslag.posts as SocialPost[];
    expect(posts.every((p) => p.goedgekeurd === false && p.bron === "autopilot")).toBe(true);
    // elk bericht krijgt een eigen foto, zodat ook Instagram vanzelf kan plaatsen
    expect(posts.every((p) => /^https?:\/\/.+\.jpg$/.test(p.beeldUrl ?? ""))).toBe(true);
    // woensdag 11, donderdag 12 en vrijdag 13 nov, op 08:30, 12:15 en 17:30 Nederlandse tijd
    expect(posts.map((p) => p.plan).sort()).toEqual(["2026-11-11T07:30:00.000Z", "2026-11-12T11:15:00.000Z", "2026-11-13T16:30:00.000Z"]);
    expect(opslag.pushes).toEqual(["Sociale media: berichten om goed te keuren"]);
  });

  it("draait per dag één keer en vult alleen aan wat ontbreekt", async () => {
    zet({ aan: true, perWeek: 3, zelfPlaatsen: false });
    await autopilotRonde(NU);
    expect((await autopilotRonde(NU)).reden).toBe("vandaag al gedaan");
    // de volgende ochtend (vóór het eerste bericht van 08:30) liggen er nog 3 in de komende week: niets bijmaken
    const morgen = new Date("2026-11-11T06:00:00+01:00");
    const r = await autopilotRonde(morgen);
    expect(r.gemaakt).toBe(0);
    expect(opslag.posts).toHaveLength(3);
  });

  it("alleen met 'zelf plaatsen' zijn de berichten meteen goedgekeurd", async () => {
    zet({ aan: true, perWeek: 2, zelfPlaatsen: true });
    await autopilotRonde(NU);
    expect((opslag.posts as SocialPost[]).every((p) => p.goedgekeurd)).toBe(true);
    expect(opslag.pushes).toEqual([]);
  });
});

describe("berichten verwerken", () => {
  const post = (extra: Partial<SocialPost>): SocialPost => ({
    id: "a",
    tekst: "Een bericht voor sociale media",
    hashtags: [],
    kanalen: ["facebook", "linkedin"],
    beeldUrl: null,
    beeldIdee: "",
    link: "",
    plan: "2026-11-10T07:00:00.000Z",
    goedgekeurd: true,
    bron: "handmatig",
    doelgroep: "algemeen",
    campagne: null,
    uitslag: {},
    gemaakt: "2026-11-09T10:00:00.000Z",
    gemaaktDoor: null,
    ...extra,
  });

  it("een niet-goedgekeurd bericht gaat nooit weg, ook niet als de tijd voorbij is", async () => {
    opslag.posts = [post({ goedgekeurd: false })];
    const r = await verwerkBerichten(NU);
    expect(r.verwerkt).toBe(0);
  });

  it("zonder Meta-koppeling staat elk kanaal klaar voor een mens, met een melding", async () => {
    opslag.posts = [post({})];
    const r = await verwerkBerichten(NU);
    expect(r).toMatchObject({ verwerkt: 1, gepost: 0, handmatig: 2, mislukt: 0 });
    expect(opslag.pushes).toEqual(["Bericht klaar om te plaatsen"]);
    const p = (opslag.posts as SocialPost[])[0];
    expect(p?.uitslag.facebook?.status).toBe("handmatig");
    expect(p?.uitslag.linkedin?.status).toBe("handmatig");
  });

  it("verwerkt een bericht maar één keer", async () => {
    opslag.posts = [post({})];
    await verwerkBerichten(NU);
    const tweede = await verwerkBerichten(NU);
    expect(tweede.verwerkt).toBe(0);
  });

  it("Instagram zonder beeld wordt niet geprobeerd maar klaargezet met uitleg", async () => {
    opslag.meta = { token: "t".repeat(30), pageId: "1", igUserId: "2" };
    opslag.posts = [post({ kanalen: ["instagram"] })];
    await verwerkBerichten(NU);
    const u = (opslag.posts as SocialPost[])[0]?.uitslag.instagram;
    expect(u?.status).toBe("handmatig");
    expect(u?.fout).toMatch(/beeld/i);
  });
});
