import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { servedModels } from "@/lib/ai/client";
import { bouwerInstellingen, zetBouwerInstellingen } from "@/lib/bouwer/werker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bouwer → Instellingen: welk model programmeert, en de GitHub-sleutel waarmee
// hij goedgekeurd werk naar main pusht (versleuteld in de KV, nooit terug te lezen).

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [instellingen, modellen] = await Promise.all([bouwerInstellingen(), servedModels().catch(() => [] as string[])]);
  return NextResponse.json({ ...instellingen, modellen });
});

const schema = z.object({
  model: z.string().trim().max(120).regex(/^[\w.:/-]*$/).nullable().optional(),
  githubToken: z
    .string()
    .trim()
    .regex(/^(github_pat_|ghp_)[A-Za-z0-9_]{20,250}$/, "Dit lijkt geen GitHub-sleutel (begint met github_pat_ of ghp_)")
    .nullable()
    .optional(),
});

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Controleer de invoer");
  const { model, githubToken } = parsed.data;

  await zetBouwerInstellingen({
    ...(model !== undefined ? { model: model || null } : {}),
    ...(githubToken !== undefined ? { githubToken } : {}),
  });
  await recordAudit({
    category: "ADMIN",
    action: "admin.bouwer.instellingen",
    severity: githubToken !== undefined ? "warning" : "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} wijzigde de Bouwer-instellingen${model !== undefined ? ` (model: ${model || "standaard"})` : ""}${
      githubToken !== undefined ? (githubToken ? " (GitHub-sleutel ingesteld)" : " (GitHub-sleutel verwijderd)") : ""
    }`,
  });
  return NextResponse.json(await bouwerInstellingen());
});
