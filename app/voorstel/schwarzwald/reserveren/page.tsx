import type { Metadata } from "next";
import { CONTACT } from "@/lib/voorstel/schwarzwald";
import { ReserveerAanvraag } from "@/components/voorstel/ReserveerAanvraag";

export const metadata: Metadata = { title: "Reserveren" };

const tekst = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function ReserverenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;

  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-14 sm:px-8 lg:pt-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Reserveren</p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.8rem,8vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.03em]">
            Nog één klik en het <span className="text-schw-orange">feest</span> staat.
          </h1>
        </div>
      </section>
      <section className="mx-auto grid max-w-[1280px] gap-8 px-4 py-14 sm:px-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          <div className="rounded-xl3 bg-schw-night p-7 text-schw-cream sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Weet je al wat je wilt?</p>
            <h2 className="mt-3 font-display text-3xl font-bold">Direct online boeken</h2>
            <p className="mt-3 text-schw-cream/80">Kies je activiteit, datum en tijd in ons online reserveringssysteem.</p>
            <a
              href={CONTACT.reserveerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-full bg-schw-orange px-7 py-4 font-bold text-schw-night transition-transform hover:-translate-y-0.5"
            >
              Open de agenda ↗
            </a>
          </div>
          <div className="rounded-xl3 bg-white p-7 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8">
            <h2 className="font-display text-xl font-bold">Liever even overleggen?</h2>
            <p className="mt-3 text-schw-mute">Voor grote groepen, bruiloften en zakelijke events maken we graag een programma op maat.</p>
            <p className="mt-5 space-y-1">
              <a href={CONTACT.telefoonHref} className="block text-lg font-bold hover:text-schw-orange">{CONTACT.telefoon}</a>
              <a href={`mailto:${CONTACT.email}`} className="block font-semibold hover:text-schw-orange">{CONTACT.email}</a>
            </p>
            <p className="mt-5 text-sm text-schw-mute">{CONTACT.adres}, {CONTACT.postcode}</p>
          </div>
        </div>
        <ReserveerAanvraag activiteit={tekst(sp.activiteit)} thema={tekst(sp.thema)} voor={tekst(sp.voor)} />
      </section>
    </>
  );
}
