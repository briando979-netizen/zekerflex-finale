import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { gesprekken } from "@/lib/sitechat/gesprek";
import { NOTITIE_MAX, STATUSSEN } from "@/lib/voorstel/smileyapp-aanvraag-regels";
import { alleAanvragen, verwijderAanvraag, verwijderNotitie, voegNotitieToe, wijzigAanvraag } from "@/lib/voorstel/smileyapp-aanvragen";
import { alleAccounts, eisToegang } from "@/lib/voorstel/smileyapp-accounts";
import { geefTijdVrij } from "@/lib/voorstel/smileyapp-agenda";
import { SMILEYAPP_KANAAL } from "@/lib/voorstel/smileyapp-chat";
import { smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Het SmileyApp-beheer: de demo-aanvragen en partner-aanmeldingen, met de
// tellers voor het overzicht. Voor iedereen van het team (beheerder én
// medewerker) en voor een ZekerFlex-platformbeheerder.
// GET              → wie je bent, alle aanvragen, tellers
// PATCH {id, …}    → de opvolging: status wijzigen, een notitie erbij (nieuweNotitie) of
//                    weg (wisNotitie); geeft de serverversie terug. `notitie` is de ene
//                    notitie van vóór deel 6a: die kan alleen nog leeggemaakt worden.
// DELETE {id}      → een aanvraag verwijderen (een geboekte tijd komt weer vrij)
// Elke methode: eigen site → limiet per IP → sessie of PLATFORM_ADMIN. Niet
// ingelogd = 401.

const ID = z.string().regex(/^[a-f0-9]{16}$/);

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request);
    const ik = await eisToegang();
    const [aanvragen, chats, team] = await Promise.all([alleAanvragen(), gesprekken(SMILEYAPP_KANAAL).catch(() => []), alleAccounts()]);
    return NextResponse.json(
      {
        ik: { naam: ik.naam, email: ik.email, rol: ik.rol, via: ik.via },
        aanvragen,
        tellers: { chatWacht: chats.filter((g) => g.status === "wacht").length, chatOngelezen: chats.filter((g) => g.ongelezen > 0 && g.status !== "gesloten").length, team: team.length },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return jsonError(err);
  }
}

// ruime grenzen voor de vorm; de echte regels (hooguit 1000 tekens, hooguit 30 notities) staan in smileyapp-aanvraag-regels.ts
const wijziging = z.object({
  id: ID,
  status: z.enum(STATUSSEN).optional(),
  notitie: z.string().max(NOTITIE_MAX).optional(),
  nieuweNotitie: z.string().max(4000).optional(),
  wisNotitie: z.string().regex(/^[a-f0-9]{12}$/).optional(),
});

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request, { json: true });
    const ik = await eisToegang();
    const gelezen = await jsonBegrensd(request, 8_000);
    const parsed = wijziging.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Ongeldige wijziging.");
    const { id, status, notitie, nieuweNotitie, wisNotitie } = parsed.data;
    // eerst de notitie: wordt die geweigerd (te lang, al dertig), dan verandert er ook geen status
    let aanvraag = nieuweNotitie !== undefined ? await voegNotitieToe(id, nieuweNotitie, ik.naam) : null;
    if (wisNotitie !== undefined) aanvraag = await verwijderNotitie(id, wisNotitie, ik.naam);
    if (status !== undefined || notitie !== undefined || !aanvraag) aanvraag = await wijzigAanvraag(id, { status, notitie }, ik.naam);
    return NextResponse.json({ aanvraag });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request, { json: true });
    await eisToegang();
    const gelezen = await jsonBegrensd(request, 1_000);
    const parsed = z.object({ id: ID }).safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Onbekende aanvraag.");
    const weg = await verwijderAanvraag(parsed.data.id);
    // had de aanvraag een tijd uit de agenda geboekt, dan komt die weer vrij (mag mislukken: de aanvraag is al weg)
    if (weg.afspraak) await geefTijdVrij(weg.afspraak.tijd, weg.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
