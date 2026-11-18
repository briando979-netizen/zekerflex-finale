import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";
import { bewaarInstelling, leesGebeurtenissen, leesInstelling, stuurNaarEigenaar } from "@/lib/ops/melder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → Automatisch gedaan: het logboek van wat ZekerFlex zelf heeft gedaan en de instellingen van de meldingen naar de
// telefoon van de eigenaar (lib/ops/melder.ts). Alleen PLATFORM_ADMIN. Het nummer staat hier ingesteld, niet in de code.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [instelling, gebeurtenissen] = await Promise.all([leesInstelling(), leesGebeurtenissen(300)]);
  return NextResponse.json({ instelling, gebeurtenissen }, { headers: { "Cache-Control": "no-store" } });
});

const wijziging = z.object({ aan: z.boolean(), telefoon: z.string().max(30), whatsapp: z.boolean() });
const test = z.object({ actie: z.literal("test") });

export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "melder-instelling", identifier: principal.userId, limit: 10, windowSeconds: 3600, failOpen: false });
  const parsed = wijziging.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Controleer de instellingen.");
  let instelling;
  try {
    instelling = await bewaarInstelling(parsed.data);
  } catch (err) {
    throw AppError.validation((err as Error).message);
  }
  await recordAudit({
    category: "ADMIN",
    action: "admin.melder.instelling",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} wijzigde de meldingen naar de telefoon (${instelling.aan ? "aan" : "uit"})`,
  });
  return NextResponse.json({ instelling });
});

// Eén testbericht naar de eigenaar zelf, op verzoek van de eigenaar: zo ziet hij of het kanaal werkt.
// Hoogstens 5 per uur: zo kan dit niet gebruikt worden om een nummer te overspoelen.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({ name: "melder-test", identifier: principal.userId, limit: 5, windowSeconds: 3600, failOpen: false });
  if (!test.safeParse(await request.json().catch(() => ({}))).success) throw AppError.validation("Onbekende actie.");
  const instelling = await leesInstelling();
  const kanaal = await stuurNaarEigenaar("✅ ZekerFlex: dit is een testbericht van de melder.", "/admin/automatisch", `test-${Date.now()}`, instelling);
  return NextResponse.json({ kanaal });
});
