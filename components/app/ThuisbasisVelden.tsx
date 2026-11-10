"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { THUISLANDEN, thuisbasisReden } from "@/lib/geo/thuisland";
import { landNaam } from "@/lib/werkrecht/landen";

/**
 * Land, postcode en (alleen in het buitenland) woonplaats van de thuisbasis, in
 * het onboardingformulier en bij de wallet-verificatie. De velden heten
 * country / postalCode / city; de server controleert ze opnieuw
 * (lib/onboarding/thuisbasis-schema.ts). Nederland blijft de standaard, met de
 * Nederlandse postcode zoals altijd.
 */
export function ThuisbasisVelden({ postcodeLabel }: { postcodeLabel: string }) {
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
      {/* Postcode alone places you for travel-distance matching — no house number needed. */}
      <label className="block">
        <span className="field-label">{postcodeLabel}</span>
        {buitenland ? (
          <input key="buiten" name="postalCode" required minLength={2} maxLength={12} autoComplete="postal-code" className="field-input" />
        ) : (
          <input key="nl" name="postalCode" required placeholder="1012 AB" autoComplete="postal-code" className="field-input" />
        )}
        {buitenland && <span className="mt-1 block text-xs text-neutralx-400">{t.postcodeHint}</span>}
      </label>
      {buitenland && (
        <label className="block">
          <span className="field-label">{t.plaats}</span>
          <input name="city" required maxLength={80} placeholder={t.plaatsPlaceholder} autoComplete="address-level2" className="field-input" />
        </label>
      )}
    </>
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
