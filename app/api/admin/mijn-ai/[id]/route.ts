import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { hernoem, leesGesprek, verwijder } from "@/lib/mijn-ai/opslag";
import { TITEL_MAX } from "@/lib/mijn-ai/vorm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Eén gesprek van Mijn AI (alleen je eigen; een ander id bestaat voor jou niet: 404):
//   GET              → { gesprek }
//   PATCH { titel }  → hernoemen → { gesprek }
//   DELETE           → weg → { ok }

const titelSchema = z.object({ titel: z.string().trim().min(1).max(TITEL_MAX) });

export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const gesprek = await leesGesprek(principal.userId, params.id);
  if (!gesprek) throw AppError.notFound("Dit gesprek bestaat niet (meer).");
  return NextResponse.json({ gesprek });
});

export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (req, { params, principal }) => {
  const body = titelSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) throw AppError.validation("Geef het gesprek een naam.");
  const gesprek = await hernoem(principal.userId, params.id, body.data.titel);
  if (!gesprek) throw AppError.notFound("Dit gesprek bestaat niet (meer).");
  return NextResponse.json({ gesprek });
});

export const DELETE = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  if (!(await verwijder(principal.userId, params.id))) throw AppError.notFound("Dit gesprek bestaat niet (meer).");
  return NextResponse.json({ ok: true });
});
