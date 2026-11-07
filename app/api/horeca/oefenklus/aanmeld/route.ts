import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const aanmeldSchema = z.object({
  oefenKlusId: z.string().min(1),
  voornaam: z.string().min(1).max(50),
  achternaam: z.string().min(1).max(50),
  email: z.string().email().max(200),
  telefoon: z.string().max(20).optional(),
  ervaring: z.enum(["geen", "minder-dan-1-jaar", "1-tot-3-jaar", "meer-dan-3-jaar"]),
  opmerkingen: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = aanmeldSchema.parse(body);

    // Controleer of de oefenklus bestaat en actief is
    const oefenKlus = await prisma.oefenKlus.findUnique({
      where: { id: data.oefenKlusId },
      include: { horecaZaak: true },
    });

    if (!oefenKlus) {
      return NextResponse.json({ error: "Oefenklus niet gevonden" }, { status: 404 });
    }

    if (!oefenKlus.actief) {
      return NextResponse.json({ error: "Deze oefenklus is niet meer beschikbaar" }, { status: 400 });
    }

    // Controleer of er nog plekken beschikbaar zijn
    const aanmeldingen = await prisma.oefenKlusAanmelding.count({
      where: { oefenKlusId: data.oefenKlusId, status: { in: ["aangemeld", "geaccepteerd"] } },
    });

    if (aanmeldingen >= oefenKlus.maxAanmeldingen) {
      return NextResponse.json({ error: "Alle plekken zijn vol" }, { status: 400 });
    }

    // Controleer of deze persoon niet al aangemeld is
    const existing = await prisma.oefenKlusAanmelding.findUnique({
      where: { oefenKlusId_email: { oefenKlusId: data.oefenKlusId, email: data.email } },
    });

    if (existing) {
      return NextResponse.json({ error: "Je bent al aangemeld voor deze oefenklus" }, { status: 400 });
    }

    // Maak aanmelding aan
    const aanmelding = await prisma.oefenKlusAanmelding.create({
      data: {
        oefenKlusId: data.oefenKlusId,
        voornaam: data.voornaam,
        achternaam: data.achternaam,
        email: data.email,
        telefoon: data.telefoon,
        ervaring: data.ervaring,
        opmerkingen: data.opmerkingen,
        status: "aangemeld",
      },
    });

    logger.info("oefenklus-aanmelding", {
      aanmeldingId: aanmelding.id,
      oefenKlusId: data.oefenKlusId,
      email: data.email,
    });

    return NextResponse.json({ ok: true, aanmeldingId: aanmelding.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Ongeldige gegevens" }, { status: 400 });
    }
    logger.error("oefenklus-aanmelding fout", { error: (err as Error).message });
    return NextResponse.json({ error: "Aanmelding mislukt" }, { status: 500 });
  }
}
