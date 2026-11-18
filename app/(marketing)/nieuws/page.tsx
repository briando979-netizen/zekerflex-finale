import type { Metadata } from "next";
import Link from "next/link";
import { canonical, CONTACTS } from "@/lib/seo";
import { nieuwsDatum, nieuwsKaarten } from "@/lib/nieuws/lijst";
import { isRubriek, RUBRIEKEN, RUBRIEK_NAAM } from "@/lib/nieuws/regels";
import { geplaatsteBerichten } from "@/lib/nieuws/store";

// De nieuwsroom (18 nov 2026): het laatste nieuws over werk, regels en ondernemen, kort uitgelegd, plus ons eigen nieuws.
// De berichten schrijft de site zelf uit openbare bronnen (lib/nieuws); elk bericht noemt zijn bron.

export const metadata: Metadata = {
  title: "Nieuwsroom",
  description: "Het laatste nieuws over flexwerk, de arbeidsmarkt en regels voor zzp'ers, uitzendkrachten en bedrijven. Kort uitgelegd, met de bron erbij.",
  ...canonical("/nieuws"),
};

// de berichten komen uit de opslag: zonder dit legt de build een lege lijst vast
export const dynamic = "force-dynamic";

const PER_KEER = 24;

export default async function NieuwsroomPage(props: { searchParams: Promise<{ rubriek?: string }> }) {
  const { rubriek: gekozen } = await props.searchParams;
  const rubriek = gekozen && isRubriek(gekozen) ? gekozen : null;
  const alle = nieuwsKaarten(await geplaatsteBerichten());
  const kaarten = (rubriek ? alle.filter((k) => k.rubriek === rubriek) : alle).slice(0, PER_KEER);
  const tab = (actief: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-semibold transition ${actief ? "border-ink bg-ink text-white" : "border-hair bg-paper text-ink hover:border-ink"}`;

  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <p className="eyebrow text-brand-mint">Nieuwsroom</p>
          <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">Het laatste nieuws over flexwerk</h1>
          <p className="mt-5 max-w-xl text-lg text-white/70">
            Wat er speelt op de arbeidsmarkt en in de regels voor zzp&apos;ers, uitzendkrachten en bedrijven die inhuren. Kort uitgelegd, met de bron erbij.
          </p>
          <p className="mt-6 text-sm text-white/70">
            Pers en media:{" "}
            <a href={`mailto:${CONTACTS.pers}`} className="font-semibold text-brand-mint underline">
              {CONTACTS.pers}
            </a>
          </p>
        </div>
      </div>

      <section className="bg-paper">
        <div className="shell py-12 md:py-16">
          <nav aria-label="Rubrieken" className="flex flex-wrap gap-2">
            <Link href="/nieuws" className={tab(!rubriek)} aria-current={!rubriek ? "page" : undefined}>
              Alles
            </Link>
            {RUBRIEKEN.map((r) => (
              <Link key={r} href={`/nieuws?rubriek=${r}`} className={tab(rubriek === r)} aria-current={rubriek === r ? "page" : undefined}>
                {RUBRIEK_NAAM[r]}
              </Link>
            ))}
          </nav>

          {kaarten.length === 0 ? (
            <p className="mt-10 text-neutralx-600">In deze rubriek staat nog geen bericht. Kijk bij Alles voor het laatste nieuws.</p>
          ) : (
            <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {kaarten.map((k) => (
                <Link
                  key={k.href}
                  href={k.href}
                  className="group flex flex-col rounded-2xl border border-hair bg-paper p-6 shadow-e1 transition-all hover:-translate-y-1 hover:shadow-e3"
                >
                  <span className="font-mono text-xs uppercase tracking-wide text-neutralx-500">
                    {nieuwsDatum(k.datum)} · {RUBRIEK_NAAM[k.rubriek]}
                  </span>
                  <h2 className="mt-2 font-display text-lg font-semibold text-ink">{k.titel}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-neutralx-600">{k.samenvatting}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                    Lezen · {k.minuten} min
                    <span className="transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                  {k.bron ? <span className="mt-2 text-xs text-neutralx-500">Bron: {k.bron}</span> : null}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-14 rounded-2xl border border-hair bg-paper p-6 md:p-8">
            <h2 className="font-display text-xl font-bold text-ink">Hoe deze berichten gemaakt worden</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-neutralx-600">
              De berichten met een bron schrijft onze site zelf, met hulp van AI, op basis van openbare berichten van officiële instanties. We
              vatten samen in gewone taal en verzinnen niets: staat een getal niet in de bron, dan komt het bericht er niet. Onder elk bericht
              staat een link naar de bron. De berichten in de rubriek Van ZekerFlex schrijven we zelf. Zie je een fout? Mail{" "}
              <a href={`mailto:${CONTACTS.pers}`} className="font-semibold text-ink underline">
                {CONTACTS.pers}
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
