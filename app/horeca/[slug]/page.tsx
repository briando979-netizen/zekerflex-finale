import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { zaakVanSlug, menukaart } from "@/lib/horeca/store";
import { ALLERGENEN, type Allergeen } from "@/lib/horeca/allergenen";
import { DAGEN, leesTijden, tijdTekst } from "@/lib/horeca/tijden";
import { soortLabel } from "@/lib/horeca/soorten";
import { euro, zaakWeergave } from "@/lib/horeca/weergave";
import { telefoonLink } from "@/lib/rijschool/format";
import { leesbaarOpLicht, ZAND } from "@/lib/rijschool/kleuren";

export const dynamic = "force-dynamic";

// De homepage van een horecazaak: hero, de menukaart (met allergenen en wat
// uitverkocht is) en de openingstijden. De layout bewaakt of hij zichtbaar is.

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const z = await zaakVanSlug((await params).slug).catch(() => null);
  if (!z) return { title: "Niet gevonden" };
  return {
    title: { absolute: z.plaats ? `${z.naam} · ${z.plaats}` : z.naam },
    description: zaakWeergave(z).intro || `${soortLabel(z.soort)} ${z.naam}${z.plaats ? ` in ${z.plaats}` : ""}: menukaart en openingstijden.`,
    robots: z.online ? undefined : { index: false, follow: false },
  };
}

export default async function HorecaHome({ params }: { params: Promise<{ slug: string }> }) {
  const z = await zaakVanSlug((await params).slug).catch(() => null);
  if (!z) notFound();
  const w = zaakWeergave(z);
  const { categorieen, items } = await menukaart(z.id);
  const tijden = leesTijden(z.openingstijden);
  const groepen = [
    ...categorieen.map((c) => ({ id: c.id, naam: c.naam, items: items.filter((i) => i.categorieId === c.id) })),
    { id: "overig", naam: "Overig", items: items.filter((i) => !i.categorieId) },
  ].filter((g) => g.items.length);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-[var(--rs-nacht)] text-[var(--rs-creme)]">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 -z-10 h-96 w-96 rounded-full bg-[var(--rs-accent)] opacity-25 blur-3xl" />
        <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-14 sm:px-8 lg:pt-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">
            {soortLabel(z.soort)}
            {z.plaats && ` in ${z.plaats}`}
          </p>
          <h1 className="mt-4 max-w-4xl font-display text-[clamp(2.6rem,7vw,5rem)] font-bold leading-[0.95] tracking-[-0.03em]">{w.kop || z.naam}</h1>
          {w.intro && <p className="mt-6 max-w-2xl text-lg text-[var(--rs-creme)]/85">{w.intro}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#menukaart" className="rounded-full bg-[var(--rs-accent-knop)] px-6 py-3 font-bold text-[var(--rs-op-accent)]">
              Bekijk de menukaart
            </a>
            {z.telefoon && (
              <a href={telefoonLink(z.telefoon)} className="rounded-full px-6 py-3 font-semibold ring-1 ring-white/30 hover:bg-white/10">
                Bel om te reserveren
              </a>
            )}
          </div>
        </div>
      </section>

      <section id="menukaart" className="mx-auto max-w-[1280px] scroll-mt-20 px-4 py-14 sm:px-8" aria-labelledby="menukaart-kop">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-tekst)]">Menukaart</p>
        <h2 id="menukaart-kop" className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Wat we serveren
        </h2>
        {groepen.length === 0 && <p className="mt-6 text-[#4B5563]">De menukaart volgt binnenkort.</p>}
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {groepen.map((g) => (
            <section key={g.id} className="rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8" aria-labelledby={`cat-${g.id}`}>
              <h3 id={`cat-${g.id}`} className="font-display text-2xl font-bold">
                {g.naam}
              </h3>
              <ul className="mt-4 divide-y divide-[#0A120E]/10">
                {g.items.map((i) => (
                  <li key={i.id} className="py-4">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className={`font-semibold ${i.beschikbaar ? "" : "text-[#4B5563]"}`}>
                        {i.naam}
                        {i.veganistisch ? <span className="ml-2 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-xs font-bold text-[#15803D]">veganistisch</span> : i.vegetarisch ? <span className="ml-2 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-xs font-bold text-[#15803D]">vegetarisch</span> : null}
                        {!i.beschikbaar && <span className="ml-2 rounded-full bg-[#F4E9DA] px-2 py-0.5 text-xs font-bold text-[#4B5563]">uitverkocht</span>}
                      </p>
                      <p className="whitespace-nowrap font-display text-lg font-bold text-[var(--rs-kleur-tekst)]">{euro(i.prijsCent)}</p>
                    </div>
                    {i.omschrijving && <p className="mt-1 text-sm text-[#4B5563]">{i.omschrijving}</p>}
                    {i.allergenen.length > 0 && (
                      <p className="mt-1 text-xs text-[#4B5563]">Bevat: {i.allergenen.map((a) => ALLERGENEN[a as Allergeen]?.toLowerCase() ?? a).join(", ")}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-6 text-sm text-[#4B5563]">Allergie of dieetwens? Vraag het ons gerust, we denken graag mee.</p>
      </section>

      <section id="openingstijden" className="bg-[var(--rs-zand)] py-14" aria-labelledby="tijden-kop">
        <div className="mx-auto grid max-w-[1280px] gap-8 px-4 sm:px-8 md:grid-cols-2">
          <div>
            {/* op zand, niet op crème: de accentkleur daarop afgestemd, zodat hij leesbaar blijft */}
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: leesbaarOpLicht(z.accent, ZAND) }}>
              Openingstijden
            </p>
            <h2 id="tijden-kop" className="mt-2 font-display text-3xl font-bold tracking-tight">
              Wanneer we open zijn
            </h2>
          </div>
          <dl className="rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
            {DAGEN.map(({ dag, naam }) => (
              <div key={dag} className="flex justify-between gap-4 border-b border-[#0A120E]/10 py-2 last:border-0">
                <dt>{naam}</dt>
                <dd className="font-semibold">{tijdTekst(tijden[dag])}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
