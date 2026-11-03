import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http/errors";
import { prijsIndicatie } from "@/lib/voorstel/schwarzwald-agenda";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { eisBeheerder, eisZelfdeHerkomst } from "@/lib/voorstel/schwarzwald-accounts";
import { AANWEZIG_LABEL } from "@/lib/voorstel/aanwezig-regels";
import { alleBoekingen, maakBoeking, verwijderBoeking, zetAanwezig, zetStatus } from "@/lib/voorstel/schwarzwald-boekingen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reserveringen in het beheer: alles zien (met prijsindicatie), status
// wijzigen, gasten aanmelden bij de balie (aangekomen/niet gekomen), zelf een
// reservering inboeken (telefoon/balie) en verwijderen.
// Alleen beheerders (Schwarzwald-beheerder of ZekerFlex-platformbeheerder).
// ?formaat=csv geeft een export voor Excel.

const csvVeld = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    const cfg = await agendaConfig();
    const boekingen = (await alleBoekingen())
      .sort((a, b) => `${a.datum} ${a.tijd}`.localeCompare(`${b.datum} ${b.tijd}`))
      .map((b) => ({ ...b, prijs: prijsIndicatie(b.activiteit, b.personen, b.datum, cfg) }));
    if (new URL(request.url).searchParams.get("formaat") === "csv") {
      const kop = ["Nummer", "Datum", "Tijd", "Activiteit", "Personen", "Naam", "E-mail", "Telefoon", "Opmerking", "Status", "Aanwezig", "Via", "Prijsindicatie"];
      const regels = boekingen.map((b) =>
        [b.id, b.datum, b.tijd, b.activiteit, b.personen, b.naam, b.email, b.telefoon, b.opmerking, b.status, b.aanwezig ? AANWEZIG_LABEL[b.aanwezig] : "", b.door ?? "online", b.prijs ?? ""]
          .map(csvVeld)
          .join(";"),
      );
      return new NextResponse(`﻿${[kop.map(csvVeld).join(";"), ...regels].join("\r\n")}`, {
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="schwarzwald-reserveringen.csv"' },
      });
    }
    return NextResponse.json({ boekingen });
  } catch (err) {
    return jsonError(err);
  }
}

const nieuw = z.object({
  activiteit: z.string().max(60),
  datum: z.string().max(10),
  tijd: z.string().max(5),
  personen: z.number().int().min(1).max(500),
  naam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().min(6).max(40),
  opmerking: z.string().trim().max(1000).default(""),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = nieuw.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Vul alle velden goed in.", parsed.error.flatten());
    return NextResponse.json({ boeking: await maakBoeking(parsed.data, { door: "beheer" }) });
  } catch (err) {
    return jsonError(err);
  }
}

const wijziging = z.object({
  datum: z.string().max(10),
  id: z.string().max(8),
  status: z.enum(["nieuw", "bevestigd", "geannuleerd"]),
});
// null = aanmelding ongedaan maken
const aanmelding = wijziging.pick({ datum: true, id: true }).extend({ aanwezig: z.enum(["ja", "nee"]).nullable() });

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const body: unknown = await request.json().catch(() => null);
    const meld = aanmelding.safeParse(body);
    if (meld.success) return NextResponse.json({ boeking: await zetAanwezig(meld.data.datum, meld.data.id, meld.data.aanwezig) });
    const parsed = wijziging.safeParse(body);
    if (!parsed.success) throw AppError.validation("Ongeldige wijziging.");
    return NextResponse.json({ boeking: await zetStatus(parsed.data.datum, parsed.data.id, parsed.data.status) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await eisBeheerder();
    eisZelfdeHerkomst(request);
    const parsed = wijziging.pick({ datum: true, id: true }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekende boeking.");
    await verwijderBoeking(parsed.data.datum, parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
