import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BASE, CONTACT } from "@/lib/voorstel/schwarzwald";
import { beheerder, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { zoekAanvraag } from "@/lib/voorstel/schwarzwald-crm";
import { magOfferteZien } from "@/lib/voorstel/offerte-regels";
import { PrintKnop } from "@/components/voorstel/beheer/PrintKnop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Offerte" };

// Offerte bij een aanvraag (themafeest, bruiloft, grote groep), om te printen
// of als PDF op te slaan. Het team ziet hem altijd; de gast alleen zijn eigen
// aanvraag, zodra die op "offerte" staat en er een bedrag is (offerte-regels.ts).
// Alleen het totaal incl. btw: de btw-splitsing is een keuze van Het Schwarzwald.

const datumNL = (iso: string, opties: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) =>
  new Intl.DateTimeFormat("nl-NL", { ...opties, timeZone: "Europe/Amsterdam" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

const PRINT = `@media print {
  @page { size: A4 portrait; margin: 16mm; }
  body * { visibility: hidden; }
  #offerte, #offerte * { visibility: visible; }
  #offerte { position: absolute; inset: 0 auto auto 0; width: 100%; }
  .niet-printen { display: none !important; }
}`;

export default async function OffertePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [aanvraag, account, team] = await Promise.all([zoekAanvraag(id), huidigAccount().catch(() => null), beheerder().catch(() => null)]);
  if (!aanvraag) notFound();
  if (!magOfferteZien(aanvraag, { email: account?.email, beheerder: !!team })) {
    return (
      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-8">
        <div className="rounded-xl3 bg-white p-8 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
          <h1 className="font-display text-2xl font-bold">Deze offerte is (nog) niet beschikbaar</h1>
          <p className="mt-2 text-schw-mute">Log in met het account waarmee je de aanvraag deed. Je ziet de offerte zodra het team hem heeft klaargezet.</p>
          <Link href={`${BASE}/account`} className="mt-5 inline-block rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream">
            Naar Mijn account
          </Link>
        </div>
      </section>
    );
  }

  const wat = aanvraag.programma || aanvraag.gelegenheid || "Programma op maat";
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <style>{PRINT}</style>
      <div className="niet-printen mb-6 flex flex-wrap items-center gap-3">
        <Link href={team ? `${BASE}/beheer#aanvragen` : `${BASE}/account`} className="rounded-full px-5 py-3 font-semibold ring-1 ring-schw-night/15">
          ‹ {team ? "Beheer" : "Mijn account"}
        </Link>
        {team && aanvraag.bedrag === null && <p className="text-sm font-semibold text-[#B91C1C]">Nog geen bedrag: vul het in bij Beheer → Aanvragen.</p>}
        <span className="ml-auto">
          <PrintKnop />
        </span>
      </div>

      <article id="offerte" className="rounded-xl3 bg-white p-8 text-schw-night shadow-[0_1px_2px_rgba(10,18,14,0.06)] print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-schw-night/15 pb-6">
          <Image src="/voorstel/schwarzwald/logo.webp" alt={CONTACT.naam} width={160} height={106} />
          <address className="text-right text-sm not-italic leading-relaxed">
            <strong>{CONTACT.naam}</strong>
            <br />
            {CONTACT.adres}
            <br />
            {CONTACT.postcode}
            <br />
            {CONTACT.telefoon} · {CONTACT.email}
            <br />
            KvK {CONTACT.kvk} · btw {CONTACT.btw}
          </address>
        </header>

        <div className="mt-6 flex flex-wrap justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-rust">Offerte</p>
            <h1 className="mt-1 font-display text-3xl font-bold">{wat}</h1>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 text-sm">
            <dt className="text-schw-mute">Offertenummer</dt>
            <dd className="font-semibold">{aanvraag.id.toUpperCase()}</dd>
            <dt className="text-schw-mute">Datum</dt>
            <dd>{datumNL(aanvraag.bijgewerkt)}</dd>
          </dl>
        </div>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-schw-mute">Voor</h2>
            <p className="mt-1">
              {aanvraag.naam}
              <br />
              {aanvraag.email}
              <br />
              {aanvraag.telefoon}
            </p>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-schw-mute">Uw uitje</h2>
            <p className="mt-1">
              {aanvraag.gelegenheid && (
                <>
                  {aanvraag.gelegenheid}
                  <br />
                </>
              )}
              {aanvraag.datum ? datumNL(aanvraag.datum, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Datum in overleg"}
              <br />
              {aanvraag.personen} personen
            </p>
          </div>
        </section>

        {aanvraag.bericht && (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wide text-schw-mute">Uw wensen</h2>
            <p className="mt-1 whitespace-pre-line">{aanvraag.bericht}</p>
          </section>
        )}

        <table className="mt-8 w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-schw-night/30 text-xs uppercase tracking-wide">
              <th className="py-2">Omschrijving</th>
              <th className="py-2 text-right">Personen</th>
              <th className="py-2 text-right">Bedrag</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-schw-night/10 align-top">
              <td className="py-3">
                {wat}
                {aanvraag.datum && <span className="block text-sm text-schw-mute">{datumNL(aanvraag.datum)}</span>}
              </td>
              <td className="py-3 text-right">{aanvraag.personen}</td>
              <td className="py-3 text-right">{aanvraag.bedrag !== null ? euro(aanvraag.bedrag) : "volgt"}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-4 text-right font-bold">
                Totaal (incl. btw)
              </td>
              <td className="pt-4 text-right font-display text-2xl font-bold">{aanvraag.bedrag !== null ? euro(aanvraag.bedrag) : "volgt"}</td>
            </tr>
            {aanvraag.bedrag !== null && aanvraag.personen > 0 && (
              <tr>
                <td colSpan={3} className="pt-1 text-right text-sm text-schw-mute">
                  Dat is {euro(aanvraag.bedrag / aanvraag.personen)} per persoon
                </td>
              </tr>
            )}
          </tfoot>
        </table>

        <p className="mt-8 text-sm">
          Akkoord of vragen? Bel {CONTACT.telefoon}, mail {CONTACT.email} of stuur een bericht via Mijn account. Vermeld het offertenummer {aanvraag.id.toUpperCase()}.
        </p>
        <p className="mt-6 text-xs text-schw-mute">Dit is een ontwerpvoorstel van de nieuwe website van {CONTACT.naam}; deze offerte is een voorbeeld en niet bindend.</p>
      </article>
    </section>
  );
}
