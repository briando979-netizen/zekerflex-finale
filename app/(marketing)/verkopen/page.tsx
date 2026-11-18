import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, Section, SectionHead, Stat } from "@/components/marketing/primitives";
import { FotoKolom } from "@/components/marketing/HeroMetFoto";
import { VerkopenNav } from "@/components/marketing/Verkopen";
import { paginaFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";
import { AGENDA, HANDIGE_LINKS, RUBRIEKEN, TIPS, UPDATES, VERKOPEN_PAD, VERKOPEN_START_PAD, VERKOPERSOMGEVING_PAD, rubriekPad } from "@/lib/shop/partnerplatform";
import { VERKOOP_COMMISSIE_PCT, VERKOPER_UITBETALEN_VANAF_CENTS, VERKOPER_VAST_NA_DAGEN, VERKOPER_VERZENDT_BINNEN_WERKDAGEN } from "@/lib/shop/verkoper-core";

const title = "Partnerplatform: verkopen via ZekerFlex onder je eigen naam";
const description =
  "Zet je eigen producten in de ZekerFlex-shop. Kopers betalen veilig via ZekerFlex, jij verstuurt. Commissie per verkoop, geen abonnement. Lees het beleid, hoe bestellingen en uitbetaling werken en meld je bedrijf aan.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["verkopen via zekerflex", "partnerplatform", "producten verkopen online", "marktplaats voor bedrijven", "verkopen zonder abonnement"],
  ...canonical(VERKOPEN_PAD, { title, description }),
};

// /verkopen (18 nov 2026): de startpagina van het Partnerplatform, voor bedrijven die hun producten in de ZekerFlex-shop
// willen verkopen. De regels staan in lib/shop/verkoper-core.ts, de teksten in lib/shop/partnerplatform.ts. De knop
// "Start met verkopen" leidt naar /verkopen/start en vandaar naar de bestaande aanmelding of Studio → Verkopen.
// Er staat geen citaat van een klant: dat komt er pas als er een echt citaat is.

const euro = (cents: number) => `€ ${(cents / 100).toFixed(0)}`;

export default function PartnerplatformPage() {
  const kruimels = breadcrumbJsonLd([
    ["Home", "/"],
    ["Partnerplatform", VERKOPEN_PAD],
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(kruimels) }} />
      <VerkopenNav actief="home" />

      <div className="hero-ink text-white">
        <div className="shell grid items-center gap-10 py-14 md:py-20 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="eyebrow text-brand-mint">Verkopen via ZekerFlex</p>
            <h1 className="mt-4 text-balance font-display text-4xl font-bold leading-tight md:text-6xl">Welkom op het Partnerplatform</h1>
            <p className="mt-6 max-w-2xl text-lg text-white/70">
              Zet je eigen producten in de ZekerFlex-shop, onder je eigen bedrijfsnaam. De koper betaalt veilig via ZekerFlex, jij verstuurt. Hier lees je hoe het werkt en wat de regels zijn.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={VERKOPEN_START_PAD} className="btn-mint">
                Start met verkopen
              </Link>
              <Link href={VERKOPERSOMGEVING_PAD} className="btn-ghost-invert">
                Inloggen als verkoper
              </Link>
            </div>
          </div>
          <FotoKolom foto={paginaFoto("verkopen")} />
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="In het kort" title="Zo zit het in elkaar" />
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Stat value={`${VERKOOP_COMMISSIE_PCT}%`} label="Commissie per verkoop. Geen abonnement, geen andere kosten." />
          <Stat value={`${VERKOPER_VERZENDT_BINNEN_WERKDAGEN} werkdagen`} label="Binnen die tijd verstuur je een betaalde bestelling." />
          <Stat value={`${VERKOPER_VAST_NA_DAGEN} dagen`} label="Na de bestelling staat een verzonden verkoop vast." />
          <Stat value={euro(VERKOPER_UITBETALEN_VANAF_CENTS)} label="Vanaf dit bedrag betalen we maandelijks uit op je rekening." />
        </div>
      </Section>

      <Section tone="soft" id="rubrieken">
        <SectionHead eyebrow="Alles over verkopen" title="Kies een onderwerp" intro="Per onderwerp de regels zoals ze nu gelden, in gewone taal." />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {RUBRIEKEN.map((r) => (
            <Link key={r.slug} href={rubriekPad(r.slug)} className="flex flex-col rounded-2xl border border-hair bg-white p-5 transition hover:border-ink">
              <p className="font-display text-base font-bold text-ink">{r.naam}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{r.kort}</p>
              <span className="mt-auto pt-4 text-sm font-semibold text-brand-600">
                Lees meer <span aria-hidden>→</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section tone="paper" id="updates">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <SectionHead eyebrow="Nieuws" title="De laatste updates" />
            <ul className="mt-8 space-y-4">
              {UPDATES.map((u) => (
                <li key={u.titel} className="rounded-2xl border border-hair bg-white p-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{u.datum ?? "Geldt nu"}</p>
                  <h3 className="mt-1 font-display text-lg font-bold text-ink">{u.titel}</h3>
                  <p className="mt-2 text-[0.975rem] leading-relaxed text-neutralx-600">{u.tekst}</p>
                  <Link href={u.href} className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
                    {u.label} <span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionHead eyebrow="Planning" title="Voor in je agenda" />
            <ol className="mt-8 space-y-4">
              {AGENDA.map((a) => (
                <li key={a.iso} className="rounded-2xl border border-hair bg-paper-soft p-5">
                  <time dateTime={a.iso} className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">
                    {a.datum}
                  </time>
                  <h3 className="mt-1 font-display text-base font-bold text-ink">{a.titel}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{a.tekst}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section tone="soft" id="tips">
        <SectionHead eyebrow="Tips" title="Hoe jij nog succesvoller kan zijn" intro="Vier dingen die je zelf in de hand hebt." />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TIPS.map((t) => (
            <div key={t.titel} className="rounded-2xl border border-hair bg-white p-5">
              <h3 className="font-display text-base font-bold text-ink">{t.titel}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{t.tekst}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="paper" id="links">
        <SectionHead eyebrow="Snel naar" title="Handige links" />
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HANDIGE_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex items-center justify-between rounded-xl border border-hair bg-white px-5 py-4 text-[0.975rem] font-semibold text-ink transition hover:border-ink">
                {l.label} <span aria-hidden>→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand
        title="Begin vandaag met verkopen"
        body="Aanmelden kost niets. Je betaalt alleen commissie over wat je verkoopt."
        primaryHref={VERKOPEN_START_PAD}
        primaryLabel="Start met verkopen"
        secondaryHref="/shop"
        secondaryLabel="Bekijk de shop"
      />
    </>
  );
}
