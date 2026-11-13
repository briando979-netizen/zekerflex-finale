import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// De foto's en gegevens van Stripe-controles naar ZekerFlex kopiëren (14 nov 2026). Nooit id_number, een BSN of het volledige
// documentnummer; idempotent; per foto fail-soft; de bewaartermijn blijft die van de oorspronkelijke controle.

const h = vi.hoisted(() => ({
  row: null as unknown,
  writes: [] as unknown[][],
  uploads: [] as string[],
  sessie: null as unknown,
  rapport: null as unknown,
  sessieFout: null as unknown,
  sessieVragen: 0,
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    identityVerification: { findUnique: async () => h.row },
    $executeRaw: async (_s: TemplateStringsArray, ...waarden: unknown[]) => (h.writes.push(waarden), 1),
  },
}));
vi.mock("@/lib/storage/local", () => ({
  storeUpload: async (i: { filename: string }) => (h.uploads.push(i.filename), { id: `upl_${h.uploads.length}` }),
}));
vi.mock("@/lib/kyc/stripe-fotos", () => ({
  stripeFotoClient: async () => null,
  stripeFout: () => "Stripe is nu niet bereikbaar.",
  haalStripeBestand: async () => ({ ok: true, bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }),
}));

import { kopieerStripeControle } from "@/lib/kyc/stripe-kopie";
import { behoudKopie, kopieAf, kopieDocument, kopieRegel, kopieStand, kopieUitslag, metKopie, stripeDatum, type StripeKopie } from "@/lib/kyc/stripe-kopie-vorm";
import { stripeKopieTodo } from "@/lib/admin/todo-stripe-kopie";
import { documentHash } from "@/lib/kyc/document-hash";

const NUMMER = "SPECI2014";
const BSN = "999999990";
const rapport = {
  id: "vr_1",
  document: {
    type: "id_card",
    issuing_country: "NL",
    first_name: "Willeke Liselotte",
    last_name: "De Bruijn",
    status: "verified",
    files: ["file_voor", "file_achter"],
  },
  selfie: { selfie: "file_selfie", document: "file_pasfoto" },
  // bestaat bij Stripe, mag NOOIT mee
  id_number: { id_number: BSN, id_number_type: "nl_bsn" },
};
const detail = { ...rapport, document: { ...rapport.document, number: NUMMER, dob: { day: 10, month: 3, year: 1965 }, expiration_date: { day: 9, month: 3, year: 2031 } } };
const stripe = {
  identity: {
    verificationSessions: {
      retrieve: async () => {
        h.sessieVragen += 1;
        if (h.sessieFout) throw h.sessieFout;
        return h.sessie;
      },
    },
    verificationReports: { retrieve: async (_id: string, opt: { expand: string[] }) => (expect(opt.expand.join(" ")).not.toMatch(/id_number/), h.rapport) },
  },
} as never;

beforeEach(() => {
  h.row = { id: "iv1", userId: "u1", provider: "STRIPE_IDENTITY", sessionId: "vs_1", rawPayload: { provider: "STRIPE_IDENTITY", sessionId: "vs_1", nameOk: true } };
  h.writes.length = 0;
  h.uploads.length = 0;
  h.sessie = { id: "vs_1", status: "verified", last_verification_report: rapport };
  h.rapport = detail;
  h.sessieFout = null;
  h.sessieVragen = 0;
});

describe("welke gegevens mee mogen", () => {
  it("alleen de toegestane velden; het nummer los (voor hash en laatste 3), id_number nooit", () => {
    const { document, nummer } = kopieDocument(detail);
    expect(document).toEqual({
      soort: "ID_CARD",
      land: "NL",
      voornamen: "Willeke Liselotte",
      achternaam: "De Bruijn",
      geboortedatum: "1965-03-10",
      vervaldatum: "2031-03-09",
      nummerEind: "014",
    });
    expect(nummer).toBe(NUMMER);
    expect(JSON.stringify(document)).not.toContain(BSN);
    expect(JSON.stringify(document)).not.toContain(NUMMER);
  });

  it("datums en soorten: onzin of onbekend wordt null", () => {
    expect(stripeDatum({ day: 31, month: 13, year: 2000 })).toBeNull();
    expect(stripeDatum({ day: 1, month: 1 })).toBeNull();
    expect(kopieDocument({ document: { type: "constructor" } }).document?.soort).toBeNull();
    expect(kopieDocument(null)).toEqual({ document: null, nummer: null });
    expect(kopieUitslag({ status: "verified" }, { document: { status: "unverified", error: { code: "document_expired" } } })).toEqual({ sessie: "verified", document: "unverified", fout: "document_expired" });
  });

  it("samenvoegen: wat er stond blijft, een bestaande foto wordt nooit vervangen; de sync behoudt de kopie", () => {
    const kopie: StripeKopie = { at: "2026-11-14T08:00:00.000Z", sessieId: "vs_1", document: null, uitslag: { sessie: "verified", document: null, fout: null }, ontbreekt: { back: "geen achterkant" } };
    const raw = metKopie({ reason: "x", uploadIds: { front: "oud" } }, { front: "nieuw", selfie: "s1" }, kopie);
    expect(raw).toMatchObject({ reason: "x", uploadIds: { front: "oud", selfie: "s1" } });
    expect(kopieAf(raw)).toBe(true);
    expect(kopieStand(raw).kopie?.sessieId).toBe("vs_1");
    expect(behoudKopie(raw)).toEqual({ uploadIds: { front: "oud", selfie: "s1" }, stripeKopie: kopie });
    expect(behoudKopie({ reason: "x" })).toEqual({});
    expect(kopieAf({ uploadIds: { front: "a" } })).toBe(false);
  });

  it("de regel in Beheer", () => {
    const kopie: StripeKopie = {
      at: "2026-11-14T08:00:00.000Z",
      sessieId: "vs_1",
      document: { soort: "ID_CARD", land: "NL", voornamen: "Willeke", achternaam: "De Bruijn", geboortedatum: "1965-03-10", vervaldatum: "2031-03-09", nummerEind: "014" },
      uitslag: { sessie: "verified", document: "verified", fout: null },
      ontbreekt: {},
    };
    expect(kopieRegel(kopie, { datumTijd: () => "14 nov 09:00", datum: (d) => d })).toBe(
      "Uit Stripe, gekopieerd op 14 nov 09:00 · Willeke De Bruijn · geboren 1965-03-10 · NL · geldig tot 2031-03-09 · nummer eindigt op 014 · Stripe: verified. ",
    );
  });
});

describe("kopieerStripeControle", () => {
  it("drie foto's en de gegevens, zonder id_number of volledig nummer; het nummer alleen als hash", async () => {
    const uit = await kopieerStripeControle("iv1", stripe);
    expect(uit).toMatchObject({ gekopieerd: 3, overgeslagen: false, redenen: [] });
    expect(h.uploads).toEqual(["stripe-voorkant.jpg", "stripe-achterkant.jpg", "stripe-selfie.jpg"]);
    const [payload, hash, soort] = h.writes[0] ?? [];
    const raw = JSON.parse(String(payload)) as Record<string, unknown>;
    expect(raw).toMatchObject({ nameOk: true, uploadIds: { front: "upl_1", back: "upl_2", selfie: "upl_3" } });
    expect(String(payload)).not.toContain(BSN);
    expect(String(payload)).not.toContain(NUMMER);
    expect(String(payload)).not.toContain("id_number");
    expect(hash).toBe(documentHash(NUMMER));
    expect(soort).toBe("ID_CARD");
  });

  it("een tweede keer kopieert niets dubbel", async () => {
    await kopieerStripeControle("iv1", stripe);
    h.row = { ...(h.row as object), rawPayload: JSON.parse(String(h.writes[0]?.[0])) };
    h.sessieVragen = 0;
    const uit = await kopieerStripeControle("iv1", stripe);
    expect(uit.overgeslagen).toBe(true);
    expect(h.sessieVragen).toBe(0);
    expect(h.uploads).toHaveLength(3);
  });

  it("een paspoort zonder achterkant: een reden, geen fout", async () => {
    h.sessie = { id: "vs_1", status: "verified", last_verification_report: { ...rapport, document: { ...rapport.document, type: "passport", files: ["file_voor"] } } };
    const uit = await kopieerStripeControle("iv1", stripe);
    expect(uit.gekopieerd).toBe(2);
    expect(uit.redenen.join(" ")).toMatch(/Achterkant/);
    const raw = JSON.parse(String(h.writes[0]?.[0])) as { stripeKopie: StripeKopie };
    expect(raw.stripeKopie.ontbreekt.back).toBeTruthy();
    expect(kopieAf(raw)).toBe(true);
  });

  it("al opgeschoond (na 30 dagen): geen selfie en geen persoonsgegevens meer, wel voor- en achterkant", async () => {
    h.row = { id: "iv1", userId: "u1", provider: "STRIPE_IDENTITY", sessionId: "vs_1", rawPayload: { opgeschoond: true } };
    const uit = await kopieerStripeControle("iv1", stripe);
    expect(h.uploads).toEqual(["stripe-voorkant.jpg", "stripe-achterkant.jpg"]);
    expect(uit.redenen.join(" ")).toMatch(/selfie/i);
    const [payload, hash] = h.writes[0] ?? [];
    expect((JSON.parse(String(payload)) as { stripeKopie: StripeKopie }).stripeKopie.document).toBeNull();
    expect(hash).toBeNull();
  });

  it("Stripe onbereikbaar: een reden, niets geschreven", async () => {
    h.sessieFout = Object.assign(new Error("x"), { type: "StripeConnectionError" });
    const uit = await kopieerStripeControle("iv1", stripe);
    expect(uit.redenen).toEqual(["Stripe is nu niet bereikbaar."]);
    expect(h.writes).toHaveLength(0);
  });
});

describe("eigenaar-taak en bewakers", () => {
  it("de taak telt de kopieën en vinkt af als alles er is", () => {
    expect(stripeKopieTodo(null)).toBeNull();
    expect(stripeKopieTodo({ totaal: 0, af: 0 })).toBeNull();
    const open = stripeKopieTodo({ totaal: 25, af: 3 });
    expect(open?.done).toBe(false);
    expect(open?.title).toContain("3 van 25");
    expect(open?.how.join(" ")).toContain("37.97.226.24");
    expect(open?.how.join(" ")).toContain("All Detailed Verification Results");
    expect(stripeKopieTodo({ totaal: 25, af: 25 })?.done).toBe(true);
  });

  it("de Stripe-sync bewaart de kopie bij elke schrijfactie, en de beeldroute geeft de kopie voorrang", () => {
    const sync = readFileSync("lib/kyc/stripe-identity.ts", "utf8");
    expect(sync.match(/\.\.\.behoudKopie\(row\.rawPayload\)/g)).toHaveLength(2);
    const route = readFileSync("app/api/admin/gebruikers/[id]/identiteit/[checkId]/beeld/route.ts", "utf8");
    expect(route).toContain('const bron = kopieId ? (check.provider === "STRIPE_IDENTITY" ? "stripe-kopie" : "eigen")');
  });

  it("de kopie raakt updatedAt niet (de bewaartermijn) en vraagt nooit id_number op", () => {
    const kopie = readFileSync("lib/kyc/stripe-kopie.ts", "utf8");
    expect(kopie).toContain('UPDATE "IdentityVerification"');
    expect(kopie).not.toMatch(/"updatedAt"\s*=/);
    expect(kopie).not.toMatch(/expand:[^\n]*id_number/);
  });
});
