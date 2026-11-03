import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { lees } from "@/lib/rijschool/schema";
import { eisBeheer } from "@/lib/rijschool/toegang";
import {
  appVan,
  beoordelaarAccount,
  bouwApp,
  indienen,
  instellen,
  mailTesters,
  schermafbeeldingen,
  testersGroep,
  verder,
  vernieuwAlsOud,
  vernieuwStand,
  winkelpagina,
} from "@/lib/rijschool/app/store";
import { appWeergave } from "@/lib/rijschool/app/weergave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// een upload naar Google Play kan even duren
export const maxDuration = 300;

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

const actieSchema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("instellen"),
    appNaam: z.string().trim().min(2, "Vul de naam van de app in.").max(30, "De naam mag hooguit 30 tekens zijn (zo toont Google Play hem)."),
    korteTekst: z.string().trim().max(80, "De korte omschrijving mag hooguit 80 tekens zijn."),
    langeTekst: z.string().trim().max(4000, "De volledige omschrijving mag hooguit 4000 tekens zijn."),
    pakketnaam: z.string().trim().max(150),
  }),
  z.object({ actie: z.literal("bouw"), naarInterneTest: z.boolean() }),
  z.object({ actie: z.literal("koppeling") }),
  z.object({ actie: z.literal("indienen"), naar: z.enum(["alpha", "production"]) }),
  z.object({ actie: z.literal("winkelpagina") }),
  z.object({ actie: z.literal("schermafbeeldingen"), beelden: z.array(z.string().max(12_000_000)).min(2, "Kies minstens 2 schermafbeeldingen.").max(8, "Hooguit 8 schermafbeeldingen.") }),
  z.object({ actie: z.literal("testers"), groep: z.string().trim().max(200) }),
  z.object({ actie: z.literal("mailTesters") }),
  z.object({ actie: z.literal("beoordelaar") }),
]);

// GET — de stand van de app (en een stap verder als er een bouw loopt).
export async function GET(): Promise<NextResponse> {
  try {
    const { rijschool } = await eisBeheer();
    let a = await appVan(rijschool);
    if (a?.taakFase === "bouwt") {
      await verder(a.id).catch(() => undefined);
      a = await appVan(rijschool);
    }
    if (a) a = await vernieuwAlsOud(rijschool, a);
    return NextResponse.json(await appWeergave(rijschool, a));
  } catch (err) {
    return fout(err);
  }
}

// POST — één actie (gegevens, bouwen, koppelen, indienen, winkelpagina, testers, …).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { p, rijschool } = await eisBeheer();
    const a = lees(actieSchema, await request.json().catch(() => ({})));
    let extra: Record<string, unknown> = {};
    switch (a.actie) {
      case "instellen":
        await instellen(rijschool, a);
        break;
      case "bouw":
        await bouwApp(rijschool, a.naarInterneTest ? "internal" : null, p.fullName);
        break;
      case "koppeling":
        await vernieuwStand(rijschool);
        break;
      case "indienen":
        extra = await indienen(rijschool, a.naar);
        break;
      case "winkelpagina":
        await winkelpagina(rijschool);
        break;
      case "schermafbeeldingen": {
        const beelden = a.beelden.map((b) => Buffer.from(b.replace(/^data:[^,]*,/, ""), "base64"));
        if (beelden.some((b) => b.length < 1000 || b.length > 8_000_000)) throw AppError.validation("Elke schermafbeelding moet tussen 1 kB en 8 MB zijn.");
        extra = { aantal: await schermafbeeldingen(rijschool, beelden) };
        break;
      }
      case "testers":
        await testersGroep(rijschool, a.groep);
        break;
      case "mailTesters":
        extra = { verstuurd: await mailTesters(rijschool) };
        break;
      case "beoordelaar":
        extra = { beoordelaar: await beoordelaarAccount(rijschool) };
        break;
    }
    return NextResponse.json({ ...extra, ...(await appWeergave(rijschool, await appVan(rijschool))) });
  } catch (err) {
    return fout(err);
  }
}
