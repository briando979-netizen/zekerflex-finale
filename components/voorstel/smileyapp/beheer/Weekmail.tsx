"use client";

import { useCallback, useEffect, useState } from "react";
import { BEHEER_API, KAART, KNOP_LICHT, Melding, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// De wekelijkse mail in het beheer (deel 6a), onder het overzicht: elke maandag
// om 07:00 uur krijgen de beheerders een kort overzicht van de week ervoor, met
// alleen aantallen. Een beheerder zet hem hier aan of uit (standaard aan) en
// stuurt zichzelf een voorbeeld; een medewerker ziet alleen of hij aan staat.

const URL_INHOUD = `${BEHEER_API}/inhoud`;

interface Instellingen {
  weekmail: boolean;
}

export function Weekmail({ rol, via, email }: { rol: "beheerder" | "medewerker"; via: "smileyapp" | "zekerflex"; email: string }) {
  const [aan, setAan] = useState<boolean | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const beheerder = rol === "beheerder";

  const laad = useCallback(async () => {
    try {
      setAan((await vraag<Instellingen>(`${URL_INHOUD}?deel=instellingen`)).weekmail);
    } catch (e) {
      setFout(foutTekst(e, "De instelling laden lukte niet."));
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function zet(nieuw: boolean) {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      // de versie van de server overnemen
      setAan((await vraag<Instellingen>(URL_INHOUD, { method: "POST", body: { actie: "weekmail-zetten", aan: nieuw } })).weekmail);
      setOk(nieuw ? "De wekelijkse mail staat aan." : "De wekelijkse mail staat uit.");
    } catch (e) {
      setFout(foutTekst(e, "Opslaan lukte niet."));
    } finally {
      setBezig(false);
    }
  }

  async function voorbeeld() {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      const { verstuurd } = await vraag<{ verstuurd: boolean }>(URL_INHOUD, { method: "POST", body: { actie: "weekmail-voorbeeld" } });
      if (verstuurd) setOk(`Het voorbeeld is verstuurd naar ${email}.`);
      else setFout("Het voorbeeld kon niet worden afgeleverd. Probeer het later opnieuw.");
    } catch (e) {
      setFout(foutTekst(e, "Versturen lukte niet."));
    } finally {
      setBezig(false);
    }
  }

  return (
    <section aria-labelledby="sm-weekmail-kop" className={KAART}>
      <h3 id="sm-weekmail-kop" className="font-display text-xl font-bold text-smiley-ink">
        Wekelijkse mail
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-smiley-mute">
        Elke maandag om 07:00 uur krijgen de beheerders een kort overzicht van de zeven dagen ervoor: paginaweergaven, nieuwe aanvragen, chatgesprekken, geboekte demo&apos;s en wat nog op Nieuw staat. Alleen aantallen, geen namen of
        adressen.
      </p>
      {aan === null ? (
        !fout && <p className="mt-3 text-sm text-smiley-mute">Laden…</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-smiley-ink">
            <input type="checkbox" role="switch" checked={aan} disabled={bezig || !beheerder} onChange={(e) => void zet(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#0E2A20]" />
            <span>De wekelijkse mail staat {aan ? "aan" : "uit"}</span>
          </label>
          {beheerder && via === "smileyapp" && email && (
            <button type="button" disabled={bezig} onClick={() => void voorbeeld()} className={KNOP_LICHT}>
              Stuur mij nu een voorbeeld
            </button>
          )}
        </div>
      )}
      {!beheerder && aan !== null && <p className="mt-2 text-sm text-smiley-mute">Alleen een beheerder zet de mail aan of uit.</p>}
      {beheerder && via === "zekerflex" && aan !== null && <p className="mt-2 text-sm text-smiley-mute">Een voorbeeld sturen kan alleen met een SmileyApp-account: je bent nu via ZekerFlex ingelogd.</p>}
      <div className="mt-3 empty:hidden">
        <Melding fout={fout} ok={ok} />
      </div>
    </section>
  );
}
