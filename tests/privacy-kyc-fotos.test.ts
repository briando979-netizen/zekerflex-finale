import { describe, expect, it } from "vitest";
import { isOpgeschoond, kycOpschonen, kycUploadIds } from "@/lib/privacy/kyc-fotos";

// Na 30 dagen gaan de selfies (biometrie) weg; voor- en achterkant blijven gekoppeld, anders vindt het wissen van het
// account (lib/privacy/anonymize.ts) die bestanden niet meer terug en blijven ze voorgoed staan.

const payload = {
  uploadIds: { front: "up_voor", back: "up_achter", selfie: "up_selfie", selfie2: "up_selfie2" },
  checks: [{ label: "Naam komt overeen", ok: true }],
  gezicht: { score: 0.59 },
  document: { naam: "TEST PERSOON", nummerEind: "12" },
};

describe("kycOpschonen", () => {
  it("geeft de selfies om te wissen en houdt alleen de koppeling van voor- en achterkant", () => {
    const { selfies, nieuwePayload } = kycOpschonen(payload);
    expect(selfies).toEqual(["up_selfie", "up_selfie2"]);
    expect(nieuwePayload).toEqual({ opgeschoond: true, uploadIds: { front: "up_voor", back: "up_achter" } });
    // niets persoonlijks meer in de nieuwe payload
    expect(JSON.stringify(nieuwePayload)).not.toMatch(/TEST PERSOON|score|checks/);
  });

  it("een controle zonder foto's krijgt alleen de markering", () => {
    expect(kycOpschonen({})).toEqual({ selfies: [], nieuwePayload: { opgeschoond: true } });
    expect(kycOpschonen(null)).toEqual({ selfies: [], nieuwePayload: { opgeschoond: true } });
    expect(kycOpschonen({ uploadIds: "kapot" })).toEqual({ selfies: [], nieuwePayload: { opgeschoond: true } });
  });

  it("een paspoort zonder tweede selfie: alleen de ene selfie weg", () => {
    expect(kycOpschonen({ uploadIds: { front: "a", back: "b", selfie: "c" } }).selfies).toEqual(["c"]);
  });
});

describe("isOpgeschoond en kycUploadIds", () => {
  it("herkent een opgeschoonde controle, zodat de nachtelijke ronde hem overslaat", () => {
    expect(isOpgeschoond(payload)).toBe(false);
    expect(isOpgeschoond(kycOpschonen(payload).nieuwePayload)).toBe(true);
    expect(isOpgeschoond("x")).toBe(false);
  });

  it("geeft alle foto-id's, ook na het opschonen nog voor- en achterkant", () => {
    expect(kycUploadIds(payload)).toEqual(["up_voor", "up_achter", "up_selfie", "up_selfie2"]);
    expect(kycUploadIds(kycOpschonen(payload).nieuwePayload)).toEqual(["up_voor", "up_achter"]);
    expect(kycUploadIds({ uploadIds: { front: 3, back: "" } })).toEqual([]);
  });
});
