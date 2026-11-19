"use client";

import { useState } from "react";
import { KLANTEN_MAX, groepeer, leesKlanten, verwachteReacties } from "@/lib/voorstel/smileyapp-rekenhulp-regels";
import { REKEN_NL, vul, type RekenTeksten } from "@/lib/voorstel/smileyapp-teksten";

// De rekenhulp "Hoeveel reacties mag je verwachten?" (deel 6b). Dit onderdeel
// kent zelf geen percentage: het krijgt het cijfer en de bronzin die een
// beheerder in het beheer invulde, en wordt alleen getoond door RekenBlok als
// die instelling er is. De bezoeker typt hoeveel klanten of gasten hij per maand
// heeft; de uitkomst is klanten × percentage, naar beneden afgerond, met eronder
// de bron van het team en "een schatting, geen belofte". Er wordt niets bewaard
// of verstuurd.

interface Props {
  /** het responspercentage dat het team zelf invulde (heel getal van 1 tot en met 100) */
  percentage: number;
  /** waar dat cijfer vandaan komt, in de woorden van het team */
  bron: string;
  /** op een vertaalde pagina: de taal waarin het team de bron schreef */
  bronTaal?: string;
  /** de teksten; zonder: Nederlands */
  teksten?: RekenTeksten;
}

export function RekenHulp({ percentage, bron, bronTaal, teksten: t = REKEN_NL }: Props) {
  const [invoer, setInvoer] = useState("");
  const leeg = invoer.trim() === "";
  const klanten = leesKlanten(invoer);
  const reacties = klanten === null ? null : verwachteReacties(klanten, percentage);
  const fout = !leeg && reacties === null;
  const max = groepeer(KLANTEN_MAX, t.duizendtal);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-[2rem] bg-white p-6 ring-1 ring-smiley-ink/10 sm:p-8">
        <label htmlFor="sm-reken-klanten" className="block font-display text-xl font-bold leading-snug">
          {t.label}
        </label>
        <input
          id="sm-reken-klanten"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={12}
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          aria-describedby={fout ? "sm-reken-fout" : "sm-reken-uitleg"}
          {...(fout ? { "aria-invalid": true as const } : {})}
          className="mt-3 w-full rounded-2xl border-0 bg-smiley-cream px-4 py-3 text-xl font-bold text-smiley-ink ring-1 ring-smiley-ink/15 focus:outline-none focus:ring-2 focus:ring-smiley-leaf aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-smiley-coral"
        />
        {fout ? (
          <p id="sm-reken-fout" role="alert" className="mt-2 text-sm font-semibold text-[#8E2A1E]">
            {vul(t.fout, { max })}
          </p>
        ) : (
          <p id="sm-reken-uitleg" className="mt-2 text-sm text-smiley-mute">
            {vul(t.uitleg, { max })}
          </p>
        )}
      </div>
      <div className="rounded-[2rem] bg-smiley-ink p-6 text-white sm:p-8">
        <p role="status" className="min-h-[4.5rem] break-words font-display text-3xl font-bold leading-tight text-smiley-sun [hyphens:auto] sm:text-4xl">
          {reacties === null ? <span className="text-xl font-semibold text-white/75 sm:text-2xl">{t.leeg}</span> : reacties === 1 ? t.uitkomstEen : vul(t.uitkomst, { n: groepeer(reacties, t.duizendtal) })}
        </p>
        <p className="mt-4 text-sm leading-relaxed text-white/80">{vul(t.gerekend, { p: percentage })}</p>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          {t.bron}{" "}
          <span {...(bronTaal ? { lang: bronTaal } : {})} className="break-words font-semibold text-white">
            {bron}
          </span>
        </p>
        <p className="mt-4 inline-flex rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold ring-1 ring-white/15">{t.schatting}</p>
      </div>
    </div>
  );
}
