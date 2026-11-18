import type { Metadata } from "next";
import Image from "next/image";
import { CONTACT, CONTACT_PAGINA, KLANTLOGIN, beeld, looptijdTekst, pakket, prijsTekst } from "@/lib/voorstel/smileyapp";
import { GeslotenFormulier } from "@/components/voorstel/smileyapp/GeslotenFormulier";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

export const metadata: Metadata = { title: "Contact" };

export default async function SmileyappContact({ searchParams }: { searchParams: Promise<{ pakket?: string | string[] }> }) {
  const q = (await searchParams).pakket;
  // ?pakket=iso vanaf een prijskaart: dat pakket staat vooraan (en in het onderwerp van de mail)
  const gekozen = pakket(Array.isArray(q) ? q[0] : q);
  return (
    <>
      <section className="relative overflow-hidden bg-smiley-ink text-white">
        <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" knipoog className="sm-zweef pointer-events-none absolute -right-12 top-6 h-56 w-56 opacity-25 sm:right-12" />
        <div className="relative mx-auto max-w-[1200px] px-4 py-16 sm:px-8 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-smiley-sun">Contact</p>
          <h1 className="mt-3 max-w-3xl font-display text-[clamp(2.2rem,6vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.02em]">{CONTACT_PAGINA.kop}</h1>
          <p className="mt-4 text-xl font-semibold text-smiley-green">{CONTACT_PAGINA.sub}</p>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:py-20">
        <div className="space-y-6">
          {gekozen && (
            <div className="rounded-[2rem] bg-smiley-sun p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em]">Je koos</p>
              <p className="mt-2 font-display text-2xl font-bold">{gekozen.naam}</p>
              <p className="mt-1 font-semibold">
                {prijsTekst(gekozen)}
                {gekozen.prijs !== null && " maandelijks"}
                {looptijdTekst(gekozen) && ` · ${looptijdTekst(gekozen).toLowerCase()}`}
              </p>
            </div>
          )}
          <div className="rounded-[2rem] bg-white p-6 ring-1 ring-smiley-ink/10 sm:p-8">
            <h2 className="font-display text-2xl font-bold">Contactgegevens</h2>
            <address className="mt-5 space-y-2 not-italic leading-relaxed">
              <p className="font-bold">{CONTACT.naam}</p>
              <p>
                <a href={`mailto:${CONTACT.email}`} className="font-semibold text-smiley-leaf underline underline-offset-2">
                  {CONTACT.email}
                </a>
              </p>
              <p>Postadres: {CONTACT.postadres}</p>
              <p>Kantooradres: {CONTACT.kantooradres}</p>
              <p>KvK-nummer: {CONTACT.kvk}</p>
            </address>
            <p className="mt-5 text-sm text-smiley-mute">
              Smileyapp is onderdeel van{" "}
              <a href={CONTACT.onderdeelVanUrl} rel="noopener noreferrer" className="font-semibold text-smiley-leaf underline underline-offset-2">
                {CONTACT.onderdeelVan}
              </a>
              .
            </p>
            <p className="mt-5 text-sm text-smiley-mute">
              Al klant?{" "}
              <a href={KLANTLOGIN} className="font-semibold text-smiley-leaf underline underline-offset-2">
                Naar de klantlogin
              </a>
              .
            </p>
          </div>
          <Image src={beeld("widget.webp")} alt="De rating widget van Smileyapp: een gemiddelde score met drie smileys" width={272} height={315} className="sm-zweef mx-auto h-auto w-40 [--sm-draai:-4deg]" />
        </div>
        <GeslotenFormulier id="contact" kop={CONTACT_PAGINA.formulierKop} gekozen={gekozen?.naam} onderwerp={gekozen ? `Interesse in het ${gekozen.naam}` : "Vraag via de website"} />
      </section>
    </>
  );
}
