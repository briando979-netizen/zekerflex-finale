import { beforeEach, describe, expect, it, vi } from "vitest";

// De Offerte-AI en de tegenbiedingen van freelancers delen het voorvoegsel "offer:" in de
// KeyValueStore. Elke kant mag alleen zijn eigen records zien en wijzigen.

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (key: string) => store.get(key) ?? null,
  kvSet: async (key: string, value: unknown) => void store.set(key, value),
  kvListValues: async (prefix: string) => [...store.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));

const { listOffers, getOffer, setOfferStatus: setSalesOfferStatus } = await import("@/lib/sales/offers");
const { listCounterOffers, setOfferStatus: setCounterOfferStatus } = await import("@/lib/offers/store");

const salesOffer = {
  id: "abc123def0",
  at: "2026-10-30T10:00:00.000Z",
  isOffer: true,
  confidence: 0.9,
  company: "Bakkerij Jansen",
  contactName: null,
  behoefte: "2 verkopers",
  aantal: "2",
  locatie: "Utrecht",
  periode: null,
  functietype: null,
  samenvatting: "Zoekt twee verkopers voor december.",
  draftReply: "Beste…",
  fromName: null,
  fromAddress: "info@bakkerij.test",
  subject: "Personeel",
  leadId: null,
  status: "nieuw",
};
const counterOffer = {
  id: "fed456cba0",
  at: "2026-10-31T09:00:00.000Z",
  userId: "usr_1",
  freelancerName: "Sam",
  shiftId: "shift_1",
  shiftTitle: "Bediening",
  branch: "Amsterdam",
  listedRateCents: 1800,
  proposedRateCents: 2000,
  note: "",
  status: "pending",
  respondedAt: null,
};

beforeEach(() => {
  store.clear();
  store.set(`offer:${salesOffer.id}`, { ...salesOffer });
  store.set(`offer:${counterOffer.id}`, { ...counterOffer });
  store.set("offer:seen:205", { at: "2026-10-30T23:56:52.125Z" });
});

describe("offertes en tegenbiedingen blijven gescheiden", () => {
  it("de Offerte-AI ziet alleen eigen aanvragen", async () => {
    const offers = await listOffers();
    expect(offers.map((o) => o.id)).toEqual([salesOffer.id]);
  });

  it("de tegenbiedingen zien alleen tegenbiedingen", async () => {
    const offers = await listCounterOffers();
    expect(offers.map((o) => o.id)).toEqual([counterOffer.id]);
  });

  it("de Offerte-AI kan de status van een tegenbod niet overschrijven", async () => {
    expect(await getOffer(counterOffer.id)).toBeNull();
    expect(await setSalesOfferStatus(counterOffer.id, "beantwoord")).toBeNull();
    expect((store.get(`offer:${counterOffer.id}`) as { status: string }).status).toBe("pending");
  });

  it("een tegenbod-actie kan een offerteaanvraag niet overschrijven", async () => {
    expect(await setCounterOfferStatus(salesOffer.id, "accepted")).toBeNull();
    expect((store.get(`offer:${salesOffer.id}`) as { status: string }).status).toBe("nieuw");
  });
});
