import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { leesProject, verwijderProject } from "@/lib/video/projecten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const project = await leesProject(params.id);
  if (!project) throw AppError.notFound("Dit project bestaat niet (meer).");
  return NextResponse.json({ project });
});

export const DELETE = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  await verwijderProject(params.id);
  return NextResponse.json({ ok: true });
});
