"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { THUISLANDEN, thuisbasisReden } from "@/lib/geo/thuisland";
import { leesPlekResultaat, nettePostcode, plaatsBijPostcode, thuisbasisUitPlek } from "@/lib/geo/thuisbasis-plek";
import { landNaam } from "@/lib/werkrecht/landen";

/**
 * Waar woont de werker: in het onboardingformulier en bij de wallet-verificatie.
 * In Nederland eerst "Gebruik mijn huidige locatie", anders alleen de postcode;
 * de woonplaats zoeken we er zelf bij (PDOK). Beide gaan in de verborgen velden
 * postalCode en city mee. Er wordt geen adres of huisnummer vastgelegd.
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

type PlaatsStand = "leeg" | "bezig" | "gevonden" | "onbekend" | "storing";

/**
 * "Waar woon je?" in Nederland (13 nov 2026, eigenaar: "veel te veel vragen"): eerst "Gebruik mijn huidige locatie",
 * anders alleen de postcode. De woonplaats zoeken we er zelf bij (PDOK via /api/geo/search) en tonen hem ter controle;
 * de server heeft alleen de postcode nodig (lib/onboarding/thuisbasis-schema.ts), dus een storing bij PDOK houdt niets tegen.
 */
function AdresKiezer({ fout, begin }: { fout?: string | undefined; begin?: string | undefined }) {
  const t = useFT().thuisbasis;
  const id = useId();
  // eerder bewaard ("bewaar en ga later verder"): de postcode staat er dan al
  const [postcode, setPostcode] = useState(() => nettePostcode(begin) ?? "");
  const [plaats, setPlaats] = useState<string | null>(null);
  const [stand, setStand] = useState<PlaatsStand>("leeg");
  const [melding, setMelding] = useState<string | null>(null);
  const [locatieBezig, setLocatieBezig] = useState(false);
  const volgnr = useRef(0); // een oud antwoord mag een nieuwer niet overschrijven
  const net = nettePostcode(postcode);

  // De woonplaats bij een volledige postcode, met een korte wachttijd; elke toets maakt het vorige verzoek verouderd.
  useEffect(() => {
    if (!net) {
      setPlaats(null);
      setStand("leeg");
      return;
    }
    const nr = ++volgnr.current;
    const ac = new AbortController();
    setStand("bezig");
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/geo/search?soort=adres&q=${encodeURIComponent(net.replace(" ", ""))}`, { cache: "no-store", signal: ac.signal });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { results?: unknown[] };
          if (nr !== volgnr.current) return;
          const gevonden = plaatsBijPostcode(data.results, net);
          setPlaats(gevonden);
          setStand(gevonden ? "gevonden" : "onbekend");
        } catch {
          if (nr !== volgnr.current) return;
          setPlaats(null);
          setStand("storing");
        }
      })();
    }, ZOEK_WACHT_MS);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [net]);

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
              const uit = plek ? thuisbasisUitPlek(plek) : null;
              if (!res.ok) setMelding(t.locatieMislukt);
              else if (!uit) setMelding(data.reden === "buiten-nl" ? t.locatieBuitenNL : t.locatieGeenAdres);
              // de postcode in het veld; de woonplaats volgt vanzelf (zie hierboven)
              else setPostcode(uit.postalCode);
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

  const uitleg =
    stand === "gevonden" && net && plaats ? `✓ ${net} ${plaats}` : stand === "bezig" ? t.postcodeZoeken : stand === "onbekend" ? t.postcodeOnbekend : t.postcodeUitleg;
  const tekstFout = melding ?? fout ?? null;

  return (
    <div>
      <input type="hidden" name="postalCode" value={net ?? postcode.trim()} />
      <input type="hidden" name="city" value={plaats ?? ""} />
      <p className="field-label">{t.waarWoon}</p>
      <button type="button" onClick={gebruikLocatie} disabled={locatieBezig} className="btn-ghost w-full text-sm disabled:opacity-60">
        {locatieBezig ? t.locatieBezig : t.locatieKnop}
      </button>
      <p className="mt-1 text-xs text-neutralx-400">{t.locatieUitleg}</p>
      <label htmlFor={`${id}-postcode`} className="field-label mt-3 block">
        {t.ofPostcode}
      </label>
      <input
        id={`${id}-postcode`}
        type="text"
        value={postcode}
        onChange={(e) => {
          setPostcode(e.target.value);
          setMelding(null);
        }}
        aria-describedby={`${id}-uitleg`}
        aria-invalid={fout ? true : undefined}
        placeholder="1234 AB"
        maxLength={7}
        autoComplete="postal-code"
        autoCapitalize="characters"
        spellCheck={false}
        className="field-input w-full uppercase"
      />
      <p id={`${id}-uitleg`} aria-live="polite" className={`mt-1 text-xs ${stand === "gevonden" ? "font-medium text-ink" : "text-neutralx-400"}`}>
        {uitleg}
      </p>
      {tekstFout && (
        <p role="alert" id={`${id}-fout`} className="mt-1 text-xs font-medium text-crit">
          {tekstFout}
        </p>
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
