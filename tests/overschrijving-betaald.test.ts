import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HANDMATIG_BETAALBAAR, bedragKlopt, bedragMelding, bedragNaarCents, handmatigMelding, kanHandmatigBetaald } from "@/lib/billing/overschrijving-betaald-kern";
import { OVERSCHRIJVING_UITLEG, overschrijvingRegels } from "@/lib/billing/overschrijving";

// Een factuur die per bankoverschrijving is betaald met de hand op betaald zetten (14 nov). Alleen een open factuur voor
// platformkosten, alleen met het hele factuurbedrag, en eerst zien van welk bedrijf de factuur is.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const open = { type: "PLATFORM_FEE", status: "ISSUED", totalCents: 4235 };

describe("welke factuur mag", () => {
  it("een open factuur voor platformkosten met een bedrag", () => {
    expect(kanHandmatigBetaald(open)).toEqual({ ok: true });
    expect([...HANDMATIG_BETAALBAAR]).toEqual(["PLATFORM_FEE"]);
  });

  it("al betaald, niet open, zonder bedrag: nee, met de juiste reden", () => {
    expect(kanHandmatigBetaald({ ...open, status: "PAID" })).toEqual({ ok: false, reden: "al-betaald" });
    for (const status of ["DRAFT", "CANCELLED", "LATE", ""]) expect(kanHandmatigBetaald({ ...open, status })).toEqual({ ok: false, reden: "niet-open" });
    for (const totalCents of [0, -5, Number.NaN]) expect(kanHandmatigBetaald({ ...open, totalCents })).toEqual({ ok: false, reden: "bedrag" });
  });

  it("geen enkele soort waar een uitbetaling of levering aan hangt", () => {
    for (const type of ["SELF_BILL_FREELANCER", "UITZEND_FEE", "CANCELLATION_PENALTY", "DOMEIN", "constructor", ""]) expect(kanHandmatigBetaald({ ...open, type }), type).toEqual({ ok: false, reden: "soort" });
    // precies de soorten waar de Stripe-afhandeling iets extra's doet
    const webhook = bron("app/api/webhooks/stripe/route.ts");
    for (const soort of ["SELF_BILL_FREELANCER", "CANCELLATION_PENALTY", "DOMEIN"]) {
      expect(webhook).toContain(`InvoiceType.${soort}`);
      expect(HANDMATIG_BETAALBAAR).not.toContain(soort);
    }
  });

  it("elke weigering heeft een melding in gewone taal met het factuurnummer", () => {
    for (const reden of ["al-betaald", "niet-open", "soort", "bedrag"] as const) {
      const t = handmatigMelding(reden, "ZF-2026-0001");
      expect(t).toContain("ZF-2026-0001");
      expect(t.endsWith(".")).toBe(true);
    }
  });
});

describe("het ontvangen bedrag", () => {
  it("overtypen van het afschrift, in elke gewone schrijfwijze", () => {
    expect(bedragNaarCents("42,35")).toBe(4235);
    expect(bedragNaarCents("42.35")).toBe(4235);
    expect(bedragNaarCents("€ 42,35")).toBe(4235);
    expect(bedragNaarCents("42")).toBe(4200);
    expect(bedragNaarCents("42,5")).toBe(4250);
    expect(bedragNaarCents("1.234,50")).toBe(123450);
    expect(bedragNaarCents("1,234.50")).toBe(123450);
    expect(bedragNaarCents("1.234")).toBe(123400);
    for (const v of ["", "  ", "gratis", ",", "0", "-5", null, undefined, 42, {}]) expect(bedragNaarCents(v), String(v)).toBeNull();
  });

  it("alleen precies het factuurbedrag sluit de factuur: geen deel, geen meer, geen leeg veld", () => {
    expect(bedragKlopt(4235, 4235)).toBe(true);
    for (const ontvangen of [4234, 4236, 2000, 0, null, 42.35]) expect(bedragKlopt(ontvangen, 4235), String(ontvangen)).toBe(false);
    expect(bedragMelding("ZF-2026-0001", 4235)).toContain("€ 42,35");
    expect(bedragMelding("ZF-2026-0001", 4235)).toContain("blijft hij open");
  });
});

describe("de handeling", () => {
  const src = bron("lib/billing/overschrijving-betaald.ts");
  const zet = src.slice(src.indexOf("export async function meldBetaaldPerOverschrijving("));

  it("eerst de regels en het bedrag, dan pas schrijven, in één stap op 'nog open' (geen dubbele boeking)", () => {
    expect(zet).toContain('prisma.invoice.updateMany({ where: { id: factuur.id, status: "ISSUED" }, data: { status: "PAID", paidAt: nu } })');
    expect(zet).toContain("if (gezet.count !== 1) throw AppError.conflict(");
    expect(zet.indexOf("await zoek(nummer)")).toBeLessThan(zet.indexOf("bedragKlopt(ontvangenCents, factuur.totalCents)"));
    expect(zet.indexOf("bedragKlopt(ontvangenCents, factuur.totalCents)")).toBeLessThan(zet.indexOf("updateMany("));
    expect(src).toContain("const mag = kanHandmatigBetaald(factuur);");
  });

  it("bekijken schrijft niets en geeft alleen het nummer, het bedrijf en het bedrag", () => {
    const bekijk = src.slice(src.indexOf("export async function bekijkTeBetalen("), src.indexOf("export async function meldBetaaldPerOverschrijving("));
    expect(bekijk).not.toMatch(/update|create|delete|recordAudit/);
    expect(bekijk).toContain("return { number: f.number, bedrijf: f.recipientTenant?.name ?? null, totalCents: f.totalCents };");
  });

  it("zelfde afhandeling als Stripe voor deze soort, en het staat in het auditlogboek wie het meldde", () => {
    expect(zet).toContain("await settleClawbacks(factuur.id)");
    expect(zet).toContain('action: "invoice.paid"');
    expect(zet).toContain("actorUserId,");
    expect(zet).toContain('metadata: { via: "overschrijving", bedragCents: factuur.totalCents }');
    // geen uitbetaling, claim of domeinverlenging vanuit deze weg
    expect(src).not.toMatch(/payOnClientPayment|fulfillPaidClaim|domeinFactuurBetaald/);
  });
});

describe("een tweede betaling via Stripe gaat niet stil voorbij", () => {
  const webhook = bron("app/api/webhooks/stripe/route.ts");
  const blok = webhook.slice(webhook.indexOf("async function markInvoicePaid("), webhook.indexOf("/** Decrements variant stock"));

  it("een andere betaling op een factuur die al betaald is: waarschuwing in het logboek en een melding aan de eigenaar", () => {
    expect(blok).toContain("stripePaymentIntentId: true,");
    expect(blok).toContain("if (!dezeBetaling || dezeBetaling !== invoice.stripePaymentIntentId) {");
    expect(blok).toContain('logger.warn("stripe webhook: betaling voor een factuur die al betaald is", { invoiceId: invoice.id, eventType });');
    expect(blok).toContain("key: `dubbele-betaling:${invoice.id}`,");
    expect(blok).toContain("alertOwnerLater({");
  });

  it("dezelfde betaling nog een keer (Stripe stuurt soms dubbel) geeft geen melding, en er staan geen kaart- of persoonsgegevens in", () => {
    const melding = blok.slice(blok.indexOf("} else {"));
    expect(melding).toContain("dezeBetaling !== invoice.stripePaymentIntentId");
    expect(melding).not.toMatch(/customer_details|email|card|last4|recipient|fullName/);
    // de melding noemt alleen het factuurnummer
    expect(melding).toContain("voor factuur ${invoice.number}");
  });
});

describe("eerlijke tekst", () => {
  it("de factuur en de betaalpagina beloven geen automatische koppeling met de bank", () => {
    expect([...OVERSCHRIJVING_UITLEG]).toEqual([
      "Zet het factuurnummer bij de omschrijving.",
      "Zodra wij je betaling op onze rekening zien, koppelen we hem aan deze factuur en zetten we de factuur op betaald.",
      "Dat kan een of twee werkdagen duren.",
    ]);
    const regels = overschrijvingRegels({ naam: "Voorbeeld", iban: "NL91ABNA0417164300", ibanLeesbaar: "NL91 ABNA 0417 1643 00", kenmerk: "ZF-1", bedragCents: 4235 });
    expect(regels.slice(-3)).toEqual([...OVERSCHRIJVING_UITLEG]);
    expect(regels.join(" ")).not.toContain("vanzelf");
    const pagina = bron("app/betaal/[token]/page.tsx");
    expect(pagina).toContain('{OVERSCHRIJVING_UITLEG.join(" ")}');
    expect(pagina).not.toContain("vanzelf");
  });

  it("het paneel zegt dat de knop niet in de boekhouding boekt", () => {
    const paneel = bron("components/admin/BetaaldMeldenPaneel.tsx");
    expect(paneel).toContain("Deze knop boekt de betaling niet in de boekhouding");
    expect(paneel).toContain("alleen met het hele factuurbedrag");
  });
});

describe("de route en het scherm", () => {
  it("alleen de platformbeheerder; bekijken en zetten zijn twee stappen", () => {
    const route = bron("app/api/admin/facturen/betaald/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g) ?? []).toHaveLength(1);
    expect(route).not.toMatch(/export (const|async function) (GET|PUT|DELETE)/);
    expect(route).toContain('actie: z.enum(["bekijk", "zet"])');
    expect(route).toContain("meldBetaaldPerOverschrijving(d.nummer, bedragNaarCents(d.bedrag), principal.userId)");
  });

  it("het scherm toont eerst het bedrijf en het bedrag; de knop om te zetten staat er pas daarna", () => {
    const paneel = bron("components/admin/BetaaldMeldenPaneel.tsx");
    expect(paneel).toContain("{gevonden ? (");
    expect(paneel.indexOf("{gevonden ? (")).toBeLessThan(paneel.indexOf('void doe("zet")'));
    // een ander nummer intypen = opnieuw controleren
    expect(paneel).toContain("setGevonden(null);");
    expect(bron("app/admin/winstplan/page.tsx")).toContain("<BetaaldMeldenPaneel />");
  });
});
