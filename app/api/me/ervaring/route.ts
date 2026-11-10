import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { BEDRIJF_MAX, FUNCTIE_MAX, OMSCHRIJVING_MAX } from "@/lib/werker/ervaring";
import { getErvaring, verwijderErvaring, voegErvaringToe, zetGeenErvaring } from "@/lib/werker/ervaring-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/me/ervaring — de werkervaring van de ingelogde werker zelf (KV werker-ervaring:<userId>).
// Alleen de eigenaar: het userId komt uit de sessie, nooit uit het verzoek.

// GET — de lijst en of "nog geen werkervaring" gekozen is.
export const GET = withAuth(async (_req, { principal }) => NextResponse.json(await getErvaring(principal.userId)));

const maandJaar = z.number().int().min(1).max(9999);
const postSchema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("toevoegen"),
    functie: z.string().max(FUNCTIE_MAX * 2),
    bedrijf: z.string().max(BEDRIJF_MAX * 2),
    vanMaand: maandJaar,
    vanJaar: maandJaar,
    nu: z.boolean(),
    totMaand: maandJaar.nullable().optional(),
    totJaar: maandJaar.nullable().optional(),
    omschrijving: z.string().max(OMSCHRIJVING_MAX * 2).optional(),
  }),
  z.object({ actie: z.literal("geen"), geen: z.boolean() }),
]);

// POST { actie: "toevoegen", … } of { actie: "geen", geen } — het scherm krijgt de nieuwe stand terug.
export const POST = withAuth(async (req, { principal }) => {
  await enforceRateLimit({ name: "me-ervaring", identifier: principal.userId, limit: 40, windowSeconds: 300 });
  const body = postSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) throw AppError.validation("Controleer je invoer.");
  if (body.data.actie === "geen") return NextResponse.json(await zetGeenErvaring(principal.userId, body.data.geen));
  const { actie: _actie, ...invoer } = body.data;
  void _actie;
  const uitslag = await voegErvaringToe(principal.userId, invoer);
  if (!uitslag.ok) throw AppError.validation(uitslag.fout);
  return NextResponse.json(uitslag.stand, { status: 201 });
});

const deleteSchema = z.object({ id: z.string().min(1).max(64) });

// DELETE { id } — één ervaring weg.
export const DELETE = withAuth(async (req, { principal }) => {
  await enforceRateLimit({ name: "me-ervaring", identifier: principal.userId, limit: 40, windowSeconds: 300 });
  const body = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) throw AppError.validation("Controleer je invoer.");
  return NextResponse.json(await verwijderErvaring(principal.userId, body.data.id));
});
