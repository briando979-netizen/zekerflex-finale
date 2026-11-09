"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { keuzeLabel, regelOnder, vulWaarden, type VulKaart, type VulSleutel } from "@/lib/kvk/formulier";
import { MIN_VRAAG, schoonKvk } from "@/lib/kvk/normaliseer";
import type { KvkTreffer } from "@/lib/kvk/types";

// ---------------------------------------------------------------------------
// KvkZoeker: een zoekveld voor bedrijven (combobox). Typ een naam, een plaats
// of een KVK-nummer; kies een bedrijf en de gegevens vullen zichzelf in.
// Overschrijven kan altijd: wie daarna weer in het veld typt, wist het label
// en vult zelf verder in. Zoekt via /api/company/search (eigen index, dan
// KVKBase, en alleen op verzoek OpenStreetMap).
//
// Twee manieren om te gebruiken:
//   - gecontroleerd (value + onChange), zoals het aanmeldformulier;
//   - los, met `vulFormulier`: de namen van de velden in het omringende
//     formulier die het bedrijf moet invullen (zoals de onboarding-wizard).
// Alleen puur importeren: geen prisma, kv of zod in deze file (client).
// ---------------------------------------------------------------------------

export interface KvkZoekerTeksten {
  zoekPlaceholder: string;
  laden: string;
  nietGevonden: string;
  zoekOsm: string;
  bezet: string;
  aantal: string;
  nietActief: string;
}

/** Nederlandse standaard; een scherm in een andere taal geeft zijn eigen teksten mee. */
export const KVK_ZOEKER_TEKSTEN_NL: KvkZoekerTeksten = {
  zoekPlaceholder: "Naam, plaats of KVK-nummer",
  laden: "Zoeken in het handelsregister…",
  nietGevonden: "Niet gevonden? Vul zelf in.",
  zoekOsm: "Zoek ook in OpenStreetMap",
  bezet: "Het handelsregister is even niet bereikbaar. Vul zelf in.",
  aantal: "{n} bedrijven gevonden. Gebruik de pijltjestoetsen om te kiezen.",
  nietActief: "Niet actief",
};

export interface KvkZoekerProps {
  label: string;
  /** de tekst in het veld (gecontroleerd); laat weg voor een los veld */
  value?: string;
  onChange?: (waarde: string) => void;
  defaultValue?: string;
  /** naam van het tekstveld zelf, als het mee met het formulier moet (bijv. "companyName") */
  name?: string;
  /** veldnamen in het omringende formulier die bij het kiezen worden ingevuld */
  vulFormulier?: VulKaart;
  /** velden uit `vulFormulier` die alleen worden ingevuld als ze nog leeg zijn */
  alleenAlsLeeg?: VulSleutel[];
  /** na het kiezen, met de aangevulde gegevens (adres, btw) als die bekend zijn */
  onKies?: (treffer: KvkTreffer) => void;
  /** de bezoeker typt na het kiezen weer: het gekozen bedrijf geldt niet meer */
  onWis?: () => void;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
  teksten?: KvkZoekerTeksten;
}

type Status = "rust" | "laden" | "klaar";

const DEBOUNCE_MS = 250;

/** Een invoerveld vullen zoals de gebruiker dat zou doen, zodat React-velden de wijziging ook zien. */
function zetWaarde(el: HTMLInputElement, waarde: string): void {
  const zetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  zetter?.call(el, waarde);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function magZoeken(tekst: string): boolean {
  const t = tekst.trim();
  return schoonKvk(t) !== null || t.replace(/[^\p{L}\p{N}]/gu, "").length >= MIN_VRAAG;
}

export function KvkZoeker({
  label,
  value,
  onChange,
  defaultValue = "",
  name,
  vulFormulier,
  alleenAlsLeeg,
  onKies,
  onWis,
  required,
  placeholder,
  autoComplete,
  hint,
  teksten = KVK_ZOEKER_TEKSTEN_NL,
}: KvkZoekerProps) {
  const basis = useId();
  const veldId = `${basis}-veld`;
  const lijstId = `${basis}-lijst`;
  const statusId = `${basis}-status`;
  const optieId = (i: number) => `${basis}-optie-${i}`;

  const invoerRef = useRef<HTMLInputElement>(null);
  const [eigen, setEigen] = useState(defaultValue);
  const tekst = value ?? eigen;
  const [resultaten, setResultaten] = useState<KvkTreffer[]>([]);
  const [open, setOpen] = useState(false);
  const [actief, setActief] = useState(-1);
  const [status, setStatus] = useState<Status>("rust");
  const [bezet, setBezet] = useState(false);
  const [osmGevraagd, setOsmGevraagd] = useState(false);
  const [gekozen, setGekozen] = useState<KvkTreffer | null>(null);
  /** de tekst waarvoor de lijst nu geldt: zo zoeken we niet opnieuw na het kiezen */
  const laatsteVraag = useRef<string | null>(null);
  const keuzeNummer = useRef(0);
  /** pas zoeken als de bezoeker zelf typt: een ingevulde naam bij het openen vraagt niets */
  const getypt = useRef(false);

  function zetTekst(nieuw: string) {
    if (value === undefined) setEigen(nieuw);
    onChange?.(nieuw);
  }

  async function haal(q: string, metOsm: boolean, signaal: AbortSignal): Promise<void> {
    setStatus("laden");
    try {
      const url = `/api/company/search?q=${encodeURIComponent(q)}${metOsm ? "&osm=1" : ""}`;
      const res = await fetch(url, { signal: signaal });
      if (signaal.aborted) return;
      if (!res.ok) {
        // een limiet of storing: geen fout voor de bezoeker, gewoon zelf invullen
        setResultaten([]);
        setBezet(false);
        setStatus("klaar");
        return;
      }
      const d = (await res.json()) as { results?: KvkTreffer[]; bezet?: boolean };
      if (signaal.aborted) return;
      setResultaten(Array.isArray(d.results) ? d.results : []);
      setBezet(d.bezet === true);
      setActief(-1);
      setStatus("klaar");
      setOpen(true);
    } catch {
      if (signaal.aborted) return;
      setResultaten([]);
      setStatus("klaar");
    }
  }

  // zoeken na een korte pauze in het typen; nooit direct na het kiezen
  useEffect(() => {
    if (!getypt.current) return;
    if (gekozen || !magZoeken(tekst)) {
      setResultaten([]);
      setOpen(false);
      setStatus("rust");
      setBezet(false);
      setOsmGevraagd(false);
      laatsteVraag.current = null;
      return;
    }
    if (laatsteVraag.current === tekst.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      laatsteVraag.current = tekst.trim();
      setOsmGevraagd(false);
      void haal(tekst.trim(), false, controller.signal);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tekst, gekozen]);

  function vulIn(t: KvkTreffer): void {
    if (!vulFormulier) return;
    const form = invoerRef.current?.form;
    if (!form) return;
    const waarden = vulWaarden(t);
    for (const [sleutel, veld] of Object.entries(vulFormulier) as [VulSleutel, string][]) {
      const waarde = waarden[sleutel];
      const el = form.elements.namedItem(veld);
      if (waarde === undefined || !(el instanceof HTMLInputElement)) continue;
      if (alleenAlsLeeg?.includes(sleutel) && el.value.trim() !== "") continue;
      zetWaarde(el, waarde);
    }
  }

  async function kies(t: KvkTreffer): Promise<void> {
    const nummer = ++keuzeNummer.current;
    setOpen(false);
    setActief(-1);
    laatsteVraag.current = t.name.trim();
    setGekozen(t);
    zetTekst(t.name);
    vulIn(t);
    onKies?.(t);
    // het korte zoekantwoord heeft vaak geen adres: vraag de rest van dit bedrijf erbij
    if (t.kvkNumber && !t.street) {
      try {
        const res = await fetch(`/api/company/search?kvk=${encodeURIComponent(t.kvkNumber)}`);
        if (!res.ok || nummer !== keuzeNummer.current) return;
        const d = (await res.json()) as { results?: KvkTreffer[] };
        const vol = d.results?.[0];
        if (vol && nummer === keuzeNummer.current) {
          setGekozen(vol);
          vulIn(vol);
          onKies?.(vol);
        }
      } catch {
        /* het adres kan de bezoeker zelf invullen */
      }
    }
  }

  function bijToets(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (resultaten.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const n = resultaten.length;
      setActief((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      const gekozenRij = open ? resultaten[actief] : undefined;
      if (gekozenRij) {
        e.preventDefault(); // geen formulier versturen: dit was een keuze
        void kies(gekozenRij);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setActief(-1);
    }
  }

  function zoekOsm(): void {
    if (osmGevraagd) return;
    setOsmGevraagd(true);
    void haal(tekst.trim(), true, new AbortController().signal);
  }

  const toonLijst = open && resultaten.length > 0;
  const toonLeeg = status === "klaar" && !gekozen && resultaten.length === 0 && magZoeken(tekst);
  const label2 = gekozen ? keuzeLabel(gekozen) : null;

  return (
    <div className="relative">
      <label htmlFor={veldId} className="field-label">
        {label}
      </label>
      <input
        ref={invoerRef}
        id={veldId}
        {...(name ? { name } : {})}
        type="text"
        role="combobox"
        aria-expanded={toonLijst}
        aria-controls={lijstId}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-describedby={statusId}
        {...(toonLijst && actief >= 0 ? { "aria-activedescendant": optieId(actief) } : {})}
        required={required ?? false}
        autoComplete={autoComplete ?? "off"}
        placeholder={placeholder ?? teksten.zoekPlaceholder}
        value={tekst}
        onChange={(e) => {
          getypt.current = true;
          if (gekozen) {
            setGekozen(null);
            onWis?.();
          }
          zetTekst(e.target.value);
        }}
        onFocus={() => {
          if (resultaten.length > 0 && !gekozen) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={bijToets}
        className="field-input"
      />
      {hint && <span className="mt-1 block text-xs text-neutralx-400">{hint}</span>}

      {toonLijst && (
        <ul
          id={lijstId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-hairstrong bg-white shadow-lg"
        >
          {resultaten.map((r, i) => (
            <li
              key={`${r.kvkNumber ?? "osm"}-${i}`}
              id={optieId(i)}
              role="option"
              aria-selected={i === actief}
              // mousedown vóór blur: anders sluit het veld de lijst voordat de klik aankomt
              onMouseDown={(e) => {
                e.preventDefault();
                void kies(r);
              }}
              onMouseEnter={() => setActief(i)}
              className={`flex cursor-pointer items-start justify-between gap-2 px-3 py-2 text-left text-sm ${i === actief ? "bg-paper-soft" : "hover:bg-paper-soft"}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{r.name}</span>
                <span className="block truncate text-xs text-neutralx-500">
                  {regelOnder(r)}
                  {r.active === false && <span className="ml-1 text-warn">{teksten.nietActief}</span>}
                </span>
              </span>
              {r.kvkNumber && <span className="mt-0.5 shrink-0 font-mono text-[11px] text-neutralx-400">{r.kvkNumber}</span>}
            </li>
          ))}
        </ul>
      )}

      <div id={statusId} role="status" aria-live="polite" className="mt-1 min-h-[1rem] text-xs text-neutralx-500">
        {status === "laden" && teksten.laden}
        {toonLijst && <span className="sr-only">{teksten.aantal.replace("{n}", String(resultaten.length))}</span>}
        {toonLeeg && (
          <span>
            {bezet ? teksten.bezet : teksten.nietGevonden}{" "}
            {!osmGevraagd && !bezet && schoonKvk(tekst) === null && (
              <button type="button" onClick={zoekOsm} className="font-medium text-brand-600 underline underline-offset-2">
                {teksten.zoekOsm}
              </button>
            )}
          </span>
        )}
        {label2 && (
          <span
            className={
              label2.register
                ? "inline-flex items-center gap-1 rounded-full bg-trust-soft px-2 py-0.5 font-medium text-trust-ink"
                : "text-neutralx-500"
            }
          >
            {label2.register && <span aria-hidden="true">✓</span>}
            {label2.tekst}
          </span>
        )}
      </div>
    </div>
  );
}
