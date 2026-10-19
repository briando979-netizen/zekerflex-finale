import { beforeEach, describe, expect, it, vi } from "vitest";

const kv = vi.hoisted(() => new Map<string, unknown>());
const m = vi.hoisted(() => ({
  invoices: [] as Record<string, unknown>[],
  findMany: vi.fn(),
  members: [] as { user: { email: string } }[],
  billingEmail: "facturen@super.nl" as string | undefined,
  mail: vi.fn(),
  alert: vi.fn(),
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findMany: (...a: unknown[]) => (m.findMany(...a), m.invoices) },
    membership: { findMany: async () => m.members },
  },
}));
vi.mock("@/lib/profile/store", () => ({ getOrgProfileExtra: async () => (m.billingEmail ? { billingEmail: m.billingEmail } : {}) }));
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => m.mail(...a) }));
vi.mock("@/lib/ops/alert", () => ({ alertOwner: (...a: unknown[]) => m.alert(...a) }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { overdueInvoices, runInvoiceReminders, stageFor } from "@/lib/billing/reminders";

const DAY = 86_400_000;
const issued = new Date("2026-10-01T09:00:00Z"); // due 15 Oct (14 days)
const inv = (id: string, totalCents = 10_000, tenant = "t1") => ({ id, number: `F-${id}`, totalCents, dueAt: null, issuedAt: issued, createdAt: issued, recipientTenantId: tenant, recipientTenant: { name: tenant === "t1" ? "Super BV" : "Bakker BV" } });
const at = (daysAfterDue: number) => new Date(issued.getTime() + (14 + daysAfterDue) * DAY);

beforeEach(() => {
  kv.clear();
  kv.set("invoice-reminders:settings", { enabled: true });
  m.invoices = [inv("a"), inv("b", 5_000)];
  m.members = [{ user: { email: "hq@super.nl" } }];
  m.billingEmail = "facturen@super.nl";
  m.findMany.mockReset();
  m.mail.mockReset().mockResolvedValue({ ok: true });
  m.alert.mockReset().mockResolvedValue("sent");
});

describe("reminder schedule", () => {
  it("does nothing until the owner switches automatic reminders on", async () => {
    kv.set("invoice-reminders:settings", { enabled: false });
    expect(await runInvoiceReminders(at(5))).toMatchObject({ disabled: true, mailed: 0 });
    kv.delete("invoice-reminders:settings");
    expect(await runInvoiceReminders(at(5))).toMatchObject({ disabled: true });
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("stages: +3 days, +10 days, +17 days after the due date", () => {
    const due = new Date("2026-10-15T09:00:00Z");
    expect(stageFor(due, new Date(due.getTime() + 2 * DAY))).toBe(0);
    expect(stageFor(due, new Date(due.getTime() + 3 * DAY))).toBe(1);
    expect(stageFor(due, new Date(due.getTime() + 10 * DAY))).toBe(2);
    expect(stageFor(due, new Date(due.getTime() + 40 * DAY))).toBe(3);
  });

  it("only looks at open client invoices (never cancellation penalties)", async () => {
    await runInvoiceReminders(at(1));
    const where = (m.findMany.mock.calls[0]![0] as { where: { status: string; type: { in: string[] } } }).where;
    expect(where.status).toBe("ISSUED");
    expect(where.type.in).not.toContain("CANCELLATION_PENALTY");
  });

  it("nothing before +3 days", async () => {
    expect(await runInvoiceReminders(at(2))).toMatchObject({ mailed: 0, escalated: 0 });
    expect(m.mail).not.toHaveBeenCalled();
  });

  it("+3 days: ONE mail per company listing every open invoice with a permanent pay link; not repeated the same day", async () => {
    expect(await runInvoiceReminders(at(3))).toMatchObject({ mailed: 1 });
    expect(m.mail).toHaveBeenCalledTimes(1);
    const mail = m.mail.mock.calls[0]![0] as { to: string; subject: string; text: string; kind: string };
    expect(mail).toMatchObject({ to: "facturen@super.nl", kind: "invoice-reminder" });
    expect(mail.subject).toContain("2 facturen");
    expect(mail.text).toContain("F-a");
    expect(mail.text).toContain("F-b");
    expect(mail.text).toMatch(/\/betaal\/a\.[A-Za-z0-9_-]{22}/);
    await runInvoiceReminders(at(4));
    expect(m.mail).toHaveBeenCalledTimes(1);
  });

  it("+10 days: second reminder mentions the waiting flexworkers; +17 days: the owner is alerted, no third mail", async () => {
    await runInvoiceReminders(at(3));
    await runInvoiceReminders(at(10));
    expect(m.mail).toHaveBeenCalledTimes(2);
    expect((m.mail.mock.calls[1]![0] as { text: string }).text).toContain("flexwerkers");
    expect(await runInvoiceReminders(at(17))).toMatchObject({ mailed: 0, escalated: 1 });
    expect(m.alert).toHaveBeenCalledWith(expect.objectContaining({ key: "invoice-overdue:t1", severity: "warning", url: "/admin/facturen" }));
    expect(m.mail).toHaveBeenCalledTimes(2);
  });

  it("an invoice that is already very late when first seen still gets both reminders before any escalation", async () => {
    m.invoices = [inv("c")];
    expect(await runInvoiceReminders(at(30))).toMatchObject({ mailed: 1, escalated: 0 });
    expect(await runInvoiceReminders(at(31))).toMatchObject({ mailed: 1, escalated: 0 });
    expect((m.mail.mock.calls[1]![0] as { subject: string }).subject).toContain("Tweede herinnering");
    expect(await runInvoiceReminders(at(32))).toMatchObject({ mailed: 0, escalated: 1 });
    expect(m.alert).toHaveBeenCalledTimes(1);
  });

  it("no billing address → mails the company's HQ admins", async () => {
    m.billingEmail = undefined;
    await runInvoiceReminders(at(3));
    expect(m.mail).toHaveBeenCalledWith(expect.objectContaining({ to: "hq@super.nl" }));
  });

  it("overdue list reports days late and reminder progress", async () => {
    await runInvoiceReminders(at(3));
    const list = await overdueInvoices(at(5));
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ daysLate: 5, stage: 1, tenantName: "Super BV" });
  });
});
