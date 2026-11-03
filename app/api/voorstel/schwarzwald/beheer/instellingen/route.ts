import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { AGENDA, STANDAARD_OPEN, isDatum, isTijd } from "@/lib/voorstel/schwarzwald-agenda";
import { leesInstellingen, slaInstellingenOp } from "@/lib/voorstel/schwarzwald-instellingen";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Agenda-instellingen in het beheer: activiteiten, openingstijden, gesloten
// dagen, blokkades en de aankondiging. GET geeft ook de standaardwaarden mee.

export async function GET(): Promise<NextResponse> {
  try {
    await eisBeheerder();
    return NextResponse.json({ instellingen: await leesInstellingen(), standaard: { activiteiten: AGENDA, open: STANDAARD_OPEN } });
  } catch (err) {
    return jsonError(err);
  }
}

const getal = (min: number, max: number) => z.number().int().min(min).max(max).optional();
const tijden = z
  .object({ van: z.number().int().min(0).max(1440), tot: z.number().int().min(0).max(1440) })
  .refine((t) => t.tot > t.van, "Sluitingstijd moet na de openingstijd liggen.");

const schema = z.object({
  activiteiten: z.record(
    z.string().refine((s) => Object.prototype.hasOwnProperty.call(AGENDA, s), "Onbekende activiteit."),
    z
      .object({
        online: z.boolean().optional(),
        duurMin: getal(15, 480),
        capaciteit: getal(1, 1000),
        min: getal(1, 500),
        max: getal(1, 1000),
        prijsPP: getal(0, 10000),
        prijsPPZondag: getal(0, 10000),
      })
      .refine((a) => a.min === undefined || a.max === undefined || a.min <= a.max, "Minimum groter dan maximum."),
  ),
  open: z.record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), tijden.nullable()),
  gesloten: z.array(z.string().refine(isDatum, "Ongeldige datum.")).max(366),
  blokkades: z
    .array(
      z
        .object({
          datum: z.string().refine(isDatum, "Ongeldige datum."),
          van: z.string().refine(isTijd, "Ongeldige tijd."),
          tot: z.string().refine(isTijd, "Ongeldige tijd."),
          activiteit: z.string().refine((s) => s === "" || Object.prototype.hasOwnProperty.call(AGENDA, s), "Onbekende activiteit."),
          reden: z.string().trim().max(120),
        })
        .refine((k) => k.tot > k.van, "Een blokkade moet na de begintijd eindigen."),
    )
    .max(500)
    .default([]),
  aankondiging: z.string().trim().max(300),
});

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Ongeldige instellingen.", parsed.error.flatten());
    const vandaag = amsterdamDayKey(new Date());
    const i = {
      ...parsed.data,
      gesloten: [...new Set(parsed.data.gesloten)].sort(),
      // voorbije blokkades vallen vanzelf weg
      blokkades: parsed.data.blokkades.filter((k) => k.datum >= vandaag).sort((a, b) => `${a.datum}${a.van}`.localeCompare(`${b.datum}${b.van}`)),
    };
    await slaInstellingenOp(i);
    return NextResponse.json({ instellingen: i });
  } catch (err) {
    return jsonError(err);
  }
}
