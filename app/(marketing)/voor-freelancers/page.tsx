import type { Metadata } from "next";
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Section, SectionHead, FaqList } from "@/components/marketing/primitives";
import { HeroChecks } from "@/components/marketing/HeroChecks";
import { Photo } from "@/components/marketing/Photo";
import { SceneWork } from "@/components/marketing/Scene";
import { FreelanceTelefoon, type FreelanceScherm } from "@/components/marketing/FreelanceTelefoon";
import { FOTO_MAP } from "@/lib/marketing/fotos";
import { SECTORS } from "@/lib/seo-sectors";
import { seoMetadata } from "@/lib/ontwerp/seo-store";
import { contentKeys, getContentMap } from "@/lib/content/store";
import { zichtbareSecties } from "@/lib/ontwerp/vaste-paginas";
import { getPaginaIndeling } from "@/lib/ontwerp/vaste-paginas-store";

// titel en omschrijving: de standaard in lib/ontwerp/seo.ts, of een eigen versie uit de Site-ontwerper (SEO)
export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata("/voor-freelancers", {
    keywords: [
      "zzp klus vinden",
      "flexwerk vinden",
      "freelance opdrachten",
      "bijbaan direct uitbetaald",
      "zelfde dag uitbetaald",
      "werk in de buurt",
      "freelance werk zonder tussenpersoon",
    ],
  });
}

// 21 nov 2026 (eigenaar): de opbouw van een bekende freelancerpagina, met de uitstraling van ZekerFlex en zonder de
// uitlegvideo's: drie kenmerken, vier stappen met de app op een telefoon, de functies als kaarten, de branches met foto's,
// "nog niet overtuigd?", vragen en een donkere slotband met de telefoon. Alleen wat de app nu echt doet.

const KENMERKEN = [
  { kop: "€ 0", tekst: "Gratis voor werkers. De opdrachtgever betaalt de platformkosten." },
  { kop: "5 talen", tekst: "De app in het Nederlands, Engels, Pools, Roemeens en Oekraïens." },
  { kop: "1 app", tekst: "Klussen, chat, inchecken, uren en facturen op één plek." },
];

const STAPPEN: { titel: string; tekst: string; scherm: FreelanceScherm; app?: boolean }[] = [
  {
    titel: "Download de app",
    tekst: "Installeer ZekerFlex op je telefoon. Je klussen, je chat met de opdrachtgever en je uren heb je dan altijd bij de hand.",
    scherm: "lijst",
    app: true,
  },
  {
    titel: "Maak je profiel compleet",
    tekst: "Kies zzp'er of flexwerker, vul je KVK-nummer in en doe de ID-check in de app. Zo weten opdrachtgevers wie er komt.",
    scherm: "profiel",
  },
  {
    titel: "Vind je eerste klus",
    tekst: "Kies je branches en zie klussen bij jou in de buurt, met de reistijd erbij. Past er een? Tik op Reageer op deze klus, of doe een tegenbod.",
    scherm: "klus",
  },
  {
    titel: "Werk en krijg je geld",
    tekst: "Check in op locatie, vul na afloop je uren in en kies hoe snel je wordt uitbetaald. De factuur maakt ZekerFlex voor je.",
    scherm: "uren",
  },
];

const FUNCTIES = [
  { icoon: "📍", titel: "Klussen in de buurt", tekst: "Bij elke klus zie je hoe lang je erover doet met de fiets, de auto of het ov." },
  { icoon: "💬", titel: "Chat met de opdrachtgever", tekst: "Vraag het direct in de app, vóór en na je klus." },
  { icoon: "🤝", titel: "Doe een tegenbod", tekst: "Vind je het tarief te laag? Bij freelance klussen stel je zelf een ander uurtarief voor." },
  { icoon: "✅", titel: "Inchecken met je telefoon", tekst: "Op de dag zelf check je in en uit op locatie. Zo kloppen je uren altijd." },
  { icoon: "⏱️", titel: "Uren in een paar tikken", tekst: "Na je klus vul je je uren in. De opdrachtgever keurt ze goed in de app." },
  { icoon: "🧾", titel: "Geen facturen maken", tekst: "ZekerFlex maakt je factuur automatisch, met de juiste btw." },
  { icoon: "💸", titel: "Kies hoe snel je geld komt", tekst: "Gratis wachten tot de opdrachtgever betaalt (binnen 30 dagen), of sneller tegen een kleine fee." },
  { icoon: "⭐", titel: "Bouw je reputatie op", tekst: "Goede beoordelingen en betrouwbaar werk brengen je meer en beter werk." },
  { icoon: "🛡️", titel: "Afspraken vastgelegd", tekst: "Per opdrachtgever liggen de afspraken vast, en je ziet het als je veel uren bij één opdrachtgever maakt." },
];

const BRANCHE_FOTO: Record<string, string> = {
  horeca: "horeca-terras-bediening.jpg",
  logistiek: "logistiek-magazijn-dozen.jpg",
  schoonmaak: "campagne-ramen.jpg",
  evenementen: "campagne-festival-crew.jpg",
  retail: "campagne-kledingrek.jpg",
};

const FAQ = [
  { q: "Wat heb ik nodig om te beginnen?", a: "Een KVK-inschrijving (als zzp'er of flexwerker) en een identiteitsbewijs voor de ID-check. Verder een rekeningnummer voor je uitbetalingen." },
  { q: "Kan ik ook zonder KVK werken?", a: "Ja, als uitzendkracht via een aangesloten uitzendbureau. Dat bureau is dan je werkgever. Hoe dat werkt, lees je op zekerflex.com/starten-als-uitzendkracht." },
  { q: "Kost het mij iets?", a: "Nee. Meedoen als freelancer is volledig gratis. De platformfee wordt bij de opdrachtgever in rekening gebracht." },
  { q: "Wanneer krijg ik precies betaald?", a: "Dat bepaal je zelf per dienst. Standaard wacht je gratis tot de opdrachtgever binnen 30 dagen afrekent. Wil je eerder je geld, dan kies je een snellere uitbetaling tegen een fee: betaalopdracht direct indienen (4% van de factuur) of binnen 3 werkdagen indienen (2%)." },
  { q: "Vanaf welke leeftijd kan ik werken?", a: "Vanaf 18 jaar. Ben je 16 of 17? Laat dan je e-mailadres achter op zekerflex.com/nog-geen-18, dan krijg je bericht zodra je bij ons aan de slag kunt." },
  { q: "Wat als er een geschil is over mijn uren?", a: "Dan wordt de betaling voor die dienst aangehouden tot een dispuutmanager ernaar heeft gekeken. Je GPS check-in en de goedgekeurde planning wegen daarin mee." },
];

export default async function VoorFreelancersPage() {
  // teksten uit de Site-ontwerper (Teksten); zonder eigen versie exact de standaard
  const tekst = await getContentMap(contentKeys("vf."));
  const v = (k: string) => tekst[k] ?? "";
  // de onderdelen onder de kop: volgorde en zichtbaarheid uit de Site-ontwerper (Pagina's); zonder eigen indeling exact de standaard
  const onderdelen: Record<string, ReactNode> = {
    kenmerken: (
      <Section tone="soft">
        <div className="grid gap-5 sm:grid-cols-3">
          {KENMERKEN.map((k) => (
            <div key={k.kop} className="rounded-2xl border border-hair bg-white p-6 text-center">
              <p className="font-display text-4xl font-bold text-brand-600">{k.kop}</p>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{k.tekst}</p>
            </div>
          ))}
        </div>
      </Section>
    ),
    stappen: (
      <Section tone="paper">
        <div id="stappen" className="scroll-mt-24">
          <SectionHead eyebrow={v("vf.how.eyebrow")} title={v("vf.how.title")} cms={{ eyebrow: "vf.how.eyebrow", title: "vf.how.title" }} />
        </div>
        <ol className="mt-12 space-y-16">
          {STAPPEN.map((s, i) => (
            <li key={s.titel} className="grid items-center gap-8 md:grid-cols-2">
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <span className="num inline-grid h-10 w-10 place-items-center rounded-full bg-brand-500 font-mono text-base text-white">{i + 1}</span>
                <h3 className="mt-3 font-display text-2xl font-bold text-ink">{s.titel}</h3>
                <p className="mt-2 max-w-xl text-[1.02rem] leading-relaxed text-neutralx-600">{s.tekst}</p>
                {s.app && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href="/app" className="btn-primary">
                      Naar de app
                    </Link>
                  </div>
                )}
              </div>
              <div className={i % 2 === 1 ? "md:order-1" : ""}>
                <FreelanceTelefoon scherm={s.scherm} bijschrift="Voorbeeld uit de app" />
              </div>
            </li>
          ))}
        </ol>
      </Section>
    ),
    voordelen: (
      <Section tone="soft">
        <SectionHead eyebrow={v("vf.got.eyebrow")} title={v("vf.got.title")} cms={{ eyebrow: "vf.got.eyebrow", title: "vf.got.title" }} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FUNCTIES.map((f) => (
            // op de telefoon het pictogram links van de tekst (kaarten half zo hoog), vanaf sm erboven
            <div key={f.titel} className="flex gap-4 rounded-2xl border border-hair bg-white p-5 shadow-sm sm:block sm:p-6">
              <span aria-hidden className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-brand-50 text-xl sm:h-12 sm:w-12 sm:text-2xl">
                {f.icoon}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold text-ink sm:mt-4">{f.titel}</h3>
                <p className="mt-1 text-[0.95rem] leading-relaxed text-neutralx-600 sm:mt-1.5">{f.tekst}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    ),
    branches: (
      <Section tone="paper">
        <SectionHead eyebrow="Branches" title="Werk in de branche die bij je past" />
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
          {SECTORS.map((s) => (
            <Link key={s.key} href={`/${s.workerSlug}`} className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
              <Image
                src={`${FOTO_MAP}/${BRANCHE_FOTO[s.key] ?? "campagne-crew-pauze.jpg"}`}
                alt=""
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover opacity-80 transition duration-300 group-hover:scale-105 group-hover:opacity-70"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" aria-hidden />
              <span className="absolute inset-x-0 bottom-0 p-4 text-white">
                <span className="block font-display text-lg font-bold md:text-xl">{s.label}</span>
                <span className="mt-0.5 block text-xs text-white/80">{s.rolesShort}</span>
              </span>
            </Link>
          ))}
          <Link
            href="/klussen"
            className="flex aspect-[4/3] flex-col justify-end rounded-2xl bg-brand-500 p-4 text-white transition hover:bg-brand-600"
          >
            <span className="font-display text-lg font-bold md:text-xl">Alle klussen</span>
            <span className="mt-0.5 text-xs text-white/85">Bekijk wat er nu open staat →</span>
          </Link>
        </div>
      </Section>
    ),
    overtuigd: (
      <Section tone="soft">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
            <Image src={`${FOTO_MAP}/campagne-barista.jpg`} alt="Een barista zet koffie achter de bar" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
          </div>
          <div>
            <p className="eyebrow">Vrijheid</p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-ink md:text-4xl">Nog niet overtuigd?</h2>
            <p className="mt-4 text-[1.02rem] leading-relaxed text-neutralx-600">
              Jij bepaalt waar en wanneer je werkt. Een dag, een avond of elke zaterdag: je kiest alleen klussen die in je agenda passen. Geen vast contract en
              geen verplichtingen. Je eigen uurtarief bepaal je zelf, en elke klus maakt je profiel sterker.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/klussen" className="btn-primary">
                Bekijk klussen
              </Link>
              <Link href="/rekentools/zzp-uurtarief-berekenen" className="btn-ghost">
                Bereken je uurtarief
              </Link>
            </div>
          </div>
        </div>
      </Section>
    ),
    faq: (
      <Section tone="paper">
        <SectionHead eyebrow={v("vf.faq.eyebrow")} title={v("vf.faq.title")} cms={{ eyebrow: "vf.faq.eyebrow", title: "vf.faq.title" }} />
        <div className="mt-10 max-w-3xl">
          <FaqList items={FAQ} />
        </div>
      </Section>
    ),
    slot: (
      <Section tone="paper">
        <div className="grid items-center gap-10 overflow-hidden rounded-3xl bg-ink px-6 py-10 text-white md:grid-cols-[1.2fr_0.8fr] md:px-12 md:py-14">
          <div>
            <h2 className="font-display text-3xl font-bold leading-tight md:text-4xl" data-cms-key="vf.cta.title">
              {v("vf.cta.title")}
            </h2>
            <p className="mt-3 max-w-lg text-white/75" data-cms-key="vf.cta.body" data-cms-ml="1">
              {v("vf.cta.body")}
            </p>
            <ul className="mt-6 space-y-2.5 text-[0.975rem] text-white/90">
              {["Gratis voor werkers", "Reageer op klussen die je leuk vindt", "Je factuur wordt automatisch gemaakt"].map((p) => (
                <li key={p} className="flex items-center gap-2.5">
                  <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-brand-mint text-[11px] font-bold text-ink">
                    ✓
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register?type=freelancer" className="btn-mint" data-cms-key="vf.cta.primary">
                {v("vf.cta.primary")}
              </Link>
              <Link href="/app" className="btn-ghost-invert">
                Download de app
              </Link>
            </div>
            <p className="mt-6 text-sm text-white/60">
              Ben je een bedrijf?{" "}
              <Link href="/voor-bedrijven" className="font-semibold text-white underline" data-cms-key="vf.cta.secondary">
                {v("vf.cta.secondary")}
              </Link>
            </p>
          </div>
          <div className="hidden md:block">
            <FreelanceTelefoon scherm="klus" />
          </div>
        </div>
      </Section>
    ),
  };
  const zichtbaar = zichtbareSecties("voor-freelancers", await getPaginaIndeling("voor-freelancers"));
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell grid gap-12 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
          <div>
            <p className="eyebrow text-brand-mint" data-cms-key="vf.eyebrow">{v("vf.eyebrow")}</p>
            <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold leading-[1.08] md:text-6xl" data-cms-key="vf.title">
              {v("vf.title")}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/70" data-cms-key="vf.lead" data-cms-ml="1">
              {v("vf.lead")}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="btn-mint" data-cms-key="vf.cta1">
                {v("vf.cta1")}
              </Link>
              <Link href="#stappen" className="btn-ghost-invert" data-cms-key="vf.cta2">
                {v("vf.cta2")}
              </Link>
            </div>
            <HeroChecks items={["Bepaal je eigen uurtarief", "Kies je eigen klussen", "Bouw aan jouw toekomst"]} />
          </div>
          <div className="relative">
            <Photo name="freelancer" fallback={<SceneWork />} className="shadow-lift" />
            <p className="absolute -bottom-4 left-4 rounded-2xl bg-white px-4 py-3 text-ink shadow-lift md:-left-6">
              <span className="block font-display text-2xl font-bold text-brand-600">€ 0</span>
              <span className="block text-xs text-neutralx-600">kosten voor jou als werker</span>
            </p>
          </div>
        </div>
      </div>

      {zichtbaar.map((id) => (
        <Fragment key={id}>{onderdelen[id]}</Fragment>
      ))}
    </>
  );
}
