import { ACTIVITEITEN } from "@/lib/voorstel/schwarzwald";
import { AGENDA } from "@/lib/voorstel/schwarzwald-agenda";
import { zoekBoeking } from "@/lib/voorstel/schwarzwald-boekingen";
import { leesIcsToken } from "@/lib/voorstel/schwarzwald-ics";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { icsVoorBoeking } from "@/lib/voorstel/ics-bestand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?t=<ondertekend> → de reservering als agendabestand. Inline, zodat een
// iPhone meteen "Zet in agenda" toont; ?dl=1 dwingt een download af.
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const sleutel = leesIcsToken(q.get("t"));
  const b = sleutel ? await zoekBoeking(sleutel.datum, sleutel.id) : null;
  if (!b) return new Response("Reservering niet gevonden. Misschien is hij verzet: open dan de nieuwe link in Mijn account.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const cfg = await agendaConfig();
  const duur = cfg.regels[b.activiteit]?.duurMin ?? AGENDA[b.activiteit]?.duurMin ?? 60;
  const naam = ACTIVITEITEN.find((a) => a.slug === b.activiteit)?.naam ?? b.activiteit;
  return new Response(icsVoorBoeking(b, naam, duur), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${q.get("dl") === "1" ? "attachment" : "inline"}; filename="het-schwarzwald-${b.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
