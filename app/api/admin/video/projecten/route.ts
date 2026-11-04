import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { bewaarProject, projectLijst } from "@/lib/video/projecten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: alle videoprojecten (kort).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ projecten: await projectLijst() });
});

// POST: een project opslaan (nieuw of bijwerken). Geeft de opgeslagen stand terug.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const ruw = await request.json().catch(() => {
    throw AppError.validation("Dit project kon niet worden gelezen.");
  });
  const project = await bewaarProject(ruw);
  return NextResponse.json({ ok: true, project });
});
