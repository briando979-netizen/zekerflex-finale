"use client";

import { useEffect, useRef, useState } from "react";
import { leesIdee, type IdeeSoort, type IdeeUitkomst } from "@/lib/sites/idee";

// ---------------------------------------------------------------------------
// "Vertel je idee" boven het startformulier van de Studio (website en webshop): typ of spreek in wat je wilt, en het
// startpunt, de naam en de plaats worden voor je ingevuld (lib/sites/idee.ts). Er wordt niets verstuurd of opgeslagen: het
// lezen gebeurt hier in de browser. Inspreken gebruikt de spraakherkenning van de browser zelf en staat er alleen als de
// browser die heeft.
// ---------------------------------------------------------------------------

type Herkenner = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type MetSpraak = { SpeechRecognition?: new () => Herkenner; webkitSpeechRecognition?: new () => Herkenner };

const VOORBEELD: Record<IdeeSoort, string> = {
  website: "Bijvoorbeeld: een website voor mijn kapsalon, hij heet Knip & Zo, in Zwolle.",
  webshop: "Bijvoorbeeld: een webshop voor handgemaakte sieraden, hij heet Zilverlicht, in Utrecht.",
};

export function IdeeKaart({ soort, templates, onKeuze }: { soort: IdeeSoort; templates: { id: string; naam: string }[]; onKeuze: (u: IdeeUitkomst) => void }) {
  const [tekst, setTekst] = useState("");
  const [kanSpreken, setKanSpreken] = useState(false);
  const [luistert, setLuistert] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);
  const herkenner = useRef<Herkenner | null>(null);

  // pas na het laden kijken: op de server bestaat window niet (anders verschilt de eerste weergave)
  useEffect(() => {
    const w = window as unknown as MetSpraak;
    setKanSpreken(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => {
      herkenner.current?.stop();
    };
  }, []);

  function spreek() {
    if (luistert) {
      herkenner.current?.stop();
      return;
    }
    const w = window as unknown as MetSpraak;
    const Maak = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Maak) return;
    const h = new Maak();
    h.lang = "nl-NL";
    h.interimResults = false;
    h.continuous = false;
    h.onresult = (e) => {
      const stukken: string[] = [];
      for (let i = 0; i < e.results.length; i++) stukken.push(e.results[i]?.[0]?.transcript ?? "");
      const gezegd = stukken.join(" ").trim();
      if (gezegd) setTekst((oud) => (oud.trim() ? `${oud.trim()} ${gezegd}` : gezegd).slice(0, 1000));
    };
    h.onerror = (e) => {
      setMelding({ tekst: e.error === "not-allowed" || e.error === "service-not-allowed" ? "De microfoon mag niet gebruikt worden. Geef de browser toestemming, of typ je idee." : "Inspreken lukte niet. Typ je idee hieronder.", fout: true });
    };
    h.onend = () => setLuistert(false);
    herkenner.current = h;
    setMelding(null);
    try {
      h.start();
      setLuistert(true);
    } catch {
      setMelding({ tekst: "Inspreken lukte niet. Typ je idee hieronder.", fout: true });
    }
  }

  function kies() {
    const u = leesIdee(tekst, soort, templates.map((t) => t.id));
    if (!u) {
      setMelding({ tekst: "Vertel eerst in een zin wat je wilt maken.", fout: true });
      return;
    }
    onKeuze(u);
    const naam = templates.find((t) => t.id === u.templateId)?.naam ?? u.templateId;
    const extra = [u.naam ? `naam: ${u.naam}` : "", u.plaats ? `plaats: ${u.plaats}` : ""].filter(Boolean).join(", ");
    setMelding({
      tekst: `${u.herkend ? `Gekozen startpunt: ${naam}.` : `We herkenden geen branche en kozen ${naam}.`}${extra ? ` Ingevuld: ${extra}.` : ""} Controleer het hieronder en pas aan wat niet klopt.`,
    });
  }

  return (
    <section className="rounded-2xl border border-[#e3e3e3] bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,.05),0_1px_3px_rgba(0,0,0,.04)]" aria-labelledby="idee-kop">
      <h2 id="idee-kop" className="text-sm font-semibold text-[#1a1a1a]">
        Vertel je idee
      </h2>
      <p className="mt-1 text-sm text-[#616161]">Typ{kanSpreken ? " of spreek in" : ""} wat je wilt maken. Wij kiezen het startpunt dat erbij past en vullen de naam en de plaats alvast in.</p>
      <label htmlFor="idee-tekst" className="sr-only">
        Je idee in een of twee zinnen
      </label>
      <textarea
        id="idee-tekst"
        rows={3}
        maxLength={1000}
        value={tekst}
        onChange={(e) => {
          setTekst(e.target.value);
          setMelding(null);
        }}
        placeholder={VOORBEELD[soort]}
        className="mt-3 w-full rounded-xl border border-[#c9c9c9] bg-white px-3 py-2 text-sm text-[#1a1a1a] placeholder:text-[#707070] focus:border-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-black/10"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={kies} disabled={!tekst.trim()} className="inline-flex items-center justify-center rounded-xl bg-[#1a1a1a] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
          Kies voor mij
        </button>
        {kanSpreken ? (
          <button type="button" onClick={spreek} aria-pressed={luistert} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#d4d4d4] bg-white px-3.5 py-2 text-sm font-semibold text-[#303030] transition hover:bg-[#f7f7f7]">
            <span aria-hidden>{luistert ? "■" : "●"}</span>
            {luistert ? "Stop met luisteren" : "Spreek het in"}
          </button>
        ) : null}
        {luistert ? (
          <span role="status" className="text-sm text-[#616161]">
            Ik luister…
          </span>
        ) : null}
      </div>
      {melding ? (
        <p role={melding.fout ? "alert" : "status"} className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${melding.fout ? "bg-[#fed1d7] text-[#8e0b21]" : "bg-[#e8f5ee] text-[#0c5132]"}`}>
          {melding.tekst}
        </p>
      ) : null}
    </section>
  );
}
