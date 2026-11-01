import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = structuredClone(v)),
}));

type Row = { id: string; number: string; status: string; totalCents: number; recipientTenantId: string; stripePaymentIntentId: string | null; paidAt?: Date | null; dueAt?: Date | null; payment: { status: string } | null };
const rows = new Map<string, Row>();
const shopFindUnique = vi.fn(async (..._a: unknown[]): Promise<{ id: string; status: string } | null> => null);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: {
      findMany: async ({ where }: { where: { stripePaymentIntentId?: string; id?: { in: string[] } } }) =>
        [...rows.values()].filter((r) => (where.id ? where.id.in.includes(r.id) : r.stripePaymentIntentId === where.stripePaymentIntentId)),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.get(where.id)!, data),
    },
    shopOrder: { findUnique: (...a: unknown[]) => shopFindUnique(...a) },
  },
}));
vi.mock("@prisma/client", () => ({ InvoiceStatus: { PAID: "PAID", ISSUED: "ISSUED", CANCELLED: "CANCELLED" } }));
const recordAudit = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
const alertOwner = vi.fn(async (..._a: unknown[]) => "sent");
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => alertOwner(...a) }));
const resetInvoiceReminders = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/lib/billing/reminders", () => ({ resetInvoiceReminders: (...a: unknown[]) => resetInvoiceReminders(...a) }));

import { invoicesOnHold, listClawbacks, openExposureCents, recordChargeRefund, recordDisputeClosed, recordDisputeOpened, setClawbackStatus, settleClawbacks } from "@/lib/billing/clawback";

function invoice(id: string, totalCents: number, opts: { pi?: string; workerPaid?: boolean } = {}): Row {
  const row: Row = { id, number: `F-${id}`, status: "PAID", totalCents, recipientTenantId: "t1", stripePaymentIntentId: opts.pi ?? `pi_${id}`, paidAt: new Date(), dueAt: null, payment: { status: opts.workerPaid ? "SETTLED" : "PENDING" } };
  rows.set(id, row);
  return row;
}
const refund = (pi: string, amountRefunded: number, full: boolean, id = "ch_1") =>
  ({ id, payment_intent: pi, amount_refunded: amountRefunded, refunded: full }) as Stripe.Charge;
const dispute = (pi: string, amount: number, status: Stripe.Dispute.Status = "needs_response", id = "dp_1") =>
  ({ id, payment_intent: pi, amount, reason: "fraudulent", status, evidence_details: { due_by: 1_800_000_000 } }) as unknown as Stripe.Dispute;

beforeEach(() => rows.clear());
afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("volledige terugbetaling", () => {
  it("zet de factuur open, stuurt nog geen herinneringen en meldt het aan de eigenaar", async () => {
    invoice("a", 50_000, { workerPaid: true });
    await recordChargeRefund(refund("pi_a", 50_000, true));
    expect(rows.get("a")).toMatchObject({ status: "ISSUED", paidAt: null });
    expect(rows.get("a")!.dueAt!.getTime()).toBeGreaterThan(Date.now());
    expect(resetInvoiceReminders).toHaveBeenCalledWith("a");
    expect(await invoicesOnHold()).toEqual(new Set(["a"]));
    expect(await openExposureCents()).toBe(50_000);
    expect(alertOwner).toHaveBeenCalledOnce();
    expect(alertOwner.mock.calls[0]![0]).toMatchObject({ severity: "critical", url: "/admin/fraude" });
  });

  it("heeft geen voorgeschoten geld als de flexwerker nog niet betaald is", async () => {
    invoice("a", 30_000);
    await recordChargeRefund(refund("pi_a", 30_000, true));
    expect(await openExposureCents()).toBe(0);
    expect(alertOwner.mock.calls[0]![0]).toMatchObject({ severity: "warning" });
  });

  it("doet niets dubbel als Stripe dezelfde melding herhaalt", async () => {
    invoice("a", 30_000);
    await recordChargeRefund(refund("pi_a", 30_000, true));
    await recordChargeRefund(refund("pi_a", 30_000, true));
    expect(await listClawbacks()).toHaveLength(1);
    expect(alertOwner).toHaveBeenCalledOnce();
    expect(recordAudit).toHaveBeenCalledOnce();
  });

  it("zet bij een bulkbetaling alle facturen open, met één melding", async () => {
    invoice("a", 10_000, { pi: "pi_bulk" });
    invoice("b", 20_000, { pi: "pi_bulk" });
    await recordChargeRefund(refund("pi_bulk", 30_000, true));
    expect(rows.get("a")!.status).toBe("ISSUED");
    expect(rows.get("b")!.status).toBe("ISSUED");
    expect(await listClawbacks()).toHaveLength(2);
    expect(alertOwner).toHaveBeenCalledOnce();
    expect((alertOwner.mock.calls[0]![0] as { title: string }).title).toContain("2 facturen");
  });
});

describe("gedeeltelijke terugbetaling", () => {
  it("laat de factuur betaald, want opnieuw innen zou dubbel zijn", async () => {
    invoice("a", 50_000, { workerPaid: true });
    await recordChargeRefund(refund("pi_a", 1_000, false));
    expect(rows.get("a")!.status).toBe("PAID");
    expect(resetInvoiceReminders).not.toHaveBeenCalled();
    expect(await invoicesOnHold()).toEqual(new Set());
    expect(await openExposureCents()).toBe(1_000);
  });

  it("houdt één regel bij met het totaal als er nog een deel volgt", async () => {
    invoice("a", 50_000);
    await recordChargeRefund(refund("pi_a", 1_000, false));
    await recordChargeRefund(refund("pi_a", 3_000, false));
    const list = await listClawbacks();
    expect(list).toHaveLength(1);
    expect(list[0]!.amountCents).toBe(3_000);
    expect(alertOwner).toHaveBeenCalledTimes(2);
  });

  it("zet de factuur alsnog open als de rest ook wordt terugbetaald", async () => {
    invoice("a", 50_000);
    await recordChargeRefund(refund("pi_a", 1_000, false));
    await recordChargeRefund(refund("pi_a", 50_000, true));
    expect(rows.get("a")!.status).toBe("ISSUED");
    expect(await listClawbacks()).toHaveLength(1);
    expect((await listClawbacks())[0]).toMatchObject({ amountCents: 50_000, reopened: true });
  });
});

describe("betaalgeschil", () => {
  it("laat de factuur betaald zolang de bank beslist, en meldt de deadline", async () => {
    invoice("a", 50_000, { workerPaid: true });
    await recordDisputeOpened(dispute("pi_a", 50_000));
    expect(rows.get("a")!.status).toBe("PAID");
    expect(await openExposureCents()).toBe(50_000);
    const alert = alertOwner.mock.calls[0]![0] as { severity: string; detail: string; url: string };
    expect(alert).toMatchObject({ severity: "critical", url: "/admin/stripe" });
    expect(alert.detail).toContain("Reageer in Stripe");
  });

  it("telt een geschil één keer, ook als Stripe het herhaalt", async () => {
    invoice("a", 50_000, { workerPaid: true });
    await recordDisputeOpened(dispute("pi_a", 50_000));
    await recordDisputeOpened(dispute("pi_a", 50_000));
    expect(await listClawbacks()).toHaveLength(1);
    expect(await openExposureCents()).toBe(50_000);
    expect(alertOwner).toHaveBeenCalledOnce();
  });

  it("gewonnen: opgelost, factuur ongemoeid, niets meer voorgeschoten", async () => {
    invoice("a", 50_000, { workerPaid: true });
    await recordDisputeOpened(dispute("pi_a", 50_000));
    await recordDisputeClosed(dispute("pi_a", 50_000, "won"));
    expect(rows.get("a")!.status).toBe("PAID");
    expect((await listClawbacks())[0]!.status).toBe("opgelost");
    expect(await openExposureCents()).toBe(0);
    expect((alertOwner.mock.calls[1]![0] as { title: string }).title).toContain("gewonnen");
  });

  it("een waarschuwing die vanzelf sluit telt als gewonnen", async () => {
    invoice("a", 50_000);
    await recordDisputeOpened(dispute("pi_a", 50_000, "warning_needs_response"));
    await recordDisputeClosed(dispute("pi_a", 50_000, "warning_closed"));
    expect(rows.get("a")!.status).toBe("PAID");
    expect((await listClawbacks())[0]!.status).toBe("opgelost");
  });

  it("verloren: de factuur gaat open en wordt opnieuw geïnd, zonder wachten op de eigenaar", async () => {
    invoice("a", 50_000, { workerPaid: true });
    await recordDisputeOpened(dispute("pi_a", 50_000));
    await recordDisputeClosed(dispute("pi_a", 50_000, "lost"));
    expect(rows.get("a")!.status).toBe("ISSUED");
    expect(resetInvoiceReminders).toHaveBeenCalledWith("a");
    expect((await listClawbacks())[0]).toMatchObject({ status: "herincasso", reopened: true });
    expect(await invoicesOnHold()).toEqual(new Set());
    expect(await openExposureCents()).toBe(50_000);
    expect((alertOwner.mock.calls[1]![0] as { title: string }).title).toContain("verloren");
  });

  it("verloren op een deel van het bedrag: de factuur blijft betaald", async () => {
    invoice("a", 50_000);
    await recordDisputeOpened(dispute("pi_a", 5_000));
    await recordDisputeClosed(dispute("pi_a", 5_000, "lost"));
    expect(rows.get("a")!.status).toBe("PAID");
    expect((await listClawbacks())[0]).toMatchObject({ amountCents: 5_000, reopened: false, status: "open" });
    expect((alertOwner.mock.calls[1]![0] as { detail: string }).detail).toContain("verreken");
  });

  it("verwerkt de afloop één keer als Stripe die herhaalt", async () => {
    invoice("a", 50_000);
    await recordDisputeOpened(dispute("pi_a", 50_000));
    await recordDisputeClosed(dispute("pi_a", 50_000, "lost"));
    await recordDisputeClosed(dispute("pi_a", 50_000, "lost"));
    expect(alertOwner).toHaveBeenCalledTimes(2);
    expect(resetInvoiceReminders).toHaveBeenCalledOnce();
  });

  it("verwerkt een afloop waarvan de opening is gemist", async () => {
    invoice("a", 50_000);
    await recordDisputeClosed(dispute("pi_a", 50_000, "lost"));
    expect(rows.get("a")!.status).toBe("ISSUED");
    expect((await listClawbacks())[0]!.status).toBe("herincasso");
  });

  it("doet niets bij een afloop zonder uitkomst, zoals een terugbetaalde betaling", async () => {
    invoice("a", 50_000);
    await recordDisputeOpened(dispute("pi_a", 50_000));
    await recordDisputeClosed(dispute("pi_a", 50_000, "charge_refunded" as Stripe.Dispute.Status));
    expect(rows.get("a")!.status).toBe("PAID");
    expect((await listClawbacks())[0]!.status).toBe("open");
    expect(alertOwner).toHaveBeenCalledOnce();
  });
});

describe("betalingen zonder factuur", () => {
  it("meldt een onbekende terugbetaling", async () => {
    await recordChargeRefund(refund("pi_onbekend", 1_000, true));
    expect(await listClawbacks()).toHaveLength(0);
    expect(alertOwner.mock.calls[0]![0]).toMatchObject({ severity: "warning" });
  });

  it("meldt een onbekend geschil als kritiek, want het geld is weg", async () => {
    await recordDisputeOpened(dispute("pi_onbekend", 1_000));
    expect(alertOwner.mock.calls[0]![0]).toMatchObject({ severity: "critical" });
  });

  it("zwijgt over een terugbetaling die via Admin, Shop is gedaan", async () => {
    shopFindUnique.mockResolvedValueOnce({ id: "o1", status: "CANCELLED" });
    await recordChargeRefund(refund("pi_shop", 1_000, true));
    expect(alertOwner).not.toHaveBeenCalled();
  });

  it("waarschuwt als een shopbestelling buiten de admin om is terugbetaald", async () => {
    shopFindUnique.mockResolvedValueOnce({ id: "o1", status: "RECEIVED" });
    await recordChargeRefund(refund("pi_shop", 1_000, true));
    expect((alertOwner.mock.calls[0]![0] as { detail: string }).detail).toContain("shopbestelling o1");
  });
});

describe("keuze van de eigenaar en opnieuw betalen", () => {
  beforeEach(async () => {
    invoice("a", 50_000, { workerPaid: true });
    await recordChargeRefund(refund("pi_a", 50_000, true));
  });

  it("afschrijven annuleert de factuur en is terug te draaien", async () => {
    await setClawbackStatus("a", "afgeschreven");
    expect(rows.get("a")!.status).toBe("CANCELLED");
    expect(await openExposureCents()).toBe(0);
    await setClawbackStatus("a", "herincasso");
    expect(rows.get("a")!.status).toBe("ISSUED");
    expect((await listClawbacks())[0]!.resolvedAt).toBeNull();
  });

  it("geld is binnen zet de factuur op betaald", async () => {
    await setClawbackStatus("a", "opgelost");
    expect(rows.get("a")!.status).toBe("PAID");
    expect(rows.get("a")!.paidAt).toBeInstanceOf(Date);
  });

  it("opnieuw innen haalt de factuur van de wachtstand", async () => {
    await setClawbackStatus("a", "herincasso");
    expect(await invoicesOnHold()).toEqual(new Set());
    expect(rows.get("a")!.status).toBe("ISSUED");
  });

  it("opnieuw betalen lost de terugvordering op", async () => {
    await settleClawbacks("a");
    expect((await listClawbacks())[0]!.status).toBe("opgelost");
    expect(await openExposureCents()).toBe(0);
    expect(await invoicesOnHold()).toEqual(new Set());
  });
});

describe("een regel die de factuur niet opende", () => {
  it("laat de factuur met rust, wat de eigenaar ook kiest", async () => {
    invoice("a", 50_000);
    await recordChargeRefund(refund("pi_a", 1_000, false));
    await setClawbackStatus("a", "afgeschreven");
    expect(rows.get("a")!.status).toBe("PAID");
    await setClawbackStatus("a", "herincasso");
    expect(rows.get("a")!.status).toBe("PAID");
  });

  it("wordt niet opgelost door opnieuw betalen", async () => {
    invoice("a", 50_000);
    await recordDisputeOpened(dispute("pi_a", 50_000));
    await settleClawbacks("a");
    expect((await listClawbacks())[0]!.status).toBe("open");
  });
});
