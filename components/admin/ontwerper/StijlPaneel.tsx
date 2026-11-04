"use client";

import type { ReactNode } from "react";
import {
  BREEDTE,
  HOEKEN,
  KNOPPEN,
  LETTERTYPES,
  SCHADUWEN,
  STANDAARD_THEMA,
  STIJLEN,
  TEKSTGROOTTE,
  contrastChecks,
  zelfdeThema,
  type LettertypeKey,
  type Thema,
} from "@/lib/ontwerp/thema";

// ---------------------------------------------------------------------------
// Tabblad Stijl: kant-en-klare stijlen, kleuren met contrastcontrole,
// lettertypes, vormen en maten. Elke wijziging gaat meteen naar het voorbeeld.
// ---------------------------------------------------------------------------

const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mute = { color: "var(--a-mute)" };

function Blok({ titel, uitleg, children }: { titel: string; uitleg?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl p-4" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          {titel}
        </h2>
        {uitleg ? (
          <p className="mt-0.5 text-xs" style={mute}>
            {uitleg}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Kleur({ id, label, waarde, onChange }: { id: string; label: string; waarde: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm" style={{ color: "var(--a-text)" }}>
        {label}
      </label>
      <span className="flex items-center gap-2">
        <input id={id} type="color" value={waarde} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-11 cursor-pointer rounded border-0 bg-transparent p-0" />
        <input
          aria-label={`${label} als code`}
          value={waarde}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase());
          }}
          maxLength={7}
          className="w-24 rounded-lg px-2 py-1.5 font-mono text-xs uppercase"
          style={veld}
        />
      </span>
    </div>
  );
}

function Keuze<T extends string>({ label, waarde, opties, onChange }: { label: string; waarde: T; opties: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs" style={mute}>
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(opties) as T[]).map((k) => {
          const aan = k === waarde;
          return (
            <label
              key={k}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold focus-within:ring-2 focus-within:ring-offset-1"
              style={{ background: aan ? "var(--a-accent)" : "var(--a-elev)", color: aan ? "var(--a-on-accent)" : "var(--a-text)" }}
            >
              <input type="radio" name={label} className="sr-only" checked={aan} onChange={() => onChange(k)} />
              {opties[k]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Lettertype({ id, label, waarde, onChange }: { id: string; label: string; waarde: LettertypeKey; onChange: (v: LettertypeKey) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs" style={mute}>
        {label}
      </label>
      <select id={id} value={waarde} onChange={(e) => onChange(e.target.value as LettertypeKey)} className="w-full rounded-lg px-2 py-2 text-sm" style={veld}>
        {(Object.keys(LETTERTYPES) as LettertypeKey[]).map((k) => (
          <option key={k} value={k}>
            {LETTERTYPES[k].label} — {LETTERTYPES[k].soort}
          </option>
        ))}
      </select>
      <p className="mt-1.5 truncate text-lg" style={{ fontFamily: LETTERTYPES[waarde].stack, color: "var(--a-text)" }}>
        Zeker van je werk. 0123456789
      </p>
    </div>
  );
}

export function StijlPaneel({ thema, onChange }: { thema: Thema; onChange: (next: Thema, samenvoegen?: boolean) => void }) {
  const zet = <K extends keyof Thema>(k: K, v: Thema[K], samenvoegen = false) => onChange({ ...thema, [k]: v }, samenvoegen);
  const checks = contrastChecks(thema);
  const fout = checks.filter((c) => !c.ok).length;

  return (
    <div className="space-y-3">
      <Blok titel="Kant-en-klare stijlen" uitleg="Begin met een stijl en pas daarna alles aan wat je wilt.">
        <div className="grid grid-cols-2 gap-2">
          {STIJLEN.map((s) => {
            const aan = zelfdeThema(s.thema, thema);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={aan}
                onClick={() => onChange(s.thema)}
                className="rounded-xl p-2 text-left transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--a-elev)", outline: aan ? "2px solid var(--a-accent)" : "none" }}
              >
                <span className="flex h-10 overflow-hidden rounded-lg" aria-hidden="true">
                  <span className="flex-1" style={{ background: s.thema.inkt }} />
                  <span className="flex-1" style={{ background: s.thema.primair }} />
                  <span className="flex-1" style={{ background: s.thema.accent }} />
                  <span className="grid flex-1 place-items-center text-sm font-bold" style={{ background: s.thema.papier, color: s.thema.primair, fontFamily: LETTERTYPES[s.thema.koppen].stack }}>
                    Aa
                  </span>
                </span>
                <span className="mt-1.5 block text-xs font-semibold" style={{ color: "var(--a-text)" }}>
                  {s.naam}
                </span>
              </button>
            );
          })}
        </div>
      </Blok>

      <Blok titel="Kleuren" uitleg="De tinten (lichter en donkerder) rekent de ontwerper zelf uit. Betekeniskleuren (groen klaar, amber wacht, rood probleem) blijven vast.">
        <Kleur id="kl-primair" label="Hoofdkleur (knoppen, links)" waarde={thema.primair} onChange={(v) => zet("primair", v, true)} />
        <Kleur id="kl-accent" label="Accent op donker" waarde={thema.accent} onChange={(v) => zet("accent", v, true)} />
        <Kleur id="kl-inkt" label="Donkere vlakken" waarde={thema.inkt} onChange={(v) => zet("inkt", v, true)} />
        <Kleur id="kl-papier" label="Achtergrond" waarde={thema.papier} onChange={(v) => zet("papier", v, true)} />
        <div className="rounded-lg p-3" style={{ background: "var(--a-elev)" }}>
          <p className="text-xs font-semibold" style={{ color: fout ? "var(--a-warn-ink)" : "var(--a-ok-ink)" }}>
            {fout ? `${fout} combinatie${fout === 1 ? "" : "s"} niet goed leesbaar` : "Alles goed leesbaar (WCAG AA)"}
          </p>
          <ul className="mt-2 space-y-1">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--a-text)" }}>
                <span>{c.label}</span>
                <span className="num rounded-full px-1.5 py-0.5 font-semibold" style={{ background: c.ok ? "var(--a-ok-soft)" : "var(--a-warn-soft)", color: c.ok ? "var(--a-ok-ink)" : "var(--a-warn-ink)" }}>
                  {c.ratio.toFixed(1).replace(".", ",")} : 1 {c.ok ? "goed" : "te laag"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Blok>

      <Blok titel="Lettertypes" uitleg="Alle lettertypes komen van onze eigen server, niets van Google.">
        <Lettertype id="lt-koppen" label="Koppen" waarde={thema.koppen} onChange={(v) => zet("koppen", v)} />
        <Lettertype id="lt-tekst" label="Lopende tekst" waarde={thema.tekst} onChange={(v) => zet("tekst", v)} />
      </Blok>

      <Blok titel="Vormen">
        <Keuze label="Hoeken van kaarten en vlakken" waarde={thema.hoeken} opties={HOEKEN} onChange={(v) => zet("hoeken", v)} />
        <Keuze label="Knoppen" waarde={thema.knoppen} opties={KNOPPEN} onChange={(v) => zet("knoppen", v)} />
        <Keuze label="Schaduw" waarde={thema.schaduw} opties={SCHADUWEN} onChange={(v) => zet("schaduw", v)} />
      </Blok>

      <Blok titel="Maten">
        <label className="block">
          <span className="flex justify-between text-xs" style={mute}>
            Tekstgrootte <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{thema.tekstgrootte}%</span>
          </span>
          <input type="range" min={TEKSTGROOTTE.min} max={TEKSTGROOTTE.max} step={1} value={thema.tekstgrootte} onChange={(e) => zet("tekstgrootte", Number(e.target.value), true)} className="mt-1 w-full" />
        </label>
        <label className="block">
          <span className="flex justify-between text-xs" style={mute}>
            Breedte van de inhoud <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{thema.breedte} px</span>
          </span>
          <input type="range" min={BREEDTE.min} max={BREEDTE.max} step={20} value={thema.breedte} onChange={(e) => zet("breedte", Number(e.target.value), true)} className="mt-1 w-full" />
        </label>
      </Blok>

      <button type="button" onClick={() => onChange(STANDAARD_THEMA)} disabled={zelfdeThema(thema, STANDAARD_THEMA)} className="a-button w-full disabled:opacity-50">
        Alles terug naar de ZekerFlex-standaard
      </button>
    </div>
  );
}
