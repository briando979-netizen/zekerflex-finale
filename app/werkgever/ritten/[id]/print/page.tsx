import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth";
import { PrintKnoppen } from "@/components/ritten/PrintKnoppen";
import { AppError } from "@/lib/errors";
import { RIT_ID, STATUS_NAAM, formatKenteken, ritUren, urenTekst } from "@/lib/ritten/model";
import { leesRit, leesVoertuig } from "@/lib/ritten/store";
import { eigenOrganisatie } from "@/lib/ritten/toegang";

export const dynamic = "force-dynamic";

// De afdrukpagina (vrachtbrief) van één rit. Bij het afdrukken verdwijnt alles behalve de rit (visibility), ook de
// menubalk van de werkgeversomgeving. Alle tijden zijn Nederlandse tijd.

const datumTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

const CSS = `
  @media print {
    body * { visibility: hidden !important; }
    #zf-rit, #zf-rit * { visibility: visible !important; }
    #zf-rit { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; background: #fff !important; color: #000 !important; }
    @page { size: A4; margin: 15mm; }
  }
`;

export default async function RitPrintPagina({ params }: { params: Promise<{ id: string }> }) {
  await requirePrincipal();
  let tenantId: string;
  try {
    tenantId = (await eigenOrganisatie()).tenantId;
  } catch (err) {
    if (err instanceof AppError && err.code === "ALLEEN_BEHEERDER") {
      return (
        <p role="alert" className="mx-auto max-w-xl rounded-xl bg-paper-soft px-4 py-3 text-sm text-ink">
          {err.message}
        </p>
      );
    }
    throw err;
  }
  const { id } = await params;
  if (!RIT_ID.test(id)) notFound();
  const rit = await leesRit(tenantId, id);
  if (!rit) notFound();
  const voertuig = rit.voertuigId ? await leesVoertuig(tenantId, rit.voertuigId) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PrintKnoppen terug="/werkgever/ritten" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <article id="zf-rit" className="rounded-xl border border-hair bg-white p-6 text-ink">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairstrong pb-3">
          <h2 className="font-display text-2xl font-bold">Rit {rit.nummer}</h2>
          <p className="text-sm">Status: {STATUS_NAAM[rit.status]}</p>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide">Route</h3>
            {rit.klantGewist && !rit.van && !rit.naar ? (
              <p className="mt-1 text-sm">Adressen gewist</p>
            ) : (
              <ol className="mt-1 space-y-0.5 text-sm">
                <li>Van: {rit.van}</li>
                {rit.tussenstops.map((s, i) => (
                  <li key={`${i}-${s}`}>Tussenstop {i + 1}: {s}</li>
                ))}
                <li>Naar: {rit.naar}</li>
              </ol>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide">Planning</h3>
            <p className="mt-1 text-sm">
              <span className="block">Gepland begin: {datumTijd(rit.start)}</span>
              <span className="block">Gepland einde: {datumTijd(rit.eind)}</span>
              {rit.werkelijkStart && <span className="block">Werkelijk begin: {datumTijd(rit.werkelijkStart)}</span>}
              {rit.werkelijkEind && <span className="block">Werkelijk einde: {datumTijd(rit.werkelijkEind)}</span>}
              <span className="block">Duur: {urenTekst(ritUren(rit))}</span>
              {rit.km !== null && <span className="block">Afgelegd: {new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(rit.km)} km</span>}
            </p>
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide">Klant</h3>
            <p className="mt-1 text-sm">{rit.klantNaam || (rit.klantGewist ? "Gewist" : "Geen klantnaam")}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide">Voertuig</h3>
            <p className="mt-1 text-sm">{voertuig ? `${formatKenteken(voertuig.kenteken)} (${voertuig.omschrijving})` : "Niet ingevuld"}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide">Chauffeur</h3>
            <p className="mt-1 text-sm">{rit.chauffeur || "Niet ingevuld"}</p>
          </div>
        </section>

        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Lading</h3>
          <p className="mt-1 whitespace-pre-line text-sm">{rit.lading || "Geen omschrijving"}</p>
        </section>

        {rit.opmerking && (
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide">Opmerking</h3>
            <p className="mt-1 whitespace-pre-line text-sm">{rit.opmerking}</p>
          </section>
        )}

        <section className="mt-8 grid grid-cols-2 gap-8 text-sm">
          <div className="border-t border-hairstrong pt-1">Handtekening chauffeur</div>
          <div className="border-t border-hairstrong pt-1">Handtekening ontvanger</div>
        </section>
      </article>
    </div>
  );
}
