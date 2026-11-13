"use client";

import { useEffect, useRef, useState } from "react";
import { ASSISTENT_VOORBEELDEN, voerOpdrachtUit, type AssistentDoc } from "@/lib/sites/assistent";

// ---------------------------------------------------------------------------
// De assistent boven de bouwer: typ of spreek in wat je wilt veranderen en de site past zich meteen aan (regels in
// lib/sites/assistent.ts). Alles loopt via dezelfde wijzigfunctie als de bouwer zelf, dus het wordt gewoon opgeslagen en
// bezoekers zien het pas na Publiceren. "Maak ongedaan" zet de laatste opdracht terug. Inspreken gebruikt de
// spraakherkenning van de browser en staat er alleen als de browser die heeft.
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

export function AssistentKaart({ doc, paginaId, bedrijfNaam, maakId, onPasToe }: { doc: AssistentDoc; paginaId: string; bedrijfNaam: string; maakId: (voorvoegsel: string) => string; onPasToe: (nieuw: AssistentDoc) => void }) {
  const [tekst, setTekst] = useState("");
  const [gedaan, setGedaan] = useState<string[]>([]);
  const [nietGedaan, setNietGedaan] = useState<string[]>([]);
  const [vorige, setVorige] = useState<AssistentDoc | null>(null);
  const [kanSpreken, setKanSpreken] = useState(false);
  const [luistert, setLuistert] = useState(false);
  const herkenner = useRef<Herkenner | null>(null);

  // pas na het laden kijken: op de server bestaat window niet (anders verschilt de eerste weergave)
  useEffect(() => {
    const w = window as unknown as MetSpraak;
    setKanSpreken(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => {
      herkenner.current?.stop();
    };
  }, []);

  function voerUit(opdracht: string) {
    if (!opdracht.trim()) return;
    const uit = voerOpdrachtUit(opdracht, doc, paginaId, bedrijfNaam, maakId);
    setGedaan(uit.gedaan);
    setNietGedaan(uit.nietGedaan);
    if (uit.gedaan.length > 0) {
      setVorige(doc);
      onPasToe(uit.doc);
      setTekst("");
    }
  }

  function ongedaan() {
    if (!vorige) return;
    onPasToe(vorige);
    setVorige(null);
    setGedaan(["De laatste opdracht is ongedaan gemaakt."]);
    setNietGedaan([]);
  }

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
      const delen: string[] = [];
      for (let i = 0; i < e.results.length; i++) delen.push(e.results[i]?.[0]?.transcript ?? "");
      const gezegd = delen.join(" ").trim();
      if (gezegd) setTekst((oud) => (oud.trim() ? `${oud.trim()} ${gezegd}` : gezegd).slice(0, 600));
    };
    h.onerror = (e) => {
      setGedaan([]);
      setNietGedaan([e.error === "not-allowed" || e.error === "service-not-allowed" ? "De microfoon mag niet gebruikt worden. Geef de browser toestemming, of typ je opdracht." : "Inspreken lukte niet. Typ je opdracht."]);
    };
    h.onend = () => setLuistert(false);
    herkenner.current = h;
    try {
      h.start();
      setLuistert(true);
    } catch {
      setNietGedaan(["Inspreken lukte niet. Typ je opdracht."]);
    }
  }

  return (
    <section className="card p-4" aria-labelledby="assistent-kop">
      <h2 id="assistent-kop" className="font-display text-base font-bold text-ink">
        Assistent
      </h2>
      <p className="mt-0.5 text-sm text-neutralx-600">Zeg in gewone woorden wat je wilt veranderen. Je ziet het meteen in het voorbeeld; bezoekers pas na Publiceren.</p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          voerUit(tekst);
        }}
      >
        <label htmlFor="assistent-opdracht" className="sr-only">
          Je opdracht voor de assistent
        </label>
        <input id="assistent-opdracht" className="field-input min-w-[14rem] flex-1" maxLength={600} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Bijvoorbeeld: maak de kleur donkerblauw en voeg openingstijden toe" />
        <button type="submit" className="btn-primary disabled:opacity-50" disabled={!tekst.trim()}>
          Doe het
        </button>
        {kanSpreken ? (
          <button type="button" onClick={spreek} aria-pressed={luistert} className="btn-ghost">
            {luistert ? "Stop met luisteren" : "Spreek het in"}
          </button>
        ) : null}
        {vorige ? (
          <button type="button" onClick={ongedaan} className="btn-ghost">
            Maak ongedaan
          </button>
        ) : null}
      </form>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Voorbeelden van opdrachten">
        {ASSISTENT_VOORBEELDEN.map((v) => (
          <li key={v}>
            <button type="button" onClick={() => voerUit(v)} className="rounded-full border border-hair px-3 py-1 text-xs font-medium text-neutralx-700 hover:border-brand-300">
              {v}
            </button>
          </li>
        ))}
      </ul>
      {gedaan.length > 0 ? (
        <ul role="status" className="mt-3 space-y-1 rounded-xl bg-brand-50 p-3 text-sm text-ink">
          {gedaan.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      ) : null}
      {nietGedaan.length > 0 ? (
        <ul role="alert" className="mt-3 space-y-1 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-neutralx-700">
          {nietGedaan.map((n) => (
            <li key={n}>{n}</li>
          ))}
          <li className="text-xs text-neutralx-600">Ik kan nu: de kleur, de hoeken, het lettertype en de stijl veranderen, een blok toevoegen, weghalen of verplaatsen, en een pagina maken of een andere naam geven. Teksten pas je aan door op een blok te klikken.</li>
        </ul>
      ) : null}
    </section>
  );
}
