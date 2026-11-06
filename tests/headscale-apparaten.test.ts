import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { HEADSCALE_API_URL: "", HEADSCALE_API_KEY: "" } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));

import { hoortBij, vpnGebruikersnaam, type HsNode } from "@/lib/netwerk/headscale";

// 6 nov: `/node?user=<id>` gaf 500 op onze Headscale-versie (vier keer in het
// foutenlogboek) terwijl `/node` zonder filter prima werkt. We halen nu alles
// op en filteren zelf, dus dit hulpje moet kloppen.

const gebruiker = { id: "2", name: "zf-abc123" };

describe("welk apparaat hoort bij welk bedrijf", () => {
  it("herkent het apparaat op de naam van de gebruiker", () => {
    const n: HsNode = { id: "7", user: { id: "2", name: "zf-abc123" } };
    expect(hoortBij(n, gebruiker)).toBe(true);
  });

  it("herkent het ook als alleen het nummer meekomt, ook als getal", () => {
    expect(hoortBij({ id: "7", user: { id: 2 } }, gebruiker)).toBe(true);
    expect(hoortBij({ id: "7", user: { id: "2" } }, gebruiker)).toBe(true);
  });

  it("laat het apparaat van een ander bedrijf staan", () => {
    expect(hoortBij({ id: "8", user: { id: "3", name: "zf-xyz" } }, gebruiker)).toBe(false);
  });

  it("zonder gebruiker hoort het nergens bij", () => {
    expect(hoortBij({ id: "9" }, gebruiker)).toBe(false);
    expect(hoortBij({ id: "9", user: null }, gebruiker)).toBe(false);
    expect(hoortBij({ id: "9", user: {} }, gebruiker)).toBe(false);
  });

  it("de gebruikersnaam per bedrijf blijft veilig voor een URL", () => {
    expect(vpnGebruikersnaam("cmVz_LEC19/001a")).toMatch(/^zf-[a-z0-9-]+$/);
  });
});
