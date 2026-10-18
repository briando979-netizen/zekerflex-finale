import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = {
  client_cancelled: "De opdrachtgever heeft de klus afgezegd",
  sick: "Ik was ziek / kon niet",
  no_show_client: "Ter plekke was er geen werk of niemand aanwezig",
  other: "Andere reden",
} as const;

const schema = z.object({ reason: z.enum(Object.keys(REASONS) as [keyof typeof REASONS, ...(keyof typeof REASONS)[]]), note: z.string().trim().max(500).default("") });

// POST /api/timesheets/:id/not-worked — the freelancer says this klus wasn't
// worked. Nothing about pay or penalties changes automatically (that has
// consequences either way); ZekerFlex gets it straight away to settle it.
//   key "timesheet-not-worked:<id>"
export async function POST(request: Request, props: { params: Promise<{ timesheetId: string }> }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    const { timesheetId } = await props.params;
    const { reason, note } = schema.parse(await request.json().catch(() => ({})));
    const ts = await prisma.timesheet.findFirst({
      where: { id: timesheetId, freelancer: { userId: principal.userId } },
      select: { id: true, status: true, scheduledStart: true, branch: { select: { name: true, tenant: { select: { name: true } } } } },
    });
    if (!ts) throw AppError.notFound("Urenbriefje niet gevonden");
    if (ts.status !== "DRAFT") throw AppError.precondition("Deze uren zijn al ingediend");
    const key = `timesheet-not-worked:${ts.id}`;
    if (await kvGet(key)) return NextResponse.json({ ok: true, duplicate: true });
    await kvSet(key, { reason, note, by: principal.userId, at: new Date().toISOString() });
    const summary = `${principal.fullName} meldt: niet gewerkt bij ${ts.branch.tenant.name} (${ts.branch.name}) op ${ts.scheduledStart.toLocaleString("nl-NL")} — ${REASONS[reason]}${note ? `: ${note}` : ""}`;
    await recordAudit({ category: "TIMESHEET", action: "timesheet.not_worked", actorUserId: principal.userId, summary, targetType: "timesheet", targetId: ts.id });
    await sendMail({ to: env.MAIL_ADMIN, subject: `Niet gewerkt gemeld — ${ts.branch.tenant.name}`, text: `${summary}\n\nUrenbriefje: ${ts.id}\nHandel af in de admin (annulering / no-show / uren op nul).`, kind: "timesheet-not-worked" }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
