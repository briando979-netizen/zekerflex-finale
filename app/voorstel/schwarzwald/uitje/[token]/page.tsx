import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { googleCalendarUrl } from "@/lib/calendar/links";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { ACTIVITEITEN, BASE, CONTACT } from "@/lib/voorstel/schwarzwald";
import { AGENDA, klok, minuten } from "@/lib/voorstel/schwarzwald-agenda";
import { zoekBoekingOpNummer } from "@/lib/voorstel/schwarzwald-boekingen";
import { icsAdres, icsToken, leesUitjeToken } from "@/lib/voorstel/schwarzwald-ics";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { routeUrl, voornaam } from "@/lib/voorstel/uitje-tekst";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Uitnodiging" };

// Deel-link voor de groep: de organisator stuurt deze pagina naar iedereen die
// meegaat. Wat, wanneer, waar, route en "zet in agenda". Van de organisator
// alleen de voornaam; geen e-mail, telefoon of opmerkingen. Werkt ook na
// verzetten (de link bevat alleen het reserveringsnummer).

const dagNaam = (datum: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));

function Melding({ kop, tekst }: { kop: string; tekst: string }) {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-16 sm:px-8">
      <div className="mx-auto max-w-xl rounded-xl3 bg-white p-8 text-center shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
        <h1 className="font-display text-3xl font-bold">{kop}</h1>
        <p className="mt-3 text-schw-mute">{tekst}</p>
        <Link href={BASE} className="mt-6 inline-block rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
          Naar Het Schwarzwald
        </Link>
      </div>
    </section>
  );
}

export default async function UitjePage({ params }: { params: Promise<{ token: string }> }) {
  const id = leesUitjeToken((await params).token);
  const b = id ? await zoekBoekingOpNummer(id) : null;
  if (!b || b.status === "geannuleerd") return <Melding kop="Dit uitje bestaat niet (meer)" tekst="Misschien is het geannuleerd. Vraag de organisator om de nieuwste link." />;
  if (b.datum < amsterdamDayKey(new Date())) return <Melding kop="Dit uitje is al geweest" tekst="Hopelijk was het een topdag! Zin in een volgend uitje? Kijk wat er allemaal kan." />;

  const act = ACTIVITEITEN.find((a) => a.slug === b.activiteit);
  const naam = act?.naam ?? b.activiteit;
  const cfg = await agendaConfig();
  const eind = klok(minuten(b.tijd) + (cfg.regels[b.activiteit]?.duurMin ?? AGENDA[b.activiteit]?.duurMin ?? 60));
  const wie = voornaam(b.naam);
  const adres = `${CONTACT.naam}, ${CONTACT.adres}, ${CONTACT.postcode}`;
  const ev = { title: `${naam} bij ${CONTACT.naam}`, startLocal: `${b.datum}T${b.tijd}:00`, endLocal: `${b.datum}T${eind}:00`, location: adres, description: `Reservering ${b.id} voor ${b.personen} personen.` };

  return (
    <>
      <section className="relative isolate overflow-hidden bg-schw-night text-schw-cream">
        {act?.foto && (
          <>
            <Image src={act.foto} alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-45" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-schw-night via-schw-night/60 to-schw-night/10" />
          </>
        )}
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-24 sm:px-8 lg:pt-32">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Je bent uitgenodigd</p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.4rem,6vw,4.5rem)] font-bold leading-[0.95] tracking-tight">{naam}</h1>
          <p className="mt-4 max-w-xl text-lg text-schw-cream/85">
            {wie ? `${wie} heeft` : "Er is"} een uitje geboekt bij {CONTACT.naam} in Rijssen. Je bent van de partij!
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1280px] gap-6 px-4 py-12 sm:px-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-schw-mute">Wanneer</dt>
              <dd className="mt-1 text-lg font-semibold first-letter:uppercase">{dagNaam(b.datum)}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-schw-mute">Hoe laat</dt>
              <dd className="mt-1 text-lg font-semibold">
                {b.tijd} – {eind} uur
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-schw-mute">Met</dt>
              <dd className="mt-1 text-lg font-semibold">{b.personen} personen</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-schw-mute">Waar</dt>
              <dd className="mt-1 text-lg font-semibold">
                {CONTACT.adres}, {CONTACT.postcode}
              </dd>
            </div>
          </dl>
          {b.status === "nieuw" && <p className="mt-5 rounded-xl bg-schw-sun/40 px-4 py-3 text-sm">Het Schwarzwald bevestigt deze reservering nog. De organisator hoort het als er iets verandert.</p>}
          <div className="mt-7 flex flex-wrap gap-3">
            <a href={routeUrl()} target="_blank" rel="noopener noreferrer" className="rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
              Route plannen
            </a>
            <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" className="rounded-full px-6 py-3 font-semibold ring-1 ring-schw-night/15">
              Google Agenda
            </a>
            <a href={icsAdres(icsToken(b))} className="rounded-full px-6 py-3 font-semibold ring-1 ring-schw-night/15">
              Apple Agenda
            </a>
          </div>
        </div>
        <aside className="space-y-4">
          {act && (
            <div className="rounded-xl3 bg-schw-sand p-6">
              <h2 className="font-display text-xl font-bold">Wat ga je doen?</h2>
              <p className="mt-2 text-schw-night/80">{act.kort}</p>
              <Link href={`${BASE}/activiteiten/${act.slug}`} className="mt-4 inline-block font-semibold underline">
                Meer over {naam}
              </Link>
            </div>
          )}
          <div className="rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
            <h2 className="font-display text-xl font-bold">Vragen?</h2>
            <p className="mt-2 text-schw-mute">
              Bel {CONTACT.naam}: <a href={CONTACT.telefoonHref} className="font-semibold text-schw-night underline">{CONTACT.telefoon}</a>. Noem reserveringsnummer{" "}
              <strong className="font-mono">{b.id}</strong>.
            </p>
          </div>
        </aside>
      </section>
    </>
  );
}
