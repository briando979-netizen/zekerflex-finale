import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const fpUpdate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique }, freelancerProfile: { update: fpUpdate } } }));
vi.mock("@/lib/env", () => ({ env: { STRIPE_SECRET_KEY: "sk_test", APP_BASE_URL: "https://www.zekerflex.com" } }));
vi.mock("@/lib/billing/stripe", () => ({ getStripeClient: vi.fn() }));
const setFiscal = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: vi.fn(), setFiscal }));
const kvGet = vi.fn();
const kvSet = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/storage/kv", () => ({ kvGet, kvSet, kvDelete: vi.fn() }));
const recordAudit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit }));

const { banknaamPast, naamGelijk } = await import("@/lib/kyc/naam-match");
const { getBankLogin, namesMatch } = await import("@/lib/kyc/bank-login");

describe("banknaamPast: zo schrijven banken de naam", () => {
  it.each([
    // echte gevallen uit het auditspoor (8 en 9 nov)
    ["Briando van Essen", "B. van Essen"],
    ["Briando van Essen", "VAN ESSEN B"],
    ["b van Essen", "B. van Essen"],
    ["Nilay Necip Demir", "N NECIP"],
    // gebruikelijke vormen
    ["Jan de Vries", "J. DE VRIES"],
    ["Jan de Vries", "DE VRIES J"],
    ["Jan de Vries", "JAN DE VRIES"],
    ["Ioana Popescu", "HR/MW I POPESCU"],
    ["Zoë Müller", "ZOE MULLER"],
    ["Bram van den Berg", "B V/D BERG"],
    ["Bram van den Berg", "B.J. VAN DEN BERG"],
    ["Bas van Essen", "J.B. VAN ESSEN"], // roepnaam Bas, voorletters J.B.
    ["Briando van Essen", "B VAN ESSEN EN/OF M JANSEN"],
    ["Briando van Essen", "M JANSEN E/O B VAN ESSEN"],
    // achternaam aaneen of met spatie/koppelteken (9 nov: "El Bouti" tegenover "Elbouti")
    ["Bilal Elbouti", "B. El Bouti"],
    ["Bilal Elbouti", "B EL-BOUTI"],
    ["Bilal El Bouti", "B ELBOUTI"],
  ])("%s ↔ bank %s", (profiel, bank) => {
    expect(banknaamPast(profiel, bank)).toBe(true);
  });

  it.each([
    ["Jan de Vries", "P. JANSEN"], // andere achternaam
    ["Jan de Vries", "P DE VRIES"], // zelfde achternaam, andere voorletter
    ["Jan de Vries", "JAN JANSEN"], // alleen de voornaam klopt
    ["Nilay Necip Demir", "K DEMIR"], // familielid
    ["Briando van Essen", "VAN B"], // alleen een tussenvoegsel
    ["", "B. van Essen"],
  ])("%s ↔ bank %s past niet", (profiel, bank) => {
    expect(banknaamPast(profiel, bank)).toBe(false);
  });
});

describe("naamGelijk: dezelfde naam, andere schrijfwijze", () => {
  it.each([
    ["Bilal Elbouti", "Bilal El Bouti"],
    ["El Bouti", "Elbouti"],
    ["El Bouti", "EL-BOUTI"],
    ["Zoë Müller", "ZOE MULLER"],
    ["Jan de Vries", "Vries, Jan de"],
    ["Jan de Vries", "Jan Vries"],
    ["Jan d'Hont", "Jan Dhont"],
  ])("%s = %s", (a, b) => {
    expect(naamGelijk(a, b)).toBe(true);
  });

  it.each([
    ["Jan de Vries", "P. Jansen"],
    ["Jan de Vries", "Piet de Vries"],
    ["Jan de Vries", "Jan Jansen"],
    ["Bilal Elbouti", "Bilal Bouti Ahmed"],
    // dezelfde letters, ander mens: de regel sorteert nooit letters
    ["Jan Smit", "Tim Jans"],
    ["Ben Lam", "Mel Nab"],
    ["", "Jan de Vries"],
  ])("%s ≠ %s", (a, b) => {
    expect(naamGelijk(a, b)).toBe(false);
  });
});

describe("namesMatch gebruikt de nieuwe regel", () => {
  it("accepteert wat eerst onterecht werd afgekeurd", () => {
    expect(namesMatch("Nilay Necip Demir", "N NECIP")).toBe(true);
    expect(namesMatch("Briando van Essen", "VAN ESSEN B")).toBe(true);
  });
});

describe("eerdere afwijzing op alleen de naam wordt opnieuw beoordeeld", () => {
  const afgewezen = {
    status: "mismatch" as const,
    verifiedName: "N NECIP",
    ibanLast4: "1234",
    bank: "ing",
    problems: ["name" as const],
    at: "2026-11-09T12:13:00+01:00",
    sessionId: "cs_test_1234567890",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wordt alsnog geverifieerd als de naam nu past, met audit en zonder betaalblokkade", async () => {
    kvGet.mockResolvedValueOnce({ ...afgewezen });
    findUnique.mockResolvedValueOnce({ fullName: "Nilay Necip Demir" });
    const rec = await getBankLogin("u1");
    expect(rec?.status).toBe("verified");
    expect(rec?.problems).toEqual([]);
    expect(kvSet).toHaveBeenCalledWith("bank-login:u1", expect.objectContaining({ status: "verified" }));
    expect(fpUpdate).toHaveBeenCalled();
    expect(setFiscal).toHaveBeenCalledWith("u1", { ibanPendingVerification: false });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "bank.login_verified" }));
  });

  it("blijft afgewezen als de naam echt niet past", async () => {
    kvGet.mockResolvedValueOnce({ ...afgewezen, verifiedName: "P JANSEN" });
    findUnique.mockResolvedValueOnce({ fullName: "Nilay Necip Demir" });
    const rec = await getBankLogin("u1");
    expect(rec?.status).toBe("mismatch");
    expect(kvSet).not.toHaveBeenCalled();
  });

  it("raakt een afwijzing op het IBAN niet aan", async () => {
    kvGet.mockResolvedValueOnce({ ...afgewezen, problems: ["iban"] });
    const rec = await getBankLogin("u1");
    expect(rec?.status).toBe("mismatch");
    expect(findUnique).not.toHaveBeenCalled();
  });
});
