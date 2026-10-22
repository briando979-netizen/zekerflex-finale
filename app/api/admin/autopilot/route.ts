import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { ACTIONS } from "@/lib/autopilot/actions";
import { getSettings, optedInTenants, readLog, saveSettings } from "@/lib/autopilot/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/autopilot — actions, settings, live log.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [settings, log, tenants] = await Promise.all([getSettings(), readLog(120), optedInTenants()]);
  return NextResponse.json({
    settings,
    actions: ACTIONS.map(({ key, label, description, tier, cap }) => ({ key, label, description, tier, cap })),
    log,
    consentTenants: tenants.length,
  });
});

const schema = z.object({ enabled: z.boolean(), disabled: z.array(z.string().max(60)).max(50) });

// POST /api/admin/autopilot — switch the autopilot or single actions on/off.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const input = schema.parse(await request.json().catch(() => ({})));
  const known = new Set(ACTIONS.map((a) => a.key));
  await saveSettings({ enabled: input.enabled, disabled: input.disabled.filter((k) => known.has(k)) });
  await recordAudit({
    category: "ORCHESTRATION",
    action: "autopilot.settings",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} zette de autopilot ${input.enabled ? "aan" : "uit"}${input.disabled.length ? ` (uit: ${input.disabled.join(", ")})` : ""}`,
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
