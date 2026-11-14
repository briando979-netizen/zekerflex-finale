import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HANDMATIG_BETAALBAAR, handmatigMelding, kanHandmatigBetaald } from "@/lib/billing/overschrijving-betaald-kern";

// Een factuur die per bankoverschrijving is betaald met de hand op betaald zetten (14 nov). Alleen een open factuur voor
// platformkosten: bij andere soorten hangt er een uitbetaling, loon, een claim of een domeinverlenging aan de betaling.

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

describe("de handeling", () => {
  const src = bron("lib/billing/overschrijving-betaald.ts");

  it("zet alleen een factuur om die nog open staat, in één stap (geen dubbele boeking)", () => {
    expect(src).toContain('prisma.invoice.updateMany({ where: { id: factuur.id, status: "ISSUED" }, data: { status: "PAID", paidAt: nu } })');
    expect(src).toContain("if (gezet.count !== 1) throw AppError.conflict(");
    // eerst de regel, dan pas schrijven
    expect(src.indexOf("kanHandmatigBetaald(factuur)")).toBeLessThan(src.indexOf("updateMany("));
  });

  it("zelfde afhandeling als Stripe voor deze soort, en het staat in het auditlogboek wie het meldde", () => {
    expect(src).toContain("await settleClawbacks(factuur.id)");
    expect(src).toContain('action: "invoice.paid"');
    expect(src).toContain("actorUserId,");
    expect(src).toContain('metadata: { via: "overschrijving" }');
    // geen uitbetaling, claim of domeinverlenging vanuit deze weg
    expect(src).not.toMatch(/payOnClientPayment|fulfillPaidClaim|domeinFactuurBetaald/);
  });
});

describe("de route en het scherm", () => {
  it("alleen de platformbeheerder", () => {
    const route = bron("app/api/admin/facturen/betaald/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g) ?? []).toHaveLength(1);
    expect(route).not.toMatch(/export (const|async function) (GET|PUT|DELETE)/);
  });

  it("het scherm vraagt eerst of het geld er echt staat, en staat op Weg naar winst", () => {
    const paneel = bron("components/admin/BetaaldMeldenPaneel.tsx");
    expect(paneel.indexOf("window.confirm(")).toBeLessThan(paneel.indexOf("fetch("));
    expect(paneel).toContain("alleen bij een open factuur voor platformkosten");
    expect(bron("app/admin/winstplan/page.tsx")).toContain("<BetaaldMeldenPaneel />");
  });
});
