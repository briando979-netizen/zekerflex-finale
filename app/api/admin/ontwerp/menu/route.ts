import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { STANDAARD_VOETTEKST } from "@/lib/ontwerp/menu";
import { standaardHoofdmenu } from "@/lib/ontwerp/hoofdmenu";
import { getHoofdmenu, getVoettekst, resetHoofdmenu, resetVoettekst, setHoofdmenu, setVoettekst } from "@/lib/ontwerp/menu-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function hoofdmenuAntwoord() {
  const eigen = await getHoofdmenu();
  return { hoofdmenu: eigen ?? standaardHoofdmenu(), hoofdmenuEigen: Boolean(eigen) };
}

// GET: de voettekst en het hoofdmenu zoals ze live staan, plus de standaard.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ ...(await getVoettekst()), standaard: STANDAARD_VOETTEKST, ...(await hoofdmenuAntwoord()) });
});

const schema = z.union([z.object({ voettekst: z.record(z.unknown()) }), z.object({ hoofdmenu: z.record(z.unknown()) })]);

// PUT: een eigen voettekst of een eigen hoofdmenu live zetten.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Dit menu kon niet worden gelezen.");
  if ("hoofdmenu" in parsed.data) {
    const eigen = await setHoofdmenu(parsed.data.hoofdmenu);
    await recordAudit({ category: "ADMIN", action: "ontwerp.hoofdmenu", actorUserId: principal.userId, actorLabel: "user", summary: eigen ? "Hoofdmenu van de site bijgewerkt" : "Hoofdmenu van de site gelijk aan de standaard" });
    return NextResponse.json({ hoofdmenu: eigen ?? standaardHoofdmenu(), hoofdmenuEigen: Boolean(eigen) });
  }
  const voettekst = await setVoettekst(parsed.data.voettekst);
  await recordAudit({ category: "ADMIN", action: "ontwerp.footer", actorUserId: principal.userId, actorLabel: "user", summary: "Voettekst van de site bijgewerkt" });
  return NextResponse.json({ voettekst, eigen: true, standaard: STANDAARD_VOETTEKST });
});

// DELETE: terug naar de standaard (?deel=hoofdmenu voor de bovenbalk, anders de voettekst).
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  if (new URL(request.url).searchParams.get("deel") === "hoofdmenu") {
    await resetHoofdmenu();
    await recordAudit({ category: "ADMIN", action: "ontwerp.hoofdmenu", actorUserId: principal.userId, actorLabel: "user", summary: "Hoofdmenu van de site terug naar de standaard" });
    return NextResponse.json({ hoofdmenu: standaardHoofdmenu(), hoofdmenuEigen: false });
  }
  await resetVoettekst();
  await recordAudit({ category: "ADMIN", action: "ontwerp.footer", actorUserId: principal.userId, actorLabel: "user", summary: "Voettekst van de site terug naar de standaard" });
  return NextResponse.json({ voettekst: STANDAARD_VOETTEKST, eigen: false, standaard: STANDAARD_VOETTEKST });
});
