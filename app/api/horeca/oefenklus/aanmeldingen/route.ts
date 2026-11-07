import { NextRequest, NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isEigenaar } from "@/lib/horeca/toegang";

export async function GET(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const oefenKlusId = request.nextUrl.searchParams.get("oefenKlusId");
    if (!oefenKlusId) return NextResponse.json({ error: "oefenKlusId vereist" }, { status: 400 });

    // Haal de oefenklus en zaak op
    const oefenKlus = await prisma.oefenKlus.findUnique({
      where: { id: oefenKlusId },
      include: { zaak: true },
    });

    if (!oefenKlus) return NextResponse.json({ error: "Oefenklus niet gevonden" }, { status: 404 });

    // Controleer toegang
    const eigenaar = await isEigenaar(oefenKlus.zaak);
    if (!eigenaar) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

    // Haal aanmeldingen op
    const aanmeldingen = await prisma.oefenKlusAanmelding.findMany({
      where: { oefenKlusId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ oefenKlus, aanmeldingen });
  } catch (err) {
    return NextResponse.json({ error: "Fout bij ophalen" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const body = await request.json();
    const { aanmeldingId, status, notitieZaak } = body;

    if (!aanmeldingId) return NextResponse.json({ error: "aanmeldingId vereist" }, { status: 400 });

    // Haal aanmelding op
    const aanmelding = await prisma.oefenKlusAanmelding.findUnique({
      where: { id: aanmeldingId },
      include: { oefenKlus: { include: { zaak: true } } },
    });

    if (!aanmelding) return NextResponse.json({ error: "Aanmelding niet gevonden" }, { status: 404 });

    // Controleer toegang
    const eigenaar = await isEigenaar(aanmelding.oefenKlus.zaak);
    if (!eigenaar) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

    // Update aanmelding
    const updated = await prisma.oefenKlusAanmelding.update({
      where: { id: aanmeldingId },
      data: {
        status: status || undefined,
        notitieZaak: notitieZaak !== undefined ? notitieZaak : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: "Fout bij update" }, { status: 500 });
  }
}
