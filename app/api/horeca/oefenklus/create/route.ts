import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isEigenaar } from "@/lib/horeca/toegang";

const createSchema = z.object({
  zaakId: z.string().min(1),
  titel: z.string().min(1).max(100),
  beschrijving: z.string().min(1).max(500),
  datum: z.string().refine((d) => !isNaN(new Date(d).getTime()), "Ongeldige datum"),
  startTijd: z.string().regex(/^\d{2}:\d{2}$/, "Gebruik HH:MM formaat"),
  eindTijd: z.string().regex(/^\d{2}:\d{2}$/, "Gebruik HH:MM formaat"),
  maxAanmeldingen: z.number().int().min(1).max(20).default(5),
  niveau: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
});

export async function POST(request: NextRequest) {
  try {
    const p = await getPrincipal();
    if (!p) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

    const body = await request.json();
    const data = createSchema.parse(body);

    // Controleer toegang tot deze zaak
    const zaak = await prisma.horecaZaak.findUnique({ where: { id: data.zaakId } });
    if (!zaak) return NextResponse.json({ error: "Zaak niet gevonden" }, { status: 404 });

    const eigenaar = await isEigenaar(zaak);
    if (!eigenaar) return NextResponse.json({ error: "Geen toegang" }, { status: 403 });

    // Maak oefenklus aan
    const oefenKlus = await prisma.oefenKlus.create({
      data: {
        zaakId: data.zaakId,
        titel: data.titel,
        beschrijving: data.beschrijving,
        datum: new Date(data.datum),
        startTijd: data.startTijd,
        eindTijd: data.eindTijd,
        maxAanmeldingen: data.maxAanmeldingen,
        niveau: data.niveau,
      },
    });

    logger.info("oefenklus-created", {
      oefenKlusId: oefenKlus.id,
      zaakId: data.zaakId,
      userId: p.userId,
    });

    return NextResponse.json(oefenKlus);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Ongeldige gegevens" }, { status: 400 });
    }
    logger.error("oefenklus-create fout", { error: (err as Error).message });
    return NextResponse.json({ error: "Fout bij aanmaken" }, { status: 500 });
  }
}
