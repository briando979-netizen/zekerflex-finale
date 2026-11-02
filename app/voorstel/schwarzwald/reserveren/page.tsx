import type { Metadata } from "next";
import { ACTIVITEITEN, CONTACT, OPENINGSTIJDEN } from "@/lib/voorstel/schwarzwald";
import { AGENDA, boekbaar } from "@/lib/voorstel/schwarzwald-agenda";
import { ReserveerAanvraag } from "@/components/voorstel/ReserveerAanvraag";
import { SchwarzwaldAgenda, type AgendaActiviteit } from "@/components/voorstel/SchwarzwaldAgenda";

export const metadata: Metadata = { title: "Reserveren" };

const tekst = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Eigen agenda in plaats van de link naar Stackbase: activiteiten met vaste
// tijdsloten direct boeken. Themafeesten, bruiloften en grote groepen gaan via
// het aanvraagformulier eronder.
export default async function ReserverenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const activiteiten: AgendaActiviteit[] = ACTIVITEITEN.filter(boekbaar).flatMap((a) => {
    const r = AGENDA[a.slug];
    return r ? [{ slug: a.slug, naam: a.naam, min: r.min, max: r.max, duurMin: r.duurMin }] : [];
  });

  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-14 sm:px-8 lg:pt-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Reserveren</p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.8rem,8vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.03em]">
            Nog één klik en het <span className="text-schw-orange">feest</span> staat.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-schw-cream/80">Kies je activiteit, zie meteen welke dagen en tijden nog vrij zijn, en reserveer direct.</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-8">
        <SchwarzwaldAgenda activiteiten={activiteiten} start={tekst(sp.activiteit)} />
      </section>

      <section className="mx-auto grid max-w-[1280px] gap-8 px-4 pb-16 sm:px-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <div className="rounded-xl3 bg-white p-7 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8">
            <h2 className="font-display text-xl font-bold">Themafeest, bruiloft of grote groep?</h2>
            <p className="mt-3 text-schw-mute">Daarvoor maken we graag een programma op maat. Vraag een voorstel aan of bel ons.</p>
            <p className="mt-5 space-y-1">
              <a href={CONTACT.telefoonHref} className="block text-lg font-bold hover:text-schw-orange">{CONTACT.telefoon}</a>
              <a href={`mailto:${CONTACT.email}`} className="block font-semibold hover:text-schw-orange">{CONTACT.email}</a>
            </p>
            <p className="mt-5 text-sm text-schw-mute">{CONTACT.adres}, {CONTACT.postcode}</p>
          </div>
          <div className="rounded-xl3 bg-schw-night p-7 text-schw-cream sm:p-8">
            <h2 className="font-display text-xl font-bold">Openingstijden</h2>
            <dl className="mt-4 space-y-2">
              {OPENINGSTIJDEN.map((o) => (
                <div key={o.dagen} className="flex justify-between gap-4">
                  <dt className="text-schw-cream/70">{o.dagen}</dt>
                  <dd className="font-semibold">{o.tijd}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-schw-cream/60">Groepen vanaf 12 personen kunnen ook op andere dagen, op reservering.</p>
          </div>
        </div>
        <ReserveerAanvraag activiteit={tekst(sp.activiteit)} thema={tekst(sp.thema)} voor={tekst(sp.voor)} />
      </section>
    </>
  );
}
