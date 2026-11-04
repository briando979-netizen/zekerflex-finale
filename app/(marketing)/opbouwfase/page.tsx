import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CtaBand } from "@/components/marketing/primitives";
import { canonical } from "@/lib/seo";

const TITLE = "ZekerFlex is nog in de opbouwfase";
const DESCRIPTION =
  "ZekerFlex werkt al, maar is nog niet officieel gestart. Wat dat betekent voor testklussen, je gegevens en je ideeën.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ZekerFlex` },
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  ...canonical("/opbouwfase", { title: TITLE, description: DESCRIPTION }),
};

const IDEE = "mailto:info@zekerflex.com?subject=Idee%20voor%20ZekerFlex";

// Uitleg voor iedereen die zich al heeft aangemeld terwijl ZekerFlex nog niet
// officieel live is (de balk in /dashboard en /werkgever linkt hierheen).
export default function OpbouwfasePagina() {
  const blokken: { titel: string; tekst: ReactNode }[] = [
    {
      titel: "Wat betekent dit?",
      tekst: (
        <>
          De functies die je ziet, werken echt: een profiel maken, reageren op klussen, uren schrijven, chatten en meer. We zijn alleen
          nog niet officieel gestart. We bouwen elke dag verder en verbeteren wat beter kan.
        </>
      ),
    },
    {
      titel: "Testklussen",
      tekst: (
        <>
          Sommige klussen zijn testklussen die we zelf hebben gemaakt, om te zien of alles goed werkt. Daar zit geen echt bedrijf achter.
          Een testklus is dus geen echt werk: je hoeft er niet heen en er hoort geen betaling bij. Reageren mag gewoon, zo zie je hoe
          het werkt. Twijfel je of een klus echt is? Vraag het ons in de chat.
        </>
      ),
    },
    {
      titel: "Je gegevens zijn veilig",
      tekst: (
        <>
          Je hoeft je account of gegevens niet te verwijderen. We gebruiken je gegevens alleen om ZekerFlex te laten werken. We verkopen
          geen gegevens, tonen geen advertenties en delen niets met advertentienetwerken. Lees er meer over in ons{" "}
          <Link href="/privacy" className="font-semibold text-brand-600 underline">
            privacybeleid
          </Link>
          . Wil je toch iets laten verwijderen? Dat kan altijd via{" "}
          <Link href="/gegevens-verwijderen" className="font-semibold text-brand-600 underline">
            gegevens verwijderen
          </Link>
          .
        </>
      ),
    },
    {
      titel: "Probeer alles uit",
      tekst: (
        <>
          Vul je profiel aan met je vak, je beschikbaarheid en hoe ver je wilt reizen. Dan sluiten de klussen die je ziet zo goed mogelijk
          aan, en ben je er klaar voor als we officieel starten. De app op je telefoon zetten kan ook al.
        </>
      ),
    },
    {
      titel: "Deel je ideeën",
      tekst: (
        <>
          Mis je iets, werkt iets niet zoals je verwacht, of heb je een goed idee? Laat het ons weten via{" "}
          <a href={IDEE} className="font-semibold text-brand-600 underline">
            info@zekerflex.com
          </a>{" "}
          of de chat in de app. Elk idee lezen we. Zo maken we samen een sterk platform.
        </>
      ),
    },
    {
      titel: "Wat komt er?",
      tekst: <>Zodra we officieel starten, laten we het je weten. Tot die tijd kun je alles rustig ontdekken.</>,
    },
  ];
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Opbouwfase</p>
          <h1 className="mt-4 max-w-3xl text-balance font-display text-4xl font-bold md:text-6xl">We bouwen ZekerFlex samen met jou</h1>
          <p className="mt-6 max-w-2xl text-lg text-white/70">
            Bedankt dat je er al bij bent! ZekerFlex werkt al, maar is nog niet officieel gestart. Hieronder lees je wat dat voor jou
            betekent.
          </p>
        </div>
      </div>
      <section className="bg-paper">
        <div className="shell py-16 md:py-20">
          <div className="grid gap-5 md:grid-cols-2">
            {blokken.map((b) => (
              <div key={b.titel} className="rounded-2xl border border-hair bg-white p-6">
                <h2 className="font-display text-xl font-bold text-ink">{b.titel}</h2>
                <p className="mt-2 leading-relaxed text-neutralx-600">{b.tekst}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <CtaBand
        title="Heb je een idee? We horen het graag"
        body="Mail ons of stuur een bericht in de chat. Samen maken we ZekerFlex beter."
        primaryHref={IDEE}
        primaryLabel="Stuur je idee"
        secondaryHref="/aanbod"
        secondaryLabel="Bekijk wat ZekerFlex doet"
      />
    </>
  );
}
