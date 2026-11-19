import { smileyappRespons } from "@/lib/voorstel/smileyapp-instellingen";
import type { Taal } from "@/lib/voorstel/smileyapp-taal";
import { TEKSTEN } from "@/lib/voorstel/smileyapp-talen";
import { REKEN_NL } from "@/lib/voorstel/smileyapp-teksten";
import { Kopje } from "@/components/voorstel/smileyapp/Blokken";
import { RekenHulp } from "@/components/voorstel/smileyapp/RekenHulp";

// Het blok "Hoeveel reacties mag je verwachten?" op de voorpagina en op
// /samenstellen (deel 6b). Server-onderdeel dat zijn eigen instelling haalt,
// zoals ReviewBlok: zonder instelling geeft het niets terug. Er is geen
// standaardpercentage en geen voorbeeld; het blok bestaat pas als een beheerder
// in het beheer een percentage met een bron heeft ingevuld, en verdwijnt weer
// als hij het leeg maakt. De bron blijft in de taal waarin het team hem schreef.

export async function RekenBlok({ taal = "nl" }: { taal?: Taal }) {
  const respons = await smileyappRespons();
  // geen instelling: het blok bestaat niet
  if (!respons) return null;
  const t = taal === "nl" ? REKEN_NL : TEKSTEN[taal].reken;
  return (
    <section id="rekenhulp" aria-labelledby="rekenhulp-kop" className="scroll-mt-24 bg-smiley-mint py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <Kopje boven={t.boven} kop={t.kop} id="rekenhulp-kop" />
        <div className="sm-onthul mt-10">
          <RekenHulp percentage={respons.percentage} bron={respons.bron} teksten={t} {...(taal === "nl" ? {} : { bronTaal: "nl" })} />
        </div>
      </div>
    </section>
  );
}
