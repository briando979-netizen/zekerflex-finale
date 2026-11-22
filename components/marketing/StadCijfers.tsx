import Link from "next/link";
import type { CijferBlok, Link as LinkData } from "@/lib/seo-stad";

// De echte cijfers van een stad (22 nov 2026, lib/seo-stad.ts): drie tegels, de zinnen met wat het betekent, een tabel met
// alle bedrijfstakken die het CBS per gemeente telt, en de bron met een link naar elke CBS-tabel. Servercomponent, zelfde
// kaarten en kleuren als de rest van de branche- en stadspagina's; de cijfers zelf zijn neutraal (geen kleur = geen oordeel).

export function StadCijfers({ blok }: { blok: CijferBlok }) {
  return (
    <div className="mt-12 max-w-3xl">
      <h2 className="font-display text-xl font-bold text-ink">{blok.kop}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-3">
        {blok.tegels.map((t, i) => (
          <li key={`${i}-${t.label}`} className="rounded-2xl border border-hair bg-white p-4">
            <p className="font-display text-2xl font-bold tabular-nums text-ink">{t.waarde}</p>
            <p className="mt-1 text-sm text-neutralx-600">{t.label}</p>
          </li>
        ))}
      </ul>
      {blok.alineas.map((a, i) => (
        <p key={i} className="mt-3 leading-relaxed text-neutralx-600">
          {a}
        </p>
      ))}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-sm">
          <caption className="mb-2 text-left font-semibold text-ink">{blok.tabel.kop}</caption>
          <thead>
            <tr className="border-b border-hairstrong text-neutralx-500">
              {blok.tabel.kolommen.map((k, i) => (
                <th key={k} scope="col" className={`py-2 font-medium ${i === 0 ? "pr-4" : "pr-4 text-right"}`}>
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blok.tabel.rijen.map((r) => (
              <tr key={r.label} className="border-b border-hair">
                <th scope="row" className="py-2 pr-4 font-normal text-neutralx-700">
                  {r.label}
                </th>
                <td className="py-2 pr-4 text-right tabular-nums text-ink">{r.aantal}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-ink">{r.per1000}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutralx-500">{blok.bronTekst}</p>
      <p className="mt-1 text-xs text-neutralx-500">
        {blok.bronnen.map((b, i) => (
          <span key={b.tabel}>
            {i > 0 ? " · " : ""}
            <a href={b.href} target="_blank" rel="noopener noreferrer" title={b.titel} className="underline hover:text-ink">
              {b.tabel}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}

/** Een rij ronde links (andere steden, andere branches). */
export function LinkRij({ kop, links }: { kop: string; links: LinkData[] }) {
  return (
    <>
      <h2 className="mt-14 font-display text-lg font-bold text-ink">{kop}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="inline-block rounded-full border border-hairstrong bg-white px-3 py-1 text-sm text-neutralx-700 hover:border-brand-500">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/** De eigen tekst van de stad (lib/seo-cities.ts: local), zodat elke stadspagina iets eigens heeft. */
export function StadBlok({ kop, tekst }: { kop: string; tekst: string }) {
  return (
    <div className="mt-12 max-w-3xl">
      <h2 className="font-display text-xl font-bold text-ink">{kop}</h2>
      <p className="mt-3 leading-relaxed text-neutralx-600">{tekst}</p>
    </div>
  );
}

/** De drie kaarten onder de kop. */
export function Voordelen({ lijst }: { lijst: [string, string][] }) {
  return (
    <ul className="mt-12 grid gap-4 sm:grid-cols-3">
      {lijst.map(([t, b]) => (
        <li key={t} className="rounded-2xl border border-hair bg-white p-5">
          <p className="font-display font-bold text-ink">{t}</p>
          <p className="mt-2 text-sm text-neutralx-600">{b}</p>
        </li>
      ))}
    </ul>
  );
}
