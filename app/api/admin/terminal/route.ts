import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { runConsoleCommand } from "@/lib/console/commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/terminal — voert één veilig, read-only console-commando uit
// (geen shell; vaste set, zie lib/console/commands.ts). Losstaand van de
// natuurlijke-taal admin-console op /api/admin/console.
const schema = z.object({ command: z.string().max(500) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldig commando");

  const { output, ok } = await runConsoleCommand(parsed.data.command, {
    userId: principal.userId,
    email: principal.email,
    fullName: principal.fullName,
  });

  return NextResponse.json({ output, ok });
});
