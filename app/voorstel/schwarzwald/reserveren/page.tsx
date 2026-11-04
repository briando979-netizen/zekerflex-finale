import type { Metadata } from "next";
import Link from "next/link";
import { ACTIVITEITEN, BASE, CONTACT } from "@/lib/voorstel/schwarzwald";
import { boekbaar, isDatum } from "@/lib/voorstel/schwarzwald-agenda";
import { openingsRegels } from "@/lib/voorstel/open-status";
import { agendaConfig } from "@/lib/voorstel/schwarzwald-instellingen";
import { huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { leesEtenInvulling } from "@/lib/voorstel/eten-regels";
import { ReserveerAanvraag } from "@/components/voorstel/ReserveerAanvraag";
import { SchwarzwaldAgenda, type AgendaActiviteit } from "@/components/voorstel/SchwarzwaldAgenda";

export const metadata: Metadata = { title: "Reserveren" };

const tekst = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Eigen agenda in plaats van de link naar Stackbase: activiteiten met vaste
// tijdsloten direct boeken. Themafeesten, bruiloften en grote groepen gaan via
// het aanvraagformulier eronder. Ingelogd: gegevens alvast ingevuld en de
// boeking komt in "Mijn account".
export default async function ReserverenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, cfg, account] = await Promise.all([searchParams, agendaConfig(), huidigAccount().catch(() => null)]);
  const activiteiten: AgendaActiviteit[] = ACTIVITEITEN.filter((a) => boekbaar(a, cfg)).flatMap((a) => {
    const r = cfg.regels[a.slug];
    return r ? [{ slug: a.slug, naam: a.naam, min: r.min, max: r.max, duurMin: r.duurMin }] : [];
  });
  // "Blijf je eten?" na een reservering: formulier alvast ingevuld
  const invulling = leesEtenInvulling(
    Object.fromEntries(["voor", "datum", "personen", "na", "tijd", "nr"].map((k) => [k, tekst(sp[k])])),
    Object.fromEntries(ACTIVITEITEN.map((a) => [a.slug, a.naam])),
  );

  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-14 sm:px-8 lg:pt-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Reserveren</p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.8rem,8vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.03em]">
            Nog één klik en het <span className="text-schw-orange">feest</span> staat.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-schw-cream/80">Kies je activiteit, zie meteen welke dagen en tijden nog vrij zijn, en reserveer direct.</p>
          <p className="mt-4 text-sm text-schw-cream/70">
            {account ? (
              <>Ingelogd als {account.naam}: je reservering komt in <Link href={`${BASE}/account`} className="underline">Mijn account</Link>.</>
            ) : (
              <><Link href={`${BASE}/account`} className="underline">Log in</Link> om je reserveringen later terug te zien en te annuleren.</>
            )}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-8">
        <SchwarzwaldAgenda
          activiteiten={activiteiten}
          start={tekst(sp.activiteit)}
          startDatum={isDatum(tekst(sp.datum)) ? tekst(sp.datum) : ""}
          gegevens={account ? { naam: account.naam, email: account.email, telefoon: account.telefoon } : null}
        />
      </section>

      <section className="mx-auto grid max-w-[1280px] gap-8 px-4 pb-16 sm:px-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <div className="rounded-xl3 bg-white p-7 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8">
            <h2 className="font-display text-xl font-bold">Themafeest, bruiloft of grote groep?</h2>
            <p className="mt-3 text-schw-mute">Daarvoor maken we graag een programma op maat. Vraag een voorstel aan of bel ons.</p>
            <p className="mt-5 space-y-1">
              <a href={CONTACT.telefoonHref} className="block text-lg font-bold hover:text-schw-rust">{CONTACT.telefoon}</a>
              <a href={`mailto:${CONTACT.email}`} className="block font-semibold hover:text-schw-rust">{CONTACT.email}</a>
            </p>
            <p className="mt-5 text-sm text-schw-mute">{CONTACT.adres}, {CONTACT.postcode}</p>
          </div>
          <div className="rounded-xl3 bg-schw-night p-7 text-schw-cream sm:p-8">
            <h2 className="font-display text-xl font-bold">Openingstijden</h2>
            <dl className="mt-4 space-y-2">
              {openingsRegels(cfg.open).map((o) => (
                <div key={o.dagen} className="flex justify-between gap-4">
                  <dt className="text-schw-cream/70">{o.dagen}</dt>
                  <dd className="font-semibold">{o.tijd}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-schw-cream/60">Groepen vanaf 12 personen kunnen ook op andere dagen, op reservering.</p>
          </div>
        </div>
        <ReserveerAanvraag
          // nieuwe invulling (bv. vanuit de bevestiging hierboven) = formulier opnieuw opbouwen
          key={JSON.stringify([tekst(sp.voor), invulling])}
          activiteit={tekst(sp.activiteit)}
          thema={tekst(sp.thema)}
          voor={tekst(sp.voor)}
          gegevens={account ? { naam: account.naam, email: account.email, telefoon: account.telefoon } : null}
          invulling={invulling}
        />
      </section>
    </>
  );
}
