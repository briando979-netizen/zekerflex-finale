import { vt } from "@/lib/i18n/site";
import { getSiteT } from "@/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Section, SectionHead, FaqList } from "@/components/marketing/primitives";
import { HeroMetFoto } from "@/components/marketing/HeroMetFoto";
import { PerBrancheEnStad } from "@/components/marketing/PerBrancheEnStad";
import { UitzendTelefoon, type UitzendScherm } from "@/components/marketing/UitzendTelefoon";
import { FOTO_MAP, paginaFoto } from "@/lib/marketing/fotos";
import { breadcrumbJsonLd, canonical } from "@/lib/seo";
import { ldJson } from "@/lib/seo/json-ld";

// 22 nov 2026: korter (met " · ZekerFlex" erachter paste de oude titel niet in Google) en met "uitzendbureau" erin: daar
// zoeken mensen op (Search Console: 2.500 vertoningen voor "uitzendbureau …"). /uitzendbureau stuurt hierheen; deze pagina
// was tot 22 nov per ongeluk geblokkeerd in robots.txt ("/start").
const title = "Starten als uitzendkracht via een uitzendbureau";
const description =
  "Zo start je als uitzendkracht: download de app, zet het filter op Uitzendklussen en meld je aan. Je werkt op contract bij een uitzendbureau.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["starten als uitzendkracht", "uitzendwerk", "uitzendbureau", "werken zonder KVK", "uitzendklussen", "uitzendkracht app"],
  ...canonical("/starten-als-uitzendkracht", { title, description }),
};

// /starten-als-uitzendkracht (21 nov 2026, eigenaar: de opbouw van een bekende uitzendpagina overnemen, met de uitstraling van
// ZekerFlex, onze eigen foto's en de app op de telefoon met de klus; op contract bij een willekeurig uitzendbureau). Eigen
// tekst: kop, drie kenmerken, zes stappen, vragen, slot. Het uitzendbureau is de werkgever (lib/uitzend/model.ts:
// ZEKERFLEX_UITZENDER = false); alleen wat echt zo werkt in de app.

const KENMERKEN = [
  { kop: vt("Geen KVK"), tekst: vt("Je hoeft geen eigen bedrijf te hebben. Je werkt op contract bij een uitzendbureau.") },
  { kop: "8%", tekst: vt("Vakantiegeld bovenop je loon, en pensioen volgens de cao van het uitzendbureau.") },
  { kop: vt("1 app"), tekst: vt("Al je diensten, je chat en je uren op één plek op je telefoon.") },
];

const STAPPEN: { titel: string; tekst: string; scherm?: UitzendScherm; app?: boolean }[] = [
  {
    titel: vt("Download de app"),
    tekst: vt("Installeer ZekerFlex op je telefoon, voor Android of iPhone. Je werkersomgeving gebruik je in de app."),
    app: true,
  },
  {
    titel: vt("Maak je account en check je ID"),
    tekst: vt("Vul je gegevens in en laat je identiteitsbewijs controleren in de app. Een KVK-nummer heb je niet nodig."),
  },
  {
    titel: vt("Zet het filter op Uitzendklussen"),
    tekst: vt("Tik op het filter en zet bij Type klus alleen Uitzendklussen aan. Dan zie je alleen diensten van uitzendbureaus."),
    scherm: "filter",
  },
  {
    titel: vt("Meld je aan en teken je contract"),
    tekst: vt("Zie je een dienst die je wilt doen? Tik op Vraag uitzendcontract aan. Het uitzendbureau neemt contact met je op en je tekent je uitzendcontract bij dat bureau."),
    scherm: "klus",
  },
  {
    titel: vt("Werk wanneer het jou uitkomt"),
    tekst: vt("Kies zelf welke diensten je doet en houd alles bij in de app."),
    scherm: "lijst",
  },
  {
    titel: vt("Geef je uren door"),
    tekst: vt("Na je dienst zet je je uren in de app. Het uitzendbureau betaalt je loon, met een loonstrook, op vaste momenten."),
  },
];

const FAQ = [
  {
    q: vt("Wie is mijn werkgever?"),
    a: vt("Het uitzendbureau van de dienst. Je tekent je uitzendcontract bij dat bureau en het bureau betaalt je loon. ZekerFlex is de app waarin je de diensten vindt en je uren doorgeeft."),
  },
  {
    q: vt("Heb ik een KVK-nummer nodig?"),
    a: vt("Nee. Als uitzendkracht werk je in loondienst bij het uitzendbureau. Een KVK-nummer heb je alleen nodig voor freelance klussen."),
  },
  {
    q: vt("Wanneer krijg ik mijn loon?"),
    a: vt("Het uitzendbureau betaalt je loon op vaste momenten, met een loonstrook. Welke dag dat is, hoor je van het bureau."),
  },
  {
    q: vt("Kan ik ook freelance klussen doen?"),
    a: vt("Ja, als je een KVK-nummer hebt. In het filter zet je dan bij Type klus ook Freelance klussen aan."),
  },
  {
    q: vt("Is ZekerFlex een uitzendbureau?"),
    a: vt("Nee. ZekerFlex is zelf geen uitzendbureau, maar de app waarin uitzendbureaus hun diensten zetten. Je contract teken je bij het uitzendbureau van de dienst, en dat bureau betaalt je loon."),
  },
];

export default async function StartenAlsUitzendkrachtPage() {
  const tx = await getSiteT();
  const slotFoto = `${FOTO_MAP}/campagne-schap.jpg`;
  const vragen = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson([breadcrumbJsonLd([["Home", "/"], ["Starten als uitzendkracht", "/starten-als-uitzendkracht"]]), vragen]) }}
      />
      <Section>
        <HeroMetFoto foto={paginaFoto("starten-als-uitzendkracht")}>
          <SectionHead
            kop="h1"
            eyebrow={tx("Uitzendwerk")}
            title={tx("Zo start je als uitzendkracht")}
            intro={tx("In de ZekerFlex-app staan freelance klussen én uitzendklussen. Met het filter kies je zelf wat je ziet. Voor een uitzendklus teken je een uitzendcontract bij een uitzendbureau: dat bureau is je werkgever en betaalt je loon.")}
          />
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/app" className="btn-primary">
              {tx("Download de app")}
            </Link>
            <Link href="/register?type=freelancer" className="btn-ghost">
              {tx("Start vandaag")}
            </Link>
          </div>
        </HeroMetFoto>
      </Section>

      <Section tone="soft">
        <div className="grid gap-5 sm:grid-cols-3">
          {KENMERKEN.map((k) => (
            <div key={k.kop} className="rounded-2xl border border-hair bg-white p-6 text-center">
              <p className="font-display text-4xl font-bold text-brand-600">{tx(k.kop)}</p>
              <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{tx(k.tekst)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow={tx("Zo werkt het")} title={tx("Start met uitzendklussen in 6 stappen")} />
        <ol className="mt-12 space-y-14">
          {STAPPEN.map((s, i) => (
            <li key={s.titel} className={`grid items-center gap-8 ${s.scherm ? "md:grid-cols-2" : ""}`}>
              <div className={s.scherm && i % 2 === 1 ? "md:order-2" : ""}>
                <span className="num inline-grid h-10 w-10 place-items-center rounded-full bg-brand-500 font-mono text-base text-white">{i + 1}</span>
                <h3 className="mt-3 font-display text-2xl font-bold text-ink">{tx(s.titel)}</h3>
                <p className="mt-2 max-w-xl text-[1.02rem] leading-relaxed text-neutralx-600">{tx(s.tekst)}</p>
                {s.app && (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href="/app" className="btn-primary">
                      {tx("Naar de app")}
                    </Link>
                  </div>
                )}
              </div>
              {s.scherm && (
                <div className={i % 2 === 1 ? "md:order-1" : ""}>
                  <UitzendTelefoon scherm={s.scherm} bijschrift="Voorbeeld uit de app" />
                </div>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow={tx("Veelgestelde vragen")} title={tx("Goed om te weten")} />
        <div className="mt-8 max-w-3xl">
          <FaqList items={FAQ.map((f) => ({ q: tx(f.q), a: tx(f.a) }))} />
        </div>
        {/* 22 nov 2026: naar het werk per branche en per stad (daar staan uitzendklussen en freelance klussen samen) */}
        <PerBrancheEnStad voor="werkers" />
      </Section>

      <Section>
        <div className="grid items-center gap-10 overflow-hidden rounded-3xl bg-ink text-white md:grid-cols-2">
          <div className="p-8 md:p-12">
            <h2 className="font-display text-3xl font-bold leading-tight">{tx("Meld je aan voor uitzendklussen")}</h2>
            <p className="mt-3 text-white/75">
              {tx("Pak een dienst bij jou in de buurt, met de zekerheid van een contract bij een uitzendbureau: vakantiegeld, pensioen en een vast uurloon.")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/register?type=freelancer" className="btn-mint">
                {tx("Start vandaag")}
              </Link>
              <Link href="/app" className="btn-ghost-invert">
                {tx("Download de app")}
              </Link>
            </div>
          </div>
          <div className="relative h-64 md:h-full md:min-h-[320px]">
            <Image src={slotFoto} alt={tx("Een winkelmedewerker vult een schap")} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-[50%_25%]" />
          </div>
        </div>
      </Section>
    </>
  );
}
