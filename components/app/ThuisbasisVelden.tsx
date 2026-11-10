"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { THUISLANDEN, thuisbasisReden } from "@/lib/geo/thuisland";
import { leesPlekResultaat, thuisbasisUitPlek, type PlekResultaat, type ThuisbasisPlek } from "@/lib/geo/thuisbasis-plek";
import { landNaam } from "@/lib/werkrecht/landen";

/**
 * Waar woont de werker: in het onboardingformulier en bij de wallet-verificatie.
 * In Nederland kiest hij zijn adres met de PDOK-plaatszoeker (of "Gebruik mijn
 * huidige locatie"); de postcode en woonplaats komen uit dat adres en gaan in de
 * verborgen velden postalCode en city mee. Er wordt geen huisnummer vastgelegd.
 * Buiten Nederland blijven de gewone velden (land, postcode, woonplaats). De
 * server controleert alles opnieuw (lib/onboarding/thuisbasis-schema.ts).
 */
export function ThuisbasisVelden({ postcodeLabel, fout, begin }: { postcodeLabel: string; fout?: string | undefined; begin?: string | undefined }) {
  const { locale } = useI18n();
  const t = useFT().thuisbasis;
  const [land, setLand] = useState<string>("NL");
  // Nederland is de standaard: de landkeuze blijft verborgen tot iemand zegt dat hij elders woont.
  const [toonLand, setToonLand] = useState(false);

  // Landnamen in de taal van de app (Intl.DisplayNames), in de vaste volgorde van
  // THUISLANDEN (Nederland, dan de buurlanden). Niet op naam sorteren: Node en de
  // browser sorteren soms net anders, en dan klopt de lijst na het laden niet meer (#418).
  const landen = useMemo(() => THUISLANDEN.map((code) => ({ code, naam: landNaam(code, locale) })), [locale]);

  const buitenland = land !== "NL";
  return (
    <>
      {toonLand || buitenland ? (
        <label className="block">
          <span className="field-label">{t.land}</span>
          <select name="country" value={land} onChange={(e) => setLand(e.target.value)} autoComplete="country" className="field-input">
            {landen.map((l) => (
              <option key={l.code} value={l.code} suppressHydrationWarning>
                {l.naam}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <input type="hidden" name="country" value="NL" />
          <button type="button" onClick={() => setToonLand(true)} className="block text-left text-xs text-neutralx-500 underline">
            {t.nietNL}
          </button>
        </>
      )}
      {buitenland ? (
        <>
          <label className="block">
            <span className="field-label">{postcodeLabel}</span>
            <input key="buiten" name="postalCode" required minLength={2} maxLength={12} autoComplete="postal-code" className="field-input" />
            <span className="mt-1 block text-xs text-neutralx-400">{t.postcodeHint}</span>
          </label>
          <label className="block">
            <span className="field-label">{t.plaats}</span>
            <input name="city" required maxLength={80} placeholder={t.plaatsPlaceholder} autoComplete="address-level2" className="field-input" />
          </label>
        </>
      ) : (
        <AdresKiezer fout={fout} begin={begin} />
      )}
    </>
  );
}

const ZOEK_WACHT_MS = 300;

/** "Waar woon je?": zoekveld (combobox) en "Gebruik mijn huidige locatie"; alleen voor Nederland. */
function AdresKiezer({ fout, begin }: { fout?: string | undefined; begin?: string | undefined }) {
  const t = useFT().thuisbasis;
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlekResultaat[]>([]);
  const [klaarMetZoeken, setKlaarMetZoeken] = useState(false);
  const [open, setOpen] = useState(false);
  const [actief, setActief] = useState(-1);
  // eerder bewaard ("bewaar en ga later verder"): de postcode staat er dan al, zonder woonplaats
  const [gekozen, setGekozen] = useState<ThuisbasisPlek | null>(() => thuisbasisUitPlek({ postcode: begin, plaats: null }));
  const [melding, setMelding] = useState<string | null>(null);
  const [locatieBezig, setLocatieBezig] = useState(false);
  const volgnr = useRef(0); // een oud antwoord mag een nieuwer niet overschrijven

  // Zoeken met een korte wachttijd; elke toets maakt het vorige verzoek verouderd.
  useEffect(() => {
    const term = q.trim();
    if (gekozen || term.length < 3) {
      setHits([]);
      setKlaarMetZoeken(false);
      return;
    }
    const nr = ++volgnr.current;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/geo/search?soort=adres&q=${encodeURIComponent(term)}`, { cache: "no-store", signal: ac.signal });
          const data = (await res.json()) as { results?: unknown[] };
          if (nr !== volgnr.current) return;
          const lijst = (data.results ?? []).map(leesPlekResultaat).filter((p): p is PlekResultaat => p !== null);
          setHits(lijst);
          setActief(-1);
        } catch {
          if (nr !== volgnr.current) return;
          setHits([]);
        }
        if (nr === volgnr.current) setKlaarMetZoeken(true);
      })();
    }, ZOEK_WACHT_MS);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q, gekozen]);

  function kies(plek: PlekResultaat) {
    const uit = thuisbasisUitPlek(plek);
    setOpen(false);
    setHits([]);
    if (!uit) {
      // een plaats of straat zonder adres: geen postcode, dus vragen we om meer
      setMelding(t.geenPostcode);
      return;
    }
    setMelding(null);
    setGekozen(uit);
    setQ("");
  }

  function wis() {
    setGekozen(null);
    setMelding(null);
    setQ("");
    setHits([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && hits.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActief((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActief((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === "Enter" && open && actief >= 0) {
      // Enter kiest het gemarkeerde adres en verstuurt het formulier niet
      e.preventDefault();
      const plek = hits[actief];
      if (plek) kies(plek);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  function gebruikLocatie() {
    setMelding(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMelding(t.locatieMislukt);
      return;
    }
    setLocatieBezig(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void (async () => {
            try {
              const res = await fetch(`/api/geo/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`, { cache: "no-store" });
              const data = (await res.json().catch(() => ({}))) as { result?: unknown; reden?: string };
              const plek = leesPlekResultaat(data.result);
              if (!res.ok) setMelding(t.locatieMislukt);
              else if (!plek) setMelding(data.reden === "buiten-nl" ? t.locatieBuitenNL : t.locatieGeenAdres);
              else kies(plek);
            } catch {
              setMelding(t.locatieMislukt);
            } finally {
              setLocatieBezig(false);
            }
          })();
        },
        (err) => {
          setLocatieBezig(false);
          // 1 = toegang geweigerd; al het andere (geen bereik, time-out) is "niet te bepalen"
          setMelding(err.code === 1 ? t.locatieGeweigerd : t.locatieMislukt);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      );
    } catch {
      setLocatieBezig(false);
      setMelding(t.locatieMislukt);
    }
  }

  const lijstId = `${id}-lijst`;
  const toonLeeg = !gekozen && klaarMetZoeken && hits.length === 0 && q.trim().length >= 3;
  const tekstFout = melding ?? (toonLeeg ? t.zoekLeeg : null) ?? fout ?? null;

  return (
    <div>
      <input type="hidden" name="postalCode" value={gekozen?.postalCode ?? ""} />
      <input type="hidden" name="city" value={gekozen?.city ?? ""} />
      <label htmlFor={`${id}-zoek`} className="field-label">
        {t.waarWoon}
      </label>
      {gekozen ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-ok/40 bg-ok/5 px-3 py-2.5">
          <p className="min-w-0 text-sm text-ink">
            <span className="block text-xs text-neutralx-500">{t.gekozen}</span>
            <span className="font-semibold" aria-live="polite">
              ✓ {gekozen.label}
            </span>
          </p>
          <button type="button" onClick={wis} className="flex-shrink-0 text-xs font-medium text-neutralx-500 underline hover:text-ink">
            {t.wissen}
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={`${id}-zoek`}
            type="text"
            role="combobox"
            aria-expanded={open && hits.length > 0}
            aria-controls={lijstId}
            aria-autocomplete="list"
            aria-activedescendant={open && actief >= 0 ? `${id}-opt-${actief}` : undefined}
            aria-describedby={`${id}-uitleg`}
            aria-invalid={fout ? true : undefined}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setMelding(null);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            placeholder={t.zoekPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="field-input w-full"
          />
          {open && hits.length > 0 && (
            <ul
              id={lijstId}
              role="listbox"
              aria-label={t.lijst}
              className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-hair bg-white py-1 shadow-lift"
            >
              {hits.map((h, i) => (
                <li
                  key={`${h.label}-${i}`}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === actief}
                  // mousedown (niet click): de blur van het veld sluit de lijst anders vóór de keuze
                  onMouseDown={(e) => {
                    e.preventDefault();
                    kies(h);
                  }}
                  className={`cursor-pointer truncate px-3 py-2 text-sm text-ink hover:bg-paper-soft ${i === actief ? "bg-paper-soft" : ""}`}
                >
                  {h.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p id={`${id}-uitleg`} className="mt-1 text-xs text-neutralx-400">
        {t.zoekUitleg}
      </p>
      {tekstFout && (
        <p role="alert" id={`${id}-fout`} className="mt-1 text-xs font-medium text-crit">
          {tekstFout}
        </p>
      )}
      {!gekozen && (
        <div className="mt-3">
          <button type="button" onClick={gebruikLocatie} disabled={locatieBezig} className="btn-ghost text-sm disabled:opacity-60">
            {locatieBezig ? t.locatieBezig : t.locatieKnop}
          </button>
          <p className="mt-1 text-xs text-neutralx-400">{t.locatieUitleg}</p>
        </div>
      )}
    </div>
  );
}

/** Een thuisbasis-fout van de server in de taal van de werker; null bij elke andere fout. */
export function useThuisbasisFout(): (antwoord: unknown) => string | null {
  const t = useFT().thuisbasis;
  return (antwoord) => {
    const reden = thuisbasisReden(antwoord);
    return reden ? t[reden] : null;
  };
}

/**
 * Controleert een adres in het buitenland vóór de ID-scan opent, zodat een
 * onvindbaar adres niet pas na de scan aan het licht komt. Geeft de melding
 * terug (al in de taal van de werker), of null als het adres klopt of in
 * Nederland ligt.
 */
export async function controleerThuisbasisVooraf(form: HTMLFormElement, vertaal: (antwoord: unknown) => string | null, standaard: string): Promise<string | null> {
  const d = new FormData(form);
  const land = String(d.get("country") ?? "NL");
  if (land === "NL") return null;
  try {
    const res = await fetch("/api/onboarding/thuisbasis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ country: land, postalCode: d.get("postalCode"), city: d.get("city") }),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return vertaal(data) ?? data.error?.message ?? standaard;
  } catch {
    return standaard;
  }
}
