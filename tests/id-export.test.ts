import { describe, expect, it } from "vitest";
import { idControleVoorExport } from "@/lib/privacy/id-export";

const VERBODEN = ["rawPayload", "documentNumberHash", "id_number", "mrz", "bsnHash", "bsnVoorstelHash", "bsn", "chip", "sodHash"];

function sleutels(v: unknown, uit: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => sleutels(x, uit));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      uit.push(k);
      sleutels(x, uit);
    }
  }
  return uit;
}

describe("idControleVoorExport", () => {
  it("neemt de gegevens van een Stripe-kopie mee", () => {
    const uit = idControleVoorExport({
      provider: "STRIPE",
      status: "VERIFIED",
      decisionStatus: "verified",
      documentType: "PASSPORT",
      createdAt: new Date("2026-11-01T10:00:00+01:00"),
      verifiedAt: new Date("2026-11-01T10:05:00+01:00"),
      rawPayload: {
        uploadIds: { front: "u1", back: "u2", selfie: "u3" },
        stripeKopie: {
          at: "2026-11-13T09:00:00+01:00",
          sessieId: "vs_123",
          document: { soort: "PASSPORT", land: "NL", voornamen: "Jan", achternaam: "de Vries", geboortedatum: "1990-02-03", vervaldatum: "2031-05-06", nummerEind: "A1B" },
          uitslag: { sessie: "verified", document: "verified", fout: null },
          ontbreekt: {},
        },
      },
    });
    expect(uit).toMatchObject({
      aanbieder: "STRIPE",
      status: "VERIFIED",
      uitslag: "verified",
      documentsoort: "PASSPORT",
      land: "NL",
      naam: "Jan de Vries",
      geboortedatum: "1990-02-03",
      vervaldatum: "2031-05-06",
      nummerEindigtOp: "A1B",
      foto: { voorkant: true, achterkant: true, selfie: true, selfieVerwijderd: false },
    });
  });

  it("neemt de gegevens van de eigen scan mee, zonder chip en zonder BSN", () => {
    const uit = idControleVoorExport({
      provider: "READID",
      status: "VERIFIED",
      documentType: "ID_CARD",
      expiresAt: new Date("2030-01-01T00:00:00+01:00"),
      rawPayload: {
        opgeschoond: true,
        document: { naam: "Piet Jansen", uitDeCode: true, nummerEind: "XY7" },
        chip: { echt: true, sodHash: "geheim", ds: "x" },
        uploadIds: { front: "u1" },
      },
    });
    expect(uit.naam).toBe("Piet Jansen");
    expect(uit.nummerEindigtOp).toBe("XY7");
    expect(uit.geboortedatum).toBeNull();
    expect(uit.vervaldatum).toEqual(new Date("2030-01-01T00:00:00+01:00"));
    expect(uit.foto).toEqual({ voorkant: true, achterkant: false, selfie: false, selfieVerwijderd: true });
    expect(JSON.stringify(uit)).not.toContain("geheim");
  });

  it("bevat nooit een verboden sleutel, ook niet genest (rij vol verboden velden)", () => {
    const uit = idControleVoorExport({
      provider: "READID",
      status: "VERIFIED",
      documentNumberHash: "h1",
      bsnHash: "h2",
      bsnVoorstelHash: "h3",
      id_number: "123456782",
      mrz: "P<NLD...",
      rawPayload: {
        id_number: "123456782",
        mrz: "P<NLD<<<<",
        bsn: "123456782",
        documentNumberHash: "h1",
        document: { naam: "A B", nummerEind: "123", id_number: "123456782", mrz: "x", bsn: "123456782" },
        stripeKopie: { document: { voornamen: "A", achternaam: "B", id_number: "123456782", number: "NP1234567", mrz: "x" }, uitslag: {} },
        chip: { sodHash: "s" },
        gezichtsDrempel: 0.42,
        teamNotitie: "intern",
      },
    } as never);
    const sl = sleutels(uit);
    for (const v of VERBODEN) expect(sl).not.toContain(v);
    const json = JSON.stringify(uit);
    for (const w of ["123456782", "NP1234567", "h1", "h2", "h3", "intern", "P<NLD"]) expect(json).not.toContain(w);
    expect(uit.nummerEindigtOp).toBe("123");
  });

  it("geeft nummerEindigtOp nooit langer dan vier tekens", () => {
    const uit = idControleVoorExport({ rawPayload: { stripeKopie: { document: { nummerEind: "NP1234567" } } } });
    expect(uit.nummerEindigtOp).toBe("4567");
  });

  it("kan met een lege of vreemde rij om", () => {
    expect(idControleVoorExport({}).naam).toBeNull();
    expect(idControleVoorExport({ rawPayload: "tekst" }).foto.voorkant).toBe(false);
  });
});
