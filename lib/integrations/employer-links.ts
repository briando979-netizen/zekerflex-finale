import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvDelete, kvGet, kvSet } from "@/lib/storage/kv";
import { assertSafeWebhookUrl } from "@/lib/webhooks/manage";

// ---------------------------------------------------------------------------
// No-code integrations for companies (Werkgever → Integraties), next to the
// developer API + webhooks:
//   - Agenda-feed: a secret iCal URL with the company's diensten (+ who is
//     coming) that Google Agenda / Outlook / Apple Agenda subscribe to.
//   - Slack/Teams: short messages in the company's own channel on events.
//   - CSV exports of approved hours and invoices (accounting/salaris software).
// ---------------------------------------------------------------------------

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/* ───────────────────────────── agenda-feed ───────────────────────────── */

const calKey = (tenantId: string) => `cal-feed:${tenantId}`;
const calLookup = (token: string) => `cal-feed-token:${sha(token)}`;

export async function calendarToken(tenantId: string, rotate = false): Promise<string> {
  const existing = await kvGet<string>(calKey(tenantId));
  if (existing && !rotate) return existing;
  if (existing) await kvDelete(calLookup(existing));
  const token = randomBytes(24).toString("base64url");
  await kvSet(calKey(tenantId), token);
  await kvSet(calLookup(token), tenantId);
  return token;
}

export async function tenantForCalendarToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return kvGet<string>(calLookup(token));
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** iCalendar (RFC 5545) with the company's diensten from a week ago to 90 days ahead. */
export async function calendarIcs(tenantId: string, siteUrl: string): Promise<string> {
  const now = Date.now();
  const shifts = await prisma.shift.findMany({
    where: {
      branch: { tenantId },
      status: { not: "DRAFT" },
      startsAt: { gte: new Date(now - 7 * 864e5), lte: new Date(now + 90 * 864e5) },
    },
    select: {
      id: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      positions: true,
      updatedAt: true,
      branch: { select: { name: true, addressLine: true, city: true } },
      assignments: { where: { cancelledAt: null }, select: { freelancer: { select: { user: { select: { fullName: true } } } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 2000,
  });
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ZekerFlex//Diensten//NL", "CALSCALE:GREGORIAN", "X-WR-CALNAME:ZekerFlex diensten", "X-PUBLISHED-TTL:PT1H"];
  for (const s of shifts) {
    const names = s.assignments.map((a) => a.freelancer.user.fullName);
    const filled = `${names.length}/${s.positions} ingevuld`;
    const desc = [filled, names.length ? `Komt: ${names.join(", ")}` : "Nog niemand ingepland", `${siteUrl}/werkgever/diensten/${s.id}`].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@zekerflex.com`,
      `DTSTAMP:${stamp(s.updatedAt)}`,
      `DTSTART:${stamp(s.startsAt)}`,
      `DTEND:${stamp(s.endsAt)}`,
      `SUMMARY:${esc(`${s.title} (${filled})`)}`,
      `LOCATION:${esc([s.branch.name, s.branch.addressLine, s.branch.city].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${esc(desc)}`,
      `STATUS:${s.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  // RFC 5545 line folding at 75 octets
  return lines.map((l) => (l.length <= 75 ? l : l.match(/.{1,74}/g)!.join("\r\n "))).join("\r\n") + "\r\n";
}

/* ─────────────────────────── Slack / Teams ─────────────────────────── */

export const CHAT_HOOK_EVENTS = [
  { key: "shift.matched", label: "Iemand is ingepland" },
  { key: "freelancer.checked_in", label: "Iemand is ingecheckt" },
  { key: "timesheet.approved", label: "Uren goedgekeurd" },
  { key: "invoice.issued", label: "Nieuwe factuur" },
  { key: "dispute.opened", label: "Afwijking/geschil" },
] as const;
export type ChatHookEvent = (typeof CHAT_HOOK_EVENTS)[number]["key"];

export interface ChatHook {
  url: string;
  kind: "slack" | "teams" | "other";
  events: ChatHookEvent[];
}

const hookKey = (tenantId: string) => `chat-hook:${tenantId}`;

function hookKind(url: string): ChatHook["kind"] {
  const host = new URL(url).hostname;
  if (host === "hooks.slack.com") return "slack";
  if (host.endsWith(".webhook.office.com") || host.endsWith(".logic.azure.com") || host.endsWith("powerplatform.com")) return "teams";
  return "other";
}

export async function getChatHook(tenantId: string): Promise<ChatHook | null> {
  return kvGet<ChatHook>(hookKey(tenantId));
}

export async function setChatHook(tenantId: string, url: string, events: ChatHookEvent[]): Promise<ChatHook> {
  const safe = assertSafeWebhookUrl(url);
  const hook: ChatHook = { url: safe, kind: hookKind(safe), events };
  await kvSet(hookKey(tenantId), hook);
  return hook;
}

export async function removeChatHook(tenantId: string): Promise<void> {
  await kvDelete(hookKey(tenantId));
}

async function postText(hook: ChatHook, text: string): Promise<boolean> {
  const res = await fetch(hook.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(6000),
  });
  return res.ok;
}

export async function testChatHook(tenantId: string): Promise<boolean> {
  const hook = await getChatHook(tenantId);
  if (!hook) return false;
  return postText(hook, "✅ ZekerFlex is gekoppeld. Hier verschijnen voortaan meldingen over je diensten.").catch(() => false);
}

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

async function describe(event: ChatHookEvent, p: Record<string, unknown>, siteUrl: string): Promise<string> {
  const name = async (freelancerId: unknown) =>
    typeof freelancerId === "string"
      ? (await prisma.freelancerProfile.findUnique({ where: { id: freelancerId }, select: { user: { select: { fullName: true } } } }))?.user.fullName ?? "Een kracht"
      : "Een kracht";
  const tsInfo = async (timesheetId: unknown) =>
    typeof timesheetId === "string"
      ? await prisma.timesheet.findUnique({
          where: { id: timesheetId },
          select: { assignment: { select: { shift: { select: { id: true, title: true } } } }, freelancer: { select: { user: { select: { fullName: true } } } } },
        })
      : null;
  switch (event) {
    case "shift.matched": {
      const shift = typeof p.shiftId === "string" ? await prisma.shift.findUnique({ where: { id: p.shiftId }, select: { title: true } }) : null;
      return `👤 ${await name(p.freelancerId)} is ingepland voor *${shift?.title ?? "een dienst"}*. ${siteUrl}/werkgever/diensten/${String(p.shiftId ?? "")}`;
    }
    case "freelancer.checked_in": {
      const t = await tsInfo(p.timesheetId);
      return `📍 ${t?.freelancer.user.fullName ?? "Een kracht"} is ingecheckt bij *${t?.assignment.shift.title ?? "een dienst"}*${p.withinGeofence === false ? " (buiten de locatie!)" : ""}.`;
    }
    case "timesheet.approved": {
      const t = await tsInfo(p.timesheetId);
      const min = typeof p.billableMinutes === "number" ? ` (${(p.billableMinutes / 60).toFixed(1).replace(".", ",")} uur)` : "";
      return `✅ Uren goedgekeurd: ${t?.freelancer.user.fullName ?? "een kracht"} — *${t?.assignment.shift.title ?? "dienst"}*${min}.`;
    }
    case "invoice.issued":
      return `🧾 Nieuwe factuur ${String(p.number ?? "")}${typeof p.totalCents === "number" ? ` van ${euro(p.totalCents)}` : ""}. ${siteUrl}/werkgever/facturen`;
    case "dispute.opened": {
      const t = await tsInfo(p.timesheetId);
      return `⚠️ Afwijking bij *${t?.assignment.shift.title ?? "een dienst"}* (${t?.freelancer.user.fullName ?? "kracht"}) — bekijk het in ZekerFlex: ${siteUrl}/werkgever/uren`;
    }
  }
}

/** Called from dispatchWebhook for every event. Never throws. */
export async function postToChatHook(event: string, tenantId: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const hook = await getChatHook(tenantId);
    if (!hook || !hook.events.includes(event as ChatHookEvent)) return;
    const site = (process.env.APP_BASE_URL ?? "https://www.zekerflex.com").replace(/\/+$/, "");
    await postText(hook, await describe(event as ChatHookEvent, payload, site));
  } catch (err) {
    logger.warn("chat hook post failed", { tenantId, event, error: (err as Error).message });
  }
}

/* ───────────────────────────── CSV exports ───────────────────────────── */

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // guard against spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
/** Semicolon-separated + BOM: opens correctly in Dutch Excel. */
function toCsv(rows: unknown[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
const nlDate = (d: Date | null) => (d ? d.toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" }) : "");
const nlTime = (d: Date | null) => (d ? d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }) : "");
const amount = (c: number | null | undefined) => (typeof c === "number" ? (c / 100).toFixed(2).replace(".", ",") : "");

export async function hoursCsv(tenantId: string, from: Date, to: Date): Promise<string> {
  const rows = await prisma.timesheet.findMany({
    where: { branch: { tenantId }, status: { in: ["APPROVED", "PAID"] }, scheduledStart: { gte: from, lt: to } },
    select: {
      scheduledStart: true,
      scheduledEnd: true,
      billableMinutes: true,
      hourlyRateCents: true,
      status: true,
      approvedAt: true,
      branch: { select: { name: true } },
      assignment: { select: { shift: { select: { title: true } } } },
      freelancer: { select: { user: { select: { fullName: true } } } },
    },
    orderBy: { scheduledStart: "asc" },
    take: 20000,
  });
  return toCsv([
    ["Datum", "Begin", "Eind", "Kracht", "Dienst", "Vestiging", "Uren", "Uurtarief (EUR)", "Bedrag (EUR)", "Status", "Goedgekeurd op"],
    ...rows.map((r) => {
      const hours = (r.billableMinutes ?? 0) / 60;
      return [
        nlDate(r.scheduledStart),
        nlTime(r.scheduledStart),
        nlTime(r.scheduledEnd),
        r.freelancer.user.fullName,
        r.assignment.shift.title,
        r.branch.name,
        hours.toFixed(2).replace(".", ","),
        amount(r.hourlyRateCents),
        amount(Math.round(hours * (r.hourlyRateCents ?? 0))),
        r.status === "PAID" ? "Betaald" : "Goedgekeurd",
        nlDate(r.approvedAt),
      ];
    }),
  ]);
}

export async function invoicesCsv(tenantId: string, from: Date, to: Date): Promise<string> {
  const rows = await prisma.invoice.findMany({
    where: { recipientTenantId: tenantId, issuedAt: { gte: from, lt: to } },
    select: { number: true, type: true, status: true, issuedAt: true, paidAt: true, subtotalCents: true, vatCents: true, totalCents: true, vatRate: true },
    orderBy: { issuedAt: "asc" },
    take: 20000,
  });
  const TYPE: Record<string, string> = { PLATFORM_FEE: "Platformkosten", SELF_BILL_FREELANCER: "Dienst (freelancer)", CANCELLATION_PENALTY: "Annulering", UITZEND_FEE: "Uitzendkracht" };
  return toCsv([
    ["Factuurnummer", "Soort", "Factuurdatum", "Bedrag excl. btw (EUR)", "Btw %", "Btw (EUR)", "Totaal (EUR)", "Status", "Betaald op"],
    ...rows.map((r) => [
      r.number,
      TYPE[r.type] ?? r.type,
      nlDate(r.issuedAt),
      amount(r.subtotalCents),
      Math.round(r.vatRate * 100),
      amount(r.vatCents),
      amount(r.totalCents),
      r.status,
      nlDate(r.paidAt),
    ]),
  ]);
}
