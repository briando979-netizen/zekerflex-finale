"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  HULP_NIEUWS_GEZIEN,
  SUPPORT_CHAT,
  SUPPORT_CHAT_WERKGEVER,
  SUPPORT_MAIL,
  zoekVragen,
  type HulpTeksten,
} from "@/lib/hulp/hulpjes";

// ---------------------------------------------------------------------------
// De volledige pagina van het hulpcentrum (15 nov 2026, eigenaar: "twee aparte hulpcentra in het dashboard, een voor de werknemer en een
// voor het bedrijf"): /dashboard/hulp voor werkers, /werkgever/hulp voor bedrijven. Dezelfde teksten als het vraagteken in de kopbalk
// (components/app/HulpCentrum.tsx), maar op een eigen pagina met een vaste plek in het menu: vragen met zoeken, nieuws, contact en
// feedback. De teksten komen van de server in één taal (lib/hulp/teksten.ts, lib/hulp/werkgever-teksten.ts); een clientbestand
// importeert er alleen typen uit.
// ---------------------------------------------------------------------------

export function HulpPaginaInhoud({
  t,
  soort,
  handleidingen = null,
  onboarding = false,
}: {
  t: HulpTeksten;
  soort: "werker" | "bedrijf";
  /** adres van de handleidingen (Outline); null = niet ingesteld */
  handleidingen?: string | null;
  /** onboarding nog niet klaar: de chat is dan dicht, dus mailen */
  onboarding?: boolean;
}) {
  const chat = soort === "bedrijf" ? SUPPORT_CHAT_WERKGEVER : SUPPORT_CHAT;
  const zoekId = useId();
  const feedbackId = useId();
  const [zoek, setZoek] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  /** het id van het nieuwste bericht dat de lezer eerder zag: undefined = nog niet uit de opslag gelezen, "" = nooit gekeken */
  const [eerder, setEerder] = useState<string | undefined>(undefined);

  const gevonden = useMemo(() => zoekVragen(t.vragen, zoek), [t.vragen, zoek]);

  // het nieuws op deze pagina telt als gezien: de stip op het vraagteken gaat weg
  useEffect(() => {
    const nieuwste = t.nieuwsItems[0]?.id ?? "";
    try {
      setEerder(localStorage.getItem(HULP_NIEUWS_GEZIEN) ?? "");
      localStorage.setItem(HULP_NIEUWS_GEZIEN, nieuwste);
    } catch {
      /* geen opslag (privévenster): alles zonder "Nieuw"-label */
    }
  }, [t.nieuwsItems]);

  const stuurFeedback = async (e: FormEvent) => {
    e.preventDefault();
    const tekst = feedback.trim();
    if (tekst.length < 5) return setFout(t.feedback.teKort);
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ support: true, text: `Feedback via het hulpcentrum:\n${tekst}` }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setKlaar(true);
      setFeedback("");
    } catch {
      setFout(t.feedback.fout);
    } finally {
      setBezig(false);
    }
  };

  const kaart = "block rounded-2xl border border-hair bg-white p-4 transition hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400";

  return (
    <div className="space-y-8">
      {/* contact: de snelste weg eerst */}
      <section aria-label={t.tabs.home} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {onboarding ? (
          <a href={SUPPORT_MAIL} className={kaart}>
            <span className="block text-sm font-semibold text-ink">{t.home.mail[0]}</span>
            <span className="mt-1 block text-xs text-neutralx-500">{t.home.mail[1]}</span>
          </a>
        ) : (
          <Link href={chat} className={kaart}>
            <span className="block text-sm font-semibold text-ink">{t.home.chat[0]}</span>
            <span className="mt-1 block text-xs text-neutralx-500">{t.home.chat[1]}</span>
          </Link>
        )}
        {handleidingen && (
          <a href={handleidingen} target="_blank" rel="noopener noreferrer" className={kaart}>
            <span className="block text-sm font-semibold text-ink">{t.home.handleidingen[0]}</span>
            <span className="mt-1 block text-xs text-neutralx-500">{t.home.handleidingen[1]}</span>
          </a>
        )}
        <button
          type="button"
          className={`${kaart} text-left`}
          aria-expanded={feedbackOpen}
          aria-controls={feedbackId}
          onClick={() => {
            setFeedbackOpen((v) => !v);
            setKlaar(false);
            setFout(null);
          }}
        >
          <span className="block text-sm font-semibold text-ink">{t.home.feedback[0]}</span>
          <span className="mt-1 block text-xs text-neutralx-500">{t.home.feedback[1]}</span>
        </button>
        <Link href="/status" className={kaart}>
          <span className="block text-sm font-semibold text-ink">{t.home.status.titel}</span>
          <span className="mt-1 block text-xs text-neutralx-500">{t.home.status.onbekend}</span>
        </Link>
      </section>

      {feedbackOpen && (
        <form id={feedbackId} onSubmit={stuurFeedback} className="rounded-2xl border border-hair bg-white p-5">
          <h2 className="text-base font-semibold text-ink">{t.feedback.titel}</h2>
          <p className="mt-1 text-sm text-neutralx-600">{t.feedback.uitleg}</p>
          <label htmlFor={`${feedbackId}-veld`} className="mt-4 block text-sm font-medium text-ink">
            {t.feedback.veld}
          </label>
          <textarea
            id={`${feedbackId}-veld`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={t.feedback.plaatshouder}
            rows={4}
            maxLength={2000}
            className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          />
          {fout && (
            <p role="alert" className="mt-2 text-sm font-medium text-crit">
              {fout}
            </p>
          )}
          {klaar && (
            <p role="status" className="mt-3 rounded-lg bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-600">
              {t.feedback.klaar}
            </p>
          )}
          <button type="submit" disabled={bezig} className="btn-primary mt-3">
            {bezig ? t.feedback.bezig : t.feedback.stuur}
          </button>
        </form>
      )}

      {/* de veelgestelde vragen met zoeken */}
      <section aria-labelledby={`${zoekId}-kop`}>
        <h2 id={`${zoekId}-kop`} className="font-display text-xl font-bold text-ink">
          {t.hulp.titel}
        </h2>
        <label htmlFor={zoekId} className="sr-only">
          {t.zoek}
        </label>
        <input
          id={zoekId}
          type="search"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder={t.zoek}
          className="mt-3 w-full rounded-xl border border-hairstrong bg-white px-4 py-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        />
        {gevonden.length === 0 ? (
          <p className="mt-4 text-sm text-neutralx-600">
            {t.hulp.leeg.replace("{q}", zoek.trim())}{" "}
            <Link href={onboarding ? SUPPORT_MAIL : chat} className="font-semibold text-brand-600 hover:underline">
              {t.hulp.vraagHet}
            </Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hair rounded-2xl border border-hair bg-white">
            {gevonden.map((v) => (
              <li key={v.id}>
                <details className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink">
                    <span>{v.v}</span>
                    <span aria-hidden className="text-neutralx-400 transition group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-neutralx-600">{v.a}</p>
                  {v.link && !(onboarding && v.link.href === chat) && (
                    <Link href={v.link.href} className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
                      {v.link.label} →
                    </Link>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">
          <Link href="/kennis/faq" className="text-neutralx-500 hover:text-ink">
            {t.hulp.alles}
          </Link>
        </p>
      </section>

      {/* nieuws */}
      <section aria-labelledby={`${zoekId}-nieuws`}>
        <h2 id={`${zoekId}-nieuws`} className="font-display text-xl font-bold text-ink">
          {t.nieuws.titel}
        </h2>
        <ul className="mt-3 space-y-3">
          {t.nieuwsItems.map((n, i) => {
            // "Nieuw" bij alles dat boven het bericht staat dat de lezer eerder zag; wie nog nooit keek, ziet het alleen bij het nieuwste
            const gezienOp = eerder ? t.nieuwsItems.findIndex((x) => x.id === eerder) : -1;
            const nieuw = eerder !== undefined && (gezienOp >= 0 ? i < gezienOp : i === 0);
            return (
              <li key={n.id} className="rounded-2xl border border-hair bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <time dateTime={n.dag} className="text-xs text-neutralx-500">
                    {n.datum}
                  </time>
                  {nieuw && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-600">{t.nieuws.nieuw}</span>}
                </div>
                <h3 className="mt-1 text-sm font-semibold text-ink">{n.titel}</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{n.tekst}</p>
                {n.link && (
                  <Link href={n.link.href} className="mt-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
                    {n.link.label} →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
