import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// De meldingenbel van de opdrachtgever kent een online geboekte afspraak. Bevroren klok, elke datum met een zone.

const m = vi.hoisted(() => ({
  instellingen: { actief: true } as { actief: boolean } | null,
  afspraken: [] as unknown[],
  tussen: vi.fn(),
  dismissed: new Set<string>(),
  roles: ["HQ_ADMIN"] as string[],
}));

vi.mock("@/lib/afspraken/store", () => ({
  leesInstellingen: async () => m.instellingen,
  afsprakenTussen: async (...args: unknown[]) => {
    m.tussen(...args);
    return m.afspraken;
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    timesheet: { count: async () => 0 },
    shift: { findMany: async () => [] },
  },
}));
vi.mock("@/lib/auth", () => ({ hasRole: (_p: unknown, ...rollen: string[]) => rollen.some((r) => m.roles.includes(r)) }));
vi.mock("@/lib/prefs/store", () => ({ getPrefs: async () => ({ confirmations: {} }) }));
vi.mock("@/lib/offers/store", () => ({ offersForUser: async () => [], listCounterOffers: async () => [] }));
vi.mock("@/lib/replacements/store", () => ({ listReplacementRequests: async () => [] }));
vi.mock("@/lib/messaging/store", () => ({ listThreadsForUser: async () => [], getMessages: async () => [], unreadForUser: () => 0 }));
vi.mock("@/lib/messaging/contacts", () => ({ isPlatformAdmin: async () => false }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"], branchIds: null }) }));
vi.mock("@/lib/bank/notify", () => ({ recentNotes: async () => [] }));
vi.mock("@/lib/notifications/dismissed", () => ({
  getDismissed: async () => m.dismissed,
  notifSignature: (id: string, body: string) => `${id}|${body}`,
}));
vi.mock("@/lib/offers/verval", () => ({ REACTIE_MARGE_MS: 0 }));
vi.mock("@/lib/app-mode", () => ({ BANK_AAN: false }));

import { afsprakenBelItems, afsprakenBelVoor } from "@/lib/afspraken/bel";
import { getNotifications } from "@/lib/notifications/feed";
import type { Afspraak } from "@/lib/afspraken/model";

const NU = new Date("2026-11-12T10:00:00+01:00"); // donderdag 12 november, 10:00 in Nederland

function afspraak(over: Partial<Afspraak> = {}): Afspraak {
  return {
    id: "2026-11-13~abc123",
    dienstId: "d1",
    dienstNaam: "Knippen",
    duurMin: 30,
    prijsCent: null,
    medewerkerId: "m1",
    medewerkerNaam: "Sanne",
    start: "2026-11-13T08:30:00Z", // 09:30 in Nederland
    eind: "2026-11-13T09:00:00Z",
    klant: { naam: "Piet Jansen", email: "piet@voorbeeld.nl", telefoon: "06 1234 5678" } as Afspraak["klant"],
    opmerking: "",
    status: "bevestigd",
    bron: "online",
    gemaaktOp: "2026-11-12T08:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
  m.instellingen = { actief: true };
  m.afspraken = [];
  m.tussen.mockClear();
  m.dismissed = new Set();
  m.roles = ["HQ_ADMIN"];
});
afterEach(() => vi.useRealTimers());

describe("afsprakenBelItems", () => {
  it("een online boeking wordt een melding in het Nederlands, met Nederlandse tijd en zonder klantgegevens", () => {
    const [item, ...rest] = afsprakenBelItems([afspraak()], NU);
    expect(rest).toHaveLength(0);
    expect(item).toMatchObject({ id: "afspraak:2026-11-13~abc123", kind: "shift", title: "Nieuwe afspraak", body: "Knippen op vrijdag 13 november om 09:30", href: "/werkgever/afspraken", at: "2026-11-12T08:00:00Z", urgent: false });
    expect(JSON.stringify(item)).not.toMatch(/Piet|voorbeeld|06 1234/);
  });

  it("zomertijd en wintertijd: 22:30 UTC in de zomer is 00:30 de volgende dag", () => {
    const zomer = new Date("2026-07-01T09:00:00+02:00");
    const [item] = afsprakenBelItems([afspraak({ start: "2026-07-02T22:30:00Z", eind: "2026-07-02T23:00:00Z", gemaaktOp: "2026-07-01T06:00:00Z" })], zomer);
    expect(item?.body).toBe("Knippen op vrijdag 3 juli om 00:30");
  });

  it("geen melding voor een afspraak aan de balie, een geannuleerde, een oude boeking of een afspraak die al voorbij is", () => {
    const uit = afsprakenBelItems(
      [
        afspraak({ bron: "balie" }),
        afspraak({ status: "geannuleerd" }),
        afspraak({ status: "geweest" }),
        afspraak({ gemaaktOp: "2026-11-08T08:00:00Z" }),
        afspraak({ start: "2026-11-12T07:00:00Z", eind: "2026-11-12T07:30:00Z" }),
      ],
      NU,
    );
    expect(uit).toEqual([]);
  });

  it("de nieuwste boeking staat bovenaan", () => {
    const uit = afsprakenBelItems([afspraak({ id: "2026-11-13~oud000", gemaaktOp: "2026-11-11T08:00:00Z" }), afspraak({ id: "2026-11-13~nieuw00", gemaaktOp: "2026-11-12T08:30:00Z" })], NU);
    expect(uit.map((i) => i.id)).toEqual(["afspraak:2026-11-13~nieuw00", "afspraak:2026-11-13~oud000"]);
  });
});

describe("afsprakenBelVoor", () => {
  it("een organisatie zonder actieve boekpagina vraagt geen afspraken op", async () => {
    m.instellingen = null;
    expect(await afsprakenBelVoor("t1", NU)).toEqual([]);
    m.instellingen = { actief: false };
    expect(await afsprakenBelVoor("t1", NU)).toEqual([]);
    expect(m.tussen).not.toHaveBeenCalled();
  });

  it("kijkt van vandaag (Nederlandse dag) tot 14 dagen vooruit", async () => {
    m.afspraken = [afspraak()];
    expect(await afsprakenBelVoor("t1", NU)).toHaveLength(1);
    expect(m.tussen).toHaveBeenCalledWith("t1", "2026-11-12", "2026-11-26");
  });
});

describe("de bel zelf", () => {
  const principal = { userId: "u1", grants: [] } as never;

  it("de beheerder ziet de nieuwe afspraak in zijn bel", async () => {
    m.afspraken = [afspraak()];
    const lijst = await getNotifications(principal);
    expect(lijst.find((i) => i.id === "afspraak:2026-11-13~abc123")).toMatchObject({ title: "Nieuwe afspraak", href: "/werkgever/afspraken", kind: "shift" });
  });

  it("een weggeklikte (gelezen) afspraak verdwijnt zoals elke andere melding", async () => {
    m.afspraken = [afspraak()];
    m.dismissed = new Set(["afspraak:2026-11-13~abc123|Knippen op vrijdag 13 november om 09:30"]);
    expect((await getNotifications(principal)).some((i) => i.id.startsWith("afspraak:"))).toBe(false);
  });

  it("een teamlid zonder beheerdersrol krijgt de melding niet", async () => {
    m.roles = ["LOCAL_MANAGER"];
    m.afspraken = [afspraak()];
    expect((await getNotifications(principal)).some((i) => i.id.startsWith("afspraak:"))).toBe(false);
    expect(m.tussen).not.toHaveBeenCalled();
  });
});
