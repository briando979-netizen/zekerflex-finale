import type { Metadata } from "next";
import { annuleerBezwaar, annuleerTotMinVan, datumTijdLang } from "@/lib/afspraken/model";
import { afspraakVanLink } from "@/lib/afspraken/store";
import { LINK_ONBEKEND_TEKST, annuleerUitleg } from "@/lib/afspraken/teksten";
import { AnnuleerAfspraak } from "@/components/afspraken/AnnuleerAfspraak";

export const dynamic = "force-dynamic";

// /boeken/<adres>/afspraak/<geheime link>: de persoonlijke pagina van een klant om zijn afspraak te zien en te annuleren.
// De link staat alleen in de mail aan de klant. Niet voor zoekmachines, en zonder referrer: de link mag nooit naar een
// andere site lekken. Wat de klant hier ziet is alleen zijn eigen afspraak (geen naam, telefoon of opmerking).

type Props = { params: Promise<{ slug: string; token: string }> };

export const metadata: Metadata = { title: "Je afspraak", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AfspraakPagina({ params }: Props) {
  const { slug, token } = await params;
  const gevonden = await afspraakVanLink(slug, token);
  const kaart = "rounded-2xl border border-hair bg-white p-5 shadow-sm";
  return (
    <main className="flex min-h-screen items-start justify-center bg-paper-soft px-4 py-10 sm:py-14">
      <div className="w-full max-w-lg">
        {!gevonden ? (
          <div className={kaart}>
            <h1 className="font-display text-xl font-bold text-ink">Deze link werkt niet</h1>
            <p className="mt-2 text-sm text-neutralx-600">{LINK_ONBEKEND_TEKST}</p>
          </div>
        ) : (
          (() => {
            const { instellingen: i, afspraak: a } = gevonden;
            const bezwaar = annuleerBezwaar(a, i, new Date());
            return (
              <>
                <h1 className="font-display text-2xl font-bold text-ink">{i.bedrijfsnaam}</h1>
                <p className="mb-5 mt-1 text-sm text-neutralx-600">Je afspraak</p>
                <div className={kaart}>
                  <p className="text-sm text-neutralx-600">
                    {a.dienstNaam}
                    {a.medewerkerNaam ? ` met ${a.medewerkerNaam}` : ""}
                  </p>
                  <p className="mt-3 rounded-xl bg-paper-soft px-4 py-3 text-base font-semibold text-ink">
                    {datumTijdLang(a.start)}
                    <br />
                    <span className="text-sm font-normal text-neutralx-600">{a.duurMin} minuten</span>
                  </p>
                  {a.status === "geannuleerd" && <p className="mt-3 text-sm font-semibold text-ink">Geannuleerd</p>}
                </div>
                <AnnuleerAfspraak slug={slug} token={token} bedrijfsnaam={i.bedrijfsnaam} kanAnnuleren={bezwaar === null} uitleg={bezwaar ? annuleerUitleg(bezwaar, annuleerTotMinVan(i)) : ""} nieuweAfspraakMogelijk={i.actief} />
              </>
            );
          })()
        )}
        <p className="mt-6 text-center text-xs text-neutralx-500">Afspraken via ZekerFlex namens het bedrijf. Deze pagina is persoonlijk: deel de link niet.</p>
      </div>
    </main>
  );
}
