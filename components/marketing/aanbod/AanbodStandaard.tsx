import Image from "next/image";
import Link from "next/link";
import { prijsTekst, type AanbodItem, type InkijkScherm, type Pijler } from "@/lib/marketing/aanbod";
import { standaardVragen } from "@/lib/marketing/aanbod-vragen";
import { TelefonieDemo } from "@/components/marketing/aanbod/TelefonieDemo";

// De gewone opmaak van een aanbodpagina (/aanbod/<slug>), rijker gemaakt (15 nov 2026, eigenaar: "die pagina's moeten
// indruk wekken zoals andere sites ze tonen; deze is karig"): een kop met een foto of een voorbeeld van het product en een
// zwevende kaart, een strook met vaste feiten, kaarten met wat je krijgt, het verhaal met "In het kort", vragen en een
// oproep. Alles komt uit het item zelf (lib/marketing/aanbod.ts): geen verzonnen klanten, cijfers of beloftes. Een item
// met een eigen uitgebreide opmaak (lib/marketing/aanbod-uitgebreid.ts, e-facturatie) gebruikt dit niet.

const PIJLER_ICOON: Record<Pijler["sleutel"], string> = {
  personeel: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.9M16 3.1a3.5 3.5 0 0 1 0 6.8",
  online: "M3 5h18v12H3zM8 21h8M12 17v4",
  branche: "M4 21V9l8-6 8 6v12M9 21v-6h6v6",
  geld: "M4 7h16v10H4zM4 10h16M8 14h3",
};

const Vink = ({ className = "text-brand-500" }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`mt-1 shrink-0 ${className}`}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

function Icoon({ pad, className = "" }: { pad: string; className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={pad} />
    </svg>
  );
}

/** Een echt scherm van het product in een kader: een browservenster, of een telefoon. */
function SchermKader({ s, prioriteit = false }: { s: InkijkScherm; prioriteit?: boolean }) {
  if (s.toestel === "telefoon") {
    return (
      <div className="mx-auto w-full max-w-[280px] rounded-[2.4rem] border-[10px] border-ink bg-ink shadow-2xl">
        <Image src={`/aanbod/inkijk/${s.bestand}`} alt={s.alt} width={s.breedte} height={s.hoogte} sizes="280px" className="h-auto w-full rounded-[1.6rem]" priority={prioriteit} />
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
      <div className="flex items-center gap-1.5 border-b border-hair bg-paper-soft px-3 py-2" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <Image src={`/aanbod/inkijk/${s.bestand}`} alt={s.alt} width={s.breedte} height={s.hoogte} sizes="(max-width: 1024px) 100vw, 640px" className="h-auto w-full" priority={prioriteit} />
    </div>
  );
}

/** Rechts in de kop: de foto met een zwevende kaart, anders het eerste echte scherm, anders een voorbeeld van het product. */
function KopBeeld({ a, pijler }: { a: AanbodItem; pijler: Pijler }) {
  const kaart = (
    <div className="rounded-2xl bg-white p-4 text-ink shadow-2xl ring-1 ring-black/5 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Icoon pad={PIJLER_ICOON[pijler.sleutel]} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] font-bold">{a.naam}</span>
          <span className="text-[11px] font-semibold text-ok">Beschikbaar</span>
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-[12px]">
        {a.punten.slice(0, 4).map((p) => (
          <li key={p} className="flex gap-2 rounded-lg bg-paper-soft px-2.5 py-1.5 font-semibold">
            <Vink className="!mt-0.5 text-ok" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  const eersteScherm = a.inkijk?.find((x) => x.toestel !== "telefoon");
  if (!a.foto && eersteScherm) {
    return (
      <div className="relative pb-10 lg:pb-0">
        <SchermKader s={eersteScherm} prioriteit />
        <div className="absolute -bottom-2 left-4 right-4 sm:left-auto sm:right-[-12px] sm:w-[300px] lg:-bottom-10">{kaart}</div>
      </div>
    );
  }
  if (a.foto) {
    return (
      <div className="relative pb-10 lg:pb-0">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
          {/* foto's uit public/aanbod (bron en licentie in CREDITS.md), via next/image als WebP op maat */}
          <Image src={`/aanbod/${a.foto.bestand}`} alt={a.foto.alt} fill sizes="(max-width: 1024px) 100vw, 560px" className="object-cover" priority />
        </div>
        <div className="absolute -bottom-2 left-4 right-4 sm:left-auto sm:right-[-12px] sm:w-[300px] lg:-bottom-8">{kaart}</div>
      </div>
    );
  }
  return (
    <div aria-hidden>
      <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[11px] font-semibold text-white/60">ZekerFlex · {pijler.naam}</span>
        </div>
        {kaart}
      </div>
    </div>
  );
}

export function AanbodStandaard({ a, pijler }: { a: AanbodItem; pijler: Pijler }) {
  const vragen = standaardVragen(a);
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell grid items-center gap-12 py-16 md:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="eyebrow text-brand-mint">
              <Link href="/aanbod" className="hover:underline">
                Aanbod
              </Link>{" "}
              ·{" "}
              <Link href={`/aanbod#${pijler.sleutel}`} className="hover:underline">
                {pijler.naam}
              </Link>
            </p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold md:text-6xl">{a.naam}</h1>
            <p className="mt-6 max-w-2xl text-lg text-white/75">{a.kort}</p>
            <ul className="mt-6 space-y-2 text-[15px] text-white/85">
              {a.punten.slice(0, 3).map((p) => (
                <li key={p} className="flex gap-2">
                  <Vink className="text-brand-mint" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={a.start.href} className="btn-mint">
                {a.start.label}
              </Link>
              {a.voorbeelden && (
                <Link href={a.voorbeelden.href} className="btn-ghost-invert">
                  {a.voorbeelden.label}
                </Link>
              )}
              {a.start.href !== "/demo" && (
                <Link href="/demo" className="btn-ghost-invert">
                  Vraag een demo aan
                </Link>
              )}
            </div>
          </div>
          <KopBeeld a={a} pijler={pijler} />
        </div>
      </div>

      {/* vaste feiten in één regel */}
      <section aria-label="In het kort" className="border-b border-hair bg-white">
        <ul className="shell grid gap-x-8 gap-y-3 py-6 text-[14px] font-semibold text-ink sm:grid-cols-2 lg:grid-cols-4">
          {[`Prijs: ${prijsTekst(a)}`, "Een account aanmaken is gratis", "Eén login voor alles", "Draait op onze eigen server in Nederland"].map((p) => (
            <li key={p} className="flex gap-2">
              <Vink />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* luister mee: de assistent en een testklant (alleen waar luisterdemo aan staat, nu telefonie) */}
      {a.luisterdemo && <TelefonieDemo />}

      {/* wat je krijgt, als kaarten */}
      <section aria-labelledby="aanbod-krijgt" className="bg-paper-soft">
        <div className="shell py-16 md:py-20">
          <h2 id="aanbod-krijgt" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
            Wat je krijgt met <span className="text-brand-600">{a.naam.toLowerCase()}</span>
          </h2>
          <ul className={`mt-10 grid gap-4 sm:grid-cols-2 ${a.punten.length % 3 === 0 ? "lg:grid-cols-3" : a.punten.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            {a.punten.map((p, i) => (
              <li key={p} className="rounded-2xl border border-hair bg-white p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 font-display text-[15px] font-bold text-brand-700">{i + 1}</span>
                <p className="mt-4 text-[16px] font-semibold leading-snug text-ink">{p}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* echte schermen van het product, met voorbeeldgegevens */}
      {a.inkijk && a.inkijk.length > 0 && (
        <section aria-labelledby="aanbod-inkijk" className="bg-white">
          <div className="shell py-16 md:py-20">
            <h2 id="aanbod-inkijk" className="text-center font-display text-3xl font-bold text-ink md:text-4xl">
              Zo ziet het <span className="text-brand-600">eruit</span>
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-[16px] text-neutralx-600">Echte schermen van ZekerFlex, met voorbeeldgegevens.</p>
            <div className="mt-12 space-y-16">
              {a.inkijk.map((x, i) => (
                <figure key={x.bestand} className={`grid items-center gap-8 ${i % 2 === 1 ? "lg:grid-cols-[0.65fr_1.35fr] lg:[&>*:first-child]:order-2" : "lg:grid-cols-[1.35fr_0.65fr]"}`}>
                  <SchermKader s={x} />
                  <figcaption>
                    <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-brand-700">{String(i + 1).padStart(2, "0")}</span>
                    <span className="mt-2 block font-display text-2xl font-bold text-ink">{x.titel}</span>
                    <span className="mt-2 block text-[16px] leading-relaxed text-neutralx-700">{x.tekst}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* het verhaal, met In het kort */}
      <section aria-labelledby="aanbod-wat" className="bg-white">
        <div className="shell py-16 md:py-20">
          <div className="grid gap-12 md:grid-cols-[1.4fr_1fr]">
            <div className="min-w-0">
              <h2 id="aanbod-wat" className="font-display text-3xl font-bold text-ink md:text-4xl">
                Wat het is
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-neutralx-700">{a.tekst}</p>
            </div>
            <aside className="h-fit rounded-2xl border border-hair bg-paper-soft p-6">
              <h2 className="font-display text-lg font-bold text-ink">In het kort</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-neutralx-500">Voor wie</dt>
                  <dd className="font-medium text-ink">{a.voorWie}</dd>
                </div>
                <div>
                  <dt className="text-neutralx-500">Prijs</dt>
                  <dd className="font-medium text-ink">{prijsTekst(a)}</dd>
                </div>
                <div>
                  <dt className="text-neutralx-500">Werkt samen met</dt>
                  <dd className="font-medium text-ink">Je ZekerFlex-account: één login voor alles</dd>
                </div>
              </dl>
              <Link href={a.start.href} className="btn-primary mt-6 block w-full text-center text-sm">
                {a.start.label}
              </Link>
            </aside>
          </div>
        </div>
      </section>

      {/* vragen */}
      <section aria-labelledby="aanbod-vragen" className="bg-paper-soft">
        <div className="shell grid gap-10 py-16 md:py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 id="aanbod-vragen" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Veelgestelde vragen
          </h2>
          <div className="space-y-3">
            {vragen.map((v) => (
              <details key={v.vraag} className="group rounded-2xl border border-hair bg-white px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {v.vraag}
                  <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-neutralx-700">{v.antwoord}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* oproep */}
      <section aria-labelledby="aanbod-begin" className="bg-white">
        <div className="shell py-16 text-center md:py-20">
          <h2 id="aanbod-begin" className="font-display text-3xl font-bold text-ink md:text-4xl">
            Begin met <span className="text-brand-600">{a.naam.toLowerCase()}</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[16px] text-neutralx-600">{a.kort}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href={a.start.href} className="btn-primary">
              {a.start.label}
            </Link>
            {a.start.href !== "/demo" && (
              <Link href="/demo" className="btn-ghost">
                Vraag een demo aan
              </Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
