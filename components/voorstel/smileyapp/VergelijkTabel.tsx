import Link from "next/link";
import type { VergelijkTeksten } from "@/lib/voorstel/smileyapp-teksten";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

// De vergelijking "Smileyapp of een papieren enquête?" (deel 6b), voor de
// Nederlandse pagina en de vertaalde: een tabel vanaf md, en op de telefoon per
// rij een kaart (een tabel van drie kolommen past niet op 390 px). De rijen
// komen van de pagina: de standaardrijen uit
// lib/voorstel/smileyapp-vergelijk-regels.ts met wat het team in het beheer
// toevoegde of verborg. Een rij die niet vertaald is (een eigen rij van het
// team) draagt lang, zodat een schermlezer de juiste stem kiest. Server-onderdeel.

export interface TabelRij {
  id: string;
  kenmerk: string;
  smileyapp: string;
  papier: string;
  /** de taal van de rij als die afwijkt van de pagina (een eigen rij van het team op /en of /de) */
  lang?: string;
}

const CEL = "break-words p-5 align-top leading-relaxed [hyphens:auto]";

export function VergelijkTabel({ rijen, teksten: t }: { rijen: readonly TabelRij[]; teksten: VergelijkTeksten }) {
  return (
    <>
      {/* vanaf md: een echte tabel. relative: het verborgen bijschrift (sr-only) blijft binnen het afgeknipte kader */}
      <div className="sm-onthul relative hidden overflow-hidden rounded-[2rem] bg-white ring-1 ring-smiley-ink/10 md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{t.tabelNaam}</caption>
          <thead>
            <tr className="bg-smiley-ink text-white">
              <th scope="col" className="w-[24%] p-5 text-xs font-bold uppercase tracking-[0.16em] text-smiley-sun">
                {t.kolomKenmerk}
              </th>
              <th scope="col" className="p-5 font-display text-xl font-bold">
                <span className="inline-flex items-center gap-2.5">
                  <Gezicht score={10} kleur="#5ABA8E" accent="#FDD11A" className="h-7 w-7" />
                  {t.kolomSmileyapp}
                </span>
              </th>
              <th scope="col" className="p-5 font-display text-xl font-bold">
                {t.kolomPapier}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-smiley-ink/10">
            {rijen.map((r) => (
              <tr key={r.id} {...(r.lang ? { lang: r.lang } : {})}>
                <th scope="row" className={`${CEL} font-display text-lg font-bold`}>
                  {r.kenmerk}
                </th>
                <td className={`${CEL} bg-smiley-mint/50`}>{r.smileyapp}</td>
                <td className={`${CEL} text-smiley-mute`}>{r.papier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* op de telefoon: per rij een kaart met dezelfde drie gegevens */}
      <ul className="space-y-4 md:hidden">
        {rijen.map((r) => (
          <li key={r.id} {...(r.lang ? { lang: r.lang } : {})} className="sm-onthul overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-smiley-ink/10">
            <h2 className="break-words bg-smiley-ink px-5 py-3.5 font-display text-lg font-bold text-white [hyphens:auto]">{r.kenmerk}</h2>
            <dl>
              <div className="bg-smiley-mint/50 p-5">
                <dt className="text-xs font-bold uppercase tracking-[0.16em] text-smiley-leaf">{t.kolomSmileyapp}</dt>
                <dd className="mt-1.5 break-words leading-relaxed [hyphens:auto]">{r.smileyapp}</dd>
              </div>
              <div className="p-5">
                <dt className="text-xs font-bold uppercase tracking-[0.16em] text-smiley-mute">{t.kolomPapier}</dt>
                <dd className="mt-1.5 break-words leading-relaxed text-smiley-mute [hyphens:auto]">{r.papier}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-3xl text-sm leading-relaxed text-smiley-mute">{t.uitleg}</p>
    </>
  );
}

/** De gele strook onder de tabel: een demo aanvragen of de pakketten bekijken. `basis`: het basispad van de taal. */
export function VergelijkSlot({ basis, teksten: t }: { basis: string; teksten: VergelijkTeksten }) {
  return (
    <section className="bg-smiley-sun">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-4 py-14 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-2xl font-display text-2xl font-bold leading-snug sm:text-3xl">{t.slot}</p>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link href={`${basis}/demo`} className="rounded-full bg-smiley-ink px-8 py-4 font-bold text-white transition-transform hover:-translate-y-0.5">
            {t.demoKnop}
          </Link>
          <Link href={`${basis}#pakketten`} className="rounded-full px-8 py-4 font-bold text-smiley-ink ring-2 ring-smiley-ink transition-transform hover:-translate-y-0.5">
            {t.pakkettenKnop}
          </Link>
        </div>
      </div>
    </section>
  );
}
