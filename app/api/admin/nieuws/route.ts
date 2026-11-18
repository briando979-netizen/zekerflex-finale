import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { featureEnabled, setFlag } from "@/lib/flags";
import { loopNieuwsNa, NIEUWS_VLAG } from "@/lib/nieuws/ronde";
import { echteNieuwsAfhankelijkheden } from "@/lib/nieuws/ronde-db";
import { alleBerichten, bewaarBericht, leesBericht, leesNieuwsStand, wisBericht } from "@/lib/nieuws/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

// Beheer → Nieuwsroom (app/admin/nieuws/page.tsx).
// GET: de berichten, de stand van "vanzelf plaatsen" en de laatste ronde.
// POST { actie }: plaatsen, verbergen of weggooien van één bericht, de stand wisselen, of nu een ronde draaien.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ vanzelf: await featureEnabled(NIEUWS_VLAG), stand: await leesNieuwsStand(), berichten: await alleBerichten() });
});

const Invoer = z.discriminatedUnion("actie", [
  z.object({ actie: z.enum(["plaats", "verberg", "wis"]), slug: z.string().min(1).max(120) }),
  z.object({ actie: z.literal("stand"), vanzelf: z.boolean() }),
  z.object({ actie: z.literal("ronde") }),
]);

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const invoer = Invoer.safeParse(await request.json().catch(() => null));
  if (!invoer.success) throw AppError.validation("Onbekende actie.");
  const a = invoer.data;
  if (a.actie === "stand") {
    await setFlag(NIEUWS_VLAG, { enabled: a.vanzelf, note: a.vanzelf ? "berichten gaan vanzelf op de site" : "berichten wachten als concept op een mens" }, principal.email);
    return NextResponse.json({ vanzelf: a.vanzelf });
  }
  if (a.actie === "ronde") {
    const s = await loopNieuwsNa(echteNieuwsAfhankelijkheden());
    return NextResponse.json({ stand: s });
  }
  const b = await leesBericht(a.slug);
  if (!b) throw AppError.validation("Dit bericht bestaat niet meer.");
  if (a.actie === "wis") {
    await wisBericht(a.slug);
    return NextResponse.json({ weg: true });
  }
  const nu = new Date().toISOString();
  const nieuw = a.actie === "plaats" ? { ...b, status: "geplaatst" as const, geplaatst: b.geplaatst ?? nu, door: principal.email } : { ...b, status: "verborgen" as const };
  await bewaarBericht(nieuw);
  return NextResponse.json({ bericht: nieuw });
});
