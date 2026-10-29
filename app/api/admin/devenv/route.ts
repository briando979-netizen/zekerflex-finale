import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getDevEnvConfig, setDevEnvConfig } from "@/lib/devenv/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json(await getDevEnvConfig());
});

const schema = z.object({ codeServerUrl: z.string().max(300), terminalUrl: z.string().max(300) });

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Controleer de ingevulde URL's");

  await setDevEnvConfig(parsed.data);
  await recordAudit({
    category: "ADMIN",
    action: "admin.devenv.updated",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} wijzigde de ontwikkelomgeving-links`,
  });

  return NextResponse.json({ ok: true });
});
