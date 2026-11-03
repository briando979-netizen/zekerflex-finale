import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { bouwer } from "@/lib/bouwer/werker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/bouwer/terminal — één echt shell-commando in de werkkopie van de
// Bouwer (eigen container: geen database, geen app-geheimen, max 2 minuten). Elk
// commando komt in het auditlog. De veilige read-only console blijft /api/admin/terminal.
const schema = z.object({ command: z.string().trim().min(1).max(2000) });

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Ongeldig commando");

  await recordAudit({
    category: "ADMIN",
    action: "admin.bouwer.terminal",
    severity: "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} in de Bouwer-terminal: ${parsed.data.command.slice(0, 300)}`,
  });

  try {
    const r = await bouwer<{ ok: boolean; uitvoer: string }>("/terminal", {
      method: "POST",
      body: { opdracht: parsed.data.command },
      timeoutMs: 130_000,
    });
    return NextResponse.json({ ok: r.ok, output: r.uitvoer });
  } catch (err) {
    // de terminal-UI toont fouten als rode uitvoer, niet als foutpagina
    return NextResponse.json({ ok: false, output: err instanceof Error ? err.message : "De Bouwer reageert niet." });
  }
});
