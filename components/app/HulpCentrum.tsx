"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { IChat, IDoc, IHelp, IList, IMail, IPulse } from "@/components/app/icons";
import {
  HULP_NIEUWS_GEZIEN,
  SUPPORT_CHAT,
  SUPPORT_MAIL,
  heeftNieuwsOngezien,
  zoekVragen,
  type HulpTeksten,
} from "@/lib/hulp/hulpjes";

// ---------------------------------------------------------------------------
// Het vraagteken in de kopbalk van de werker-app: een hulpcentrum met Home (vragen,
// handleidingen, chat, feedback, status), Hulp (veelgestelde vragen met zoeken) en
// Nieuws (wat er nieuw is in de app). Teksten in de taal van de werker (lib/hulp/teksten.ts).
// Het paneel hangt aan de kopbalk (sticky = de positie-ouder): de wikkel rond de knop is
// bewust niet `relative`, anders valt het paneel op een telefoon links buiten beeld.
// ---------------------------------------------------------------------------

type Tab = "home" | "hulp" | "nieuws";
type Stand = "operational" | "degraded" | "down" | "unknown";

const STAND_STIP: Record<Stand, string> = {
  operational: "bg-ok",
  degraded: "bg-warn",
  down: "bg-crit",
  unknown: "bg-neutralx-300",
};

const svg = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" as const, "aria-hidden": true };

function IHuis() {
  return (
    <svg {...svg}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
function IMegafoon() {
  return (
    <svg {...svg}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1ZM18 9.5a3.5 3.5 0 0 1 0 5M8 15l1 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IFeedback() {
  return (
    <svg {...svg}>
      <path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4.5 3.5V16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8.5 8.5h7M8.5 11.5h4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IPijl() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Eén regel in het Home-blad: icoon, titel, uitleg en een pijl. */
function Regel({ icoon, titel, tekst, extra }: { icoon: ReactNode; titel: string; tekst: ReactNode; extra?: ReactNode }) {
  return (
    <span className="flex items-center gap-3.5 px-5 py-3.5">
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600">{icoon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{titel}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-snug text-neutralx-500">
          {extra}
          {tekst}
        </span>
      </span>
      <span className="flex-shrink-0 text-neutralx-400">
        <IPijl />
      </span>
    </span>
  );
}

const regelKlasse = "block w-full text-left transition hover:bg-paper-soft focus-visible:bg-paper-soft focus-visible:outline-none";

export function HulpCentrum({
  t,
  handleidingen = null,
  onboarding = false,
}: {
  t: HulpTeksten;
  /** adres van de handleidingen (Outline, lib/kennisbank); null = niet ingesteld */
  handleidingen?: string | null;
  /** onboarding nog niet klaar: de chat is dan dicht, dus mailen */
  onboarding?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const [ongezien, setOngezien] = useState(false);
  const [stand, setStand] = useState<Stand | null>(null);
  const [feedback, setFeedback] = useState("");
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const wikkelRef = useRef<HTMLDivElement>(null);
  const knopRef = useRef<HTMLButtonElement>(null);
  const paneelRef = useRef<HTMLDivElement>(null);
  const paneelId = useId();
  const titelId = useId();
  const zoekId = useId();
  const feedbackId = useId();

  // pas na het laden: de server kent localStorage niet (anders een hydratiefout)
  useEffect(() => {
    try {
      setOngezien(heeftNieuwsOngezien(t.nieuwsItems, localStorage.getItem(HULP_NIEUWS_GEZIEN)));
    } catch {
      /* geen opslag (privévenster): geen stip */
    }
  }, [t.nieuwsItems]);

  // sluiten met Escape of een tik ernaast; de focus gaat terug naar het vraagteken
  useEffect(() => {
    if (!open) return;
    paneelRef.current?.focus();
    const ernaast = (e: MouseEvent | TouchEvent) => {
      if (wikkelRef.current && !wikkelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      knopRef.current?.focus();
    };
    document.addEventListener("mousedown", ernaast);
    document.addEventListener("touchstart", ernaast);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", ernaast);
      document.removeEventListener("touchstart", ernaast);
      document.removeEventListener("keydown", toets);
    };
  }, [open]);

  // de status van het platform (openbaar, /api/status), elke keer dat het paneel opengaat
  useEffect(() => {
    if (!open) return;
    let weg = false;
    fetch("/api/status", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ overall?: Stand }>) : null))
      .then((d) => {
        if (!weg) setStand(d?.overall && Object.hasOwn(STAND_STIP, d.overall) ? d.overall : "unknown");
      })
      .catch(() => {
        if (!weg) setStand("unknown");
      });
    return () => {
      weg = true;
    };
  }, [open]);

  const gevonden = useMemo(() => zoekVragen(t.vragen, zoek), [t.vragen, zoek]);

  const sluit = () => setOpen(false);
  const kiesTab = (nieuw: Tab) => {
    setTab(nieuw);
    setFeedbackOpen(false);
    if (nieuw !== "nieuws" || !ongezien) return;
    setOngezien(false);
    try {
      localStorage.setItem(HULP_NIEUWS_GEZIEN, t.nieuwsItems[0]?.id ?? "");
    } catch {
      /* geen opslag: de stip komt de volgende keer terug */
    }
  };

  const stuurFeedback = async (e: FormEvent) => {
    e.preventDefault();
    const tekst = feedback.trim();
    if (tekst.length < 5) return setFout(t.feedback.teKort);
    setBezig(true);
    setFout(null);
    try {
      // komt binnen bij ZekerFlex Support (de chat), zodat het team kan antwoorden
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

  const standTekst =
    stand === "operational" ? t.home.status.ok : stand === "degraded" ? t.home.status.traag : stand === "down" ? t.home.status.storing : t.home.status.onbekend;
  const toonZoek = !feedbackOpen && tab !== "nieuws";

  return (
    <div ref={wikkelRef}>
      <button
        ref={knopRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ongezien ? `${t.knop} (${t.nieuws.nieuw})` : t.knop}
        title={t.knop}
        aria-expanded={open}
        aria-controls={paneelId}
        aria-haspopup="dialog"
        className="relative grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-500 transition hover:text-ink"
      >
        <IHelp />
        {ongezien && <span aria-hidden className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-mint" />}
      </button>

      {open && (
        <div
          ref={paneelRef}
          id={paneelId}
          role="dialog"
          aria-labelledby={titelId}
          tabIndex={-1}
          className="absolute inset-x-2 top-full z-[60] mt-2 flex max-h-[min(42rem,calc(100dvh-10rem))] flex-col overflow-hidden rounded-2xl border border-hair bg-white shadow-lift outline-none sm:left-auto sm:right-4 sm:w-[25rem] lg:right-8"
        >
          {/* kop: titel, uitleg en zoeken */}
          <div className="flex-shrink-0 bg-ink px-5 pb-4 pt-4 text-white">
            <div className="flex items-start gap-3">
              <h2 id={titelId} className="flex-1 font-display text-xl font-bold tracking-tight">
                {t.titel}
              </h2>
              <button
                type="button"
                onClick={() => {
                  sluit();
                  knopRef.current?.focus();
                }}
                aria-label={t.sluit}
                className="-mr-2 -mt-1 grid h-10 w-10 place-items-center rounded-lg text-white/70 transition hover:text-white"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p className="mt-0.5 text-sm text-white/70">{t.onder}</p>
            {toonZoek && (
              <div className="relative mt-3">
                <label htmlFor={zoekId} className="sr-only">
                  {t.zoek}
                </label>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutralx-400">
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
                    <path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  id={zoekId}
                  type="search"
                  value={zoek}
                  onChange={(e) => {
                    setZoek(e.target.value);
                    if (tab !== "hulp") setTab("hulp");
                  }}
                  placeholder={t.zoek}
                  autoComplete="off"
                  maxLength={80}
                  className="w-full rounded-lg border border-hair bg-white py-2.5 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-neutralx-400 focus:border-brand-mint"
                />
              </div>
            )}
          </div>

          {/* inhoud */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {tab === "home" && !feedbackOpen && (
              <ul className="divide-y divide-hair py-1">
                <li>
                  <button type="button" className={regelKlasse} onClick={() => kiesTab("hulp")}>
                    <Regel icoon={<IList />} titel={t.home.vragen[0]} tekst={t.home.vragen[1]} />
                  </button>
                </li>
                {handleidingen && (
                  <li>
                    <a href={handleidingen} target="_blank" rel="noopener noreferrer" className={regelKlasse} onClick={sluit}>
                      <Regel icoon={<IDoc />} titel={t.home.handleidingen[0]} tekst={t.home.handleidingen[1]} />
                    </a>
                  </li>
                )}
                <li>
                  {onboarding ? (
                    <a href={SUPPORT_MAIL} className={regelKlasse} onClick={sluit}>
                      <Regel icoon={<IMail />} titel={t.home.mail[0]} tekst={t.home.mail[1]} />
                    </a>
                  ) : (
                    <Link href={SUPPORT_CHAT} className={regelKlasse} onClick={sluit}>
                      <Regel icoon={<IChat />} titel={t.home.chat[0]} tekst={t.home.chat[1]} />
                    </Link>
                  )}
                </li>
                <li>
                  <button
                    type="button"
                    className={regelKlasse}
                    onClick={() => {
                      setFeedbackOpen(true);
                      setKlaar(false);
                      setFout(null);
                    }}
                  >
                    <Regel icoon={<IFeedback />} titel={t.home.feedback[0]} tekst={t.home.feedback[1]} />
                  </button>
                </li>
                <li>
                  <Link href="/status" className={regelKlasse} onClick={sluit}>
                    <Regel
                      icoon={<IPulse />}
                      titel={t.home.status.titel}
                      tekst={standTekst}
                      extra={stand ? <span aria-hidden className={`h-2 w-2 flex-shrink-0 rounded-full ${STAND_STIP[stand]}`} /> : null}
                    />
                  </Link>
                </li>
              </ul>
            )}

            {tab === "home" && feedbackOpen && (
              <div className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(false)}
                  className="-ml-1 rounded-lg px-1 py-1 text-sm font-medium text-neutralx-500 transition hover:text-ink"
                >
                  ← {t.terug}
                </button>
                <h3 className="mt-2 text-base font-bold text-ink">{t.feedback.titel}</h3>
                {klaar ? (
                  <p role="status" className="mt-3 rounded-lg bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-600">
                    {t.feedback.klaar}
                  </p>
                ) : (
                  <form onSubmit={stuurFeedback} className="mt-1">
                    <p className="text-sm leading-relaxed text-neutralx-500">{t.feedback.uitleg}</p>
                    <label htmlFor={feedbackId} className="mt-3 block text-sm font-semibold text-ink">
                      {t.feedback.veld}
                    </label>
                    <textarea
                      id={feedbackId}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder={t.feedback.plaatshouder}
                      rows={5}
                      maxLength={2000}
                      className="field-input mt-1.5 w-full resize-y"
                    />
                    {fout && (
                      <p role="alert" className="mt-2 text-sm font-medium text-crit">
                        {fout}
                      </p>
                    )}
                    <button type="submit" disabled={bezig} className="btn-primary mt-3 w-full justify-center disabled:opacity-60">
                      {bezig ? t.feedback.bezig : t.feedback.stuur}
                    </button>
                  </form>
                )}
              </div>
            )}

            {tab === "hulp" && (
              <div className="px-5 py-4">
                <h3 className="text-base font-bold text-ink">{t.hulp.titel}</h3>
                {gevonden.length === 0 ? (
                  <p className="mt-3 text-sm text-neutralx-500">{t.hulp.leeg.replace("{q}", zoek.trim())}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-hair">
                    {gevonden.map((v) => (
                      <li key={v.id}>
                        <details className="group py-1">
                          <summary className="flex cursor-pointer list-none items-start gap-2 rounded-lg py-2.5 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                            <span className="flex-1">{v.v}</span>
                            <span className="mt-0.5 flex-shrink-0 text-neutralx-400 transition group-open:rotate-90">
                              <IPijl />
                            </span>
                          </summary>
                          <p className="pb-2 text-sm leading-relaxed text-neutralx-600">{v.a}</p>
                          {v.link && !(onboarding && v.link.href === SUPPORT_CHAT) && (
                            <Link href={v.link.href} onClick={sluit} className="mb-2 inline-block text-sm font-semibold text-brand-600 hover:underline">
                              {v.link.label} →
                            </Link>
                          )}
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex flex-col gap-2 border-t border-hair pt-4 text-sm">
                  {onboarding ? (
                    <a href={SUPPORT_MAIL} className="font-semibold text-brand-600 hover:underline">
                      {t.home.mail[0]} →
                    </a>
                  ) : (
                    <Link href={SUPPORT_CHAT} onClick={sluit} className="font-semibold text-brand-600 hover:underline">
                      {t.hulp.vraagHet} →
                    </Link>
                  )}
                  <Link href="/kennis/faq" onClick={sluit} className="text-neutralx-500 hover:text-ink">
                    {t.hulp.alles}
                  </Link>
                </div>
              </div>
            )}

            {tab === "nieuws" && (
              <div className="px-5 py-4">
                <h3 className="text-base font-bold text-ink">{t.nieuws.titel}</h3>
                <ul className="mt-2 divide-y divide-hair">
                  {t.nieuwsItems.map((n) => (
                    <li key={n.id} className="py-3">
                      <p className="text-xs text-neutralx-400">
                        <time dateTime={n.dag}>{n.datum}</time>
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-ink">{n.titel}</p>
                      <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{n.tekst}</p>
                      {n.link && (
                        <Link href={n.link.href} onClick={sluit} className="mt-1.5 inline-block text-sm font-semibold text-brand-600 hover:underline">
                          {n.link.label} →
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* tabbladen onderaan */}
          <nav aria-label={t.titel} className="flex flex-shrink-0 border-t border-hair">
            {(
              [
                ["home", t.tabs.home, <IHuis key="h" />],
                ["hulp", t.tabs.hulp, <IHelp key="v" />],
                ["nieuws", t.tabs.nieuws, <IMegafoon key="n" />],
              ] as const
            ).map(([id, label, icoon]) => {
              const actief = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => kiesTab(id)}
                  aria-pressed={actief}
                  className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition ${
                    actief ? "text-brand-600" : "text-neutralx-400 hover:text-neutralx-600"
                  }`}
                >
                  {icoon}
                  {label}
                  {id === "nieuws" && ongezien && (
                    <span aria-hidden className="absolute right-[calc(50%-1rem)] top-2 h-2 w-2 rounded-full bg-brand-mint" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
