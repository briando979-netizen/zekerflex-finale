import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toggleShiftFavorite, isShiftFavorited } from "@/lib/shifts/favorites";

const toggleSchema = z.object({
  shiftId: z.string().min(1),
});

const checkSchema = z.object({
  shiftId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "FREELANCER")) {
      return NextResponse.json({ error: "Niet ingelogd als flexwerker" }, { status: 401 });
    }

    const body = await request.json();
    const { shiftId } = toggleSchema.parse(body);

    // Verify shift exists
    const shift = await prisma.shift.findUnique({ where: { id: shiftId }, select: { id: true } });
    if (!shift) {
      return NextResponse.json({ error: "Klus niet gevonden" }, { status: 404 });
    }

    // Get freelancer profile
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: p.userId },
      select: { id: true },
    });
    if (!freelancer) {
      return NextResponse.json({ error: "Profiel niet gevonden" }, { status: 404 });
    }

    const favorited = await toggleShiftFavorite(freelancer.id, shiftId);
    return NextResponse.json({ favorited });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Ongeldige gegevens" }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "FREELANCER")) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    }

    const shiftId = request.nextUrl.searchParams.get("shiftId");
    if (!shiftId) {
      return NextResponse.json({ error: "shiftId vereist" }, { status: 400 });
    }

    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: p.userId },
      select: { id: true },
    });
    if (!freelancer) {
      return NextResponse.json({ error: "Profiel niet gevonden" }, { status: 404 });
    }

    const favorited = await isShiftFavorited(freelancer.id, shiftId);
    return NextResponse.json({ favorited });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
