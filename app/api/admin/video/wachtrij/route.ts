import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";
import { haalUitWachtrij, isWachtId, verwerkWachtrij, wachtrij, zetInWachtrij } from "@/lib/video/wachtrij";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: de wachtrij (nieuwste eerst).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ taken: (await wachtrij()).slice().reverse().slice(0, 60) });
});

const invoer = z.object({
  taken: z
    .array(
      z.object({
        soort: z.enum(["clip", "foto", "video"]),
        omschrijving: z.string().trim().min(3).max(400),
        formaat: z.enum(["9:16", "16:9", "1:1", "4:5"]).default("9:16"),
        duur: z.coerce.number().min(2).max(90).default(5),
        fotoBron: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(20),
});

// POST: opdrachten klaarzetten; de server begint er meteen aan.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = invoer.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Schrijf per regel wat er gemaakt moet worden (minstens een paar woorden).");
  const taken = await zetInWachtrij(
    parsed.data.taken.map(({ fotoBron, ...t }) => ({ ...t, duur: t.soort === "video" ? Math.max(10, Math.min(90, t.duur)) : Math.max(2, Math.min(10, t.duur)), ...(fotoBron ? { fotoBron } : {}) })),
    principal.userId,
  );
  await recordAudit({
    category: "ADMIN",
    action: "video.wachtrij",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${taken.length} AI-opdracht(en) in de wachtrij gezet`,
    metadata: { soorten: taken.map((t) => t.soort) },
  });
  // Bewust niet afwachten: de wachtrij werkt op de achtergrond door.
  void verwerkWachtrij();
  return NextResponse.json({ ok: true, taken });
});

// DELETE ?id=…: een opdracht die nog niet loopt weghalen.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isWachtId(id)) throw AppError.validation("Onbekende opdracht.");
  if (!(await haalUitWachtrij(id))) throw AppError.conflict("Deze opdracht loopt al of bestaat niet meer.");
  return NextResponse.json({ ok: true });
});
