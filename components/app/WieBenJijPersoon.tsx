"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { GeboortedatumSheet } from "@/components/app/DraaiwielDatum";
import { OpleidingSheets } from "@/components/app/OpleidingSheets";
import { NIVEAU_LABELS, RICHTING_LABELS, type Opleiding } from "@/lib/onboarding/opleiding";
import { LANDNUMMERS, controleerPersoon, leesDatum, type PersoonGegevens, type PersoonVeld } from "@/lib/onboarding/wie-ben-jij";

// Stap 1, "Hey! Wie ben jij?": de velden als kaartjes met een klein label bovenin. Bewaart bij
// "Opslaan" via /api/me/wie-ben-jij; de server controleert met dezelfde regels (lib/onboarding/wie-ben-jij.ts).

export interface PersoonStand extends PersoonGegevens {
  opleiding: Opleiding | null;
  naamVast: boolean;
}

const KAARTJE =
  "block w-full rounded-2xl border border-hairstrong bg-white px-4 pb-2.5 pt-2 text-left focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100";
const LABEL = "block text-xs font-medium text-neutralx-500";
const WAARDE = "block w-full bg-transparent text-base text-ink outline-none placeholder:text-neutralx-400 read-only:text-neutralx-500";

function Fout({ id, tekst }: { id: string; tekst: string | undefined }) {
  if (!tekst) return null;
  return (
    <p id={id} role="alert" className="mt-1 px-1 text-xs font-medium text-crit">
      {tekst}
    </p>
  );
}

function Veld({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function WieBenJijPersoon({ begin, onKlaar }: { begin: PersoonStand; onKlaar: (stand: PersoonStand) => void }) {
  const { locale } = useI18n();
  const w = useFT().wie;
  const p = w.persoon;
  const [g, setG] = useState<PersoonGegevens>({ voornaam: begin.voornaam, achternaam: begin.achternaam, geboortedatum: begin.geboortedatum, landnummer: begin.landnummer, telefoon: begin.telefoon });
  const [opleiding, setOpleiding] = useState<Opleiding | null>(begin.opleiding);
  const [fouten, setFouten] = useState<Partial<Record<PersoonVeld, string>>>({});
  const [melding, setMelding] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [datumOpen, setDatumOpen] = useState(false);
  const [opleidingOpen, setOpleidingOpen] = useState(false);

  const landnamen = useMemo(() => {
    let namen: Intl.DisplayNames | null = null;
    try {
      namen = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      namen = null;
    }
    return (code: string) => namen?.of(code) ?? code;
  }, [locale]);

  const datumTekst = useMemo(() => {
    const d = leesDatum(g.geboortedatum);
    return d ? `${d.dag} ${w.datum.maanden[d.maand - 1] ?? ""} ${d.jaar}` : "";
  }, [g.geboortedatum, w.datum.maanden]);

  const opleidingTekst = opleiding
    ? [NIVEAU_LABELS[locale][opleiding.niveau], opleiding.richting ? RICHTING_LABELS[locale][opleiding.richting] : null].filter(Boolean).join(" · ")
    : "";

  const zet = (k: keyof PersoonGegevens, v: string) => {
    setG((o) => ({ ...o, [k]: v }));
    setFouten((o) => {
      const n = { ...o };
      delete n[k === "landnummer" ? "telefoon" : k];
      return n;
    });
  };

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMelding(null);
    const f = controleerPersoon(g);
    if (Object.keys(f).length > 0) {
      const n: Partial<Record<PersoonVeld, string>> = {};
      for (const [veld, reden] of Object.entries(f) as [PersoonVeld, keyof typeof p.fout][]) n[veld] = p.fout[reden];
      setFouten(n);
      setMelding(p.fout.fix);
      return;
    }
    setFouten({});
    setBusy(true);
    try {
      const res = await fetch("/api/me/wie-ben-jij", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...g, opleiding }),
      });
      const d: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const fout = (d as { error?: { details?: { reden?: string; veld?: PersoonVeld } } } | null)?.error?.details;
        if (fout?.reden === "onder18") setFouten({ geboortedatum: p.fout.onder18 });
        else if (fout?.veld && fout.reden && fout.reden in p.fout) setFouten({ [fout.veld]: p.fout[fout.reden as keyof typeof p.fout] });
        setMelding(fout?.reden === "onder18" ? p.fout.onder18 : p.fout.algemeen);
        return;
      }
      const stand = d as PersoonStand;
      onKlaar({ voornaam: stand.voornaam, achternaam: stand.achternaam, geboortedatum: stand.geboortedatum, landnummer: stand.landnummer, telefoon: stand.telefoon, opleiding: stand.opleiding ?? null, naamVast: Boolean(stand.naamVast) });
    } catch {
      setMelding(p.fout.offline);
    } finally {
      setBusy(false);
    }
  }

  const fid = (k: string) => `wie-fout-${k}`;
  const attrs = (k: PersoonVeld) => (fouten[k] ? { "aria-invalid": true as const, "aria-describedby": fid(k) } : {});

  return (
    <form onSubmit={(e) => void opslaan(e)} noValidate className="space-y-3">
      {melding && (
        <p role="alert" className="rounded-xl bg-crit/10 px-3 py-2.5 text-sm text-crit">
          {melding}
        </p>
      )}
      {begin.naamVast && <p role="note" className="rounded-xl bg-paper-soft px-3 py-2.5 text-xs leading-relaxed text-neutralx-600">{p.naamVast}</p>}

      <Veld>
        <label className={KAARTJE}>
          <span className={LABEL}>{p.voornaam}</span>
          <input
            value={g.voornaam}
            onChange={(e) => zet("voornaam", e.target.value)}
            readOnly={begin.naamVast}
            autoComplete="given-name"
            required
            aria-required="true"
            maxLength={60}
            {...attrs("voornaam")}
            className={WAARDE}
          />
        </label>
        <Fout id={fid("voornaam")} tekst={fouten.voornaam} />
      </Veld>

      <Veld>
        <label className={KAARTJE}>
          <span className={LABEL}>{p.achternaam}</span>
          <input
            value={g.achternaam}
            onChange={(e) => zet("achternaam", e.target.value)}
            readOnly={begin.naamVast}
            autoComplete="family-name"
            required
            aria-required="true"
            maxLength={80}
            {...attrs("achternaam")}
            className={WAARDE}
          />
        </label>
        <Fout id={fid("achternaam")} tekst={fouten.achternaam} />
      </Veld>

      <Veld>
        <button
          type="button"
          onClick={() => setDatumOpen(true)}
          aria-haspopup="dialog"
          aria-describedby={fouten.geboortedatum ? fid("geboortedatum") : undefined}
          className={`${KAARTJE} focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100`}
        >
          <span className={LABEL}>{p.geboortedatum}</span>
          <span className={`block min-h-[1.5rem] text-base ${datumTekst ? "text-ink" : "text-neutralx-400"}`}>{datumTekst || p.kiesDatum}</span>
        </button>
        <Fout id={fid("geboortedatum")} tekst={fouten.geboortedatum} />
      </Veld>

      <div className="grid grid-cols-[6.5rem_1fr] gap-3">
        <div>
          <label className={`${KAARTJE} relative`}>
            <span className={LABEL}>{p.land}</span>
            <span className="block min-h-[1.5rem] text-base text-ink">{g.landnummer}</span>
            <select
              aria-label={p.landAria}
              value={g.landnummer}
              onChange={(e) => zet("landnummer", e.target.value)}
              autoComplete="tel-country-code"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              {LANDNUMMERS.map((l) => (
                <option key={l.land} value={l.nummer}>
                  {landnamen(l.land)} ({l.nummer})
                </option>
              ))}
            </select>
          </label>
        </div>
        <Veld>
          <label className={KAARTJE}>
            <span className={LABEL}>{p.telefoon}</span>
            <input
              type="tel"
              inputMode="tel"
              value={g.telefoon}
              onChange={(e) => zet("telefoon", e.target.value)}
              autoComplete="tel-national"
              required
              aria-required="true"
              maxLength={20}
              placeholder="06 12345678"
              {...attrs("telefoon")}
              className={WAARDE}
            />
          </label>
          <Fout id={fid("telefoon")} tekst={fouten.telefoon} />
        </Veld>
      </div>

      <button
        type="button"
        onClick={() => setOpleidingOpen(true)}
        aria-haspopup="dialog"
        className={`${KAARTJE} flex items-center justify-between gap-3 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100`}
      >
        <span className="min-w-0">
          <span className={LABEL}>{p.opleiding}</span>
          <span className={`block min-h-[1.5rem] truncate text-base ${opleidingTekst ? "text-ink" : "text-neutralx-400"}`}>{opleidingTekst || p.opleidingKies}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-neutralx-400">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <button type="submit" disabled={busy} className="btn-primary mt-2 w-full">
        {busy ? p.bezig : p.opslaan}
      </button>

      <GeboortedatumSheet
        open={datumOpen}
        waarde={g.geboortedatum}
        teksten={w.datum}
        onBevestig={(d) => {
          zet("geboortedatum", d);
          setDatumOpen(false);
        }}
        onSluit={() => setDatumOpen(false)}
      />
      <OpleidingSheets open={opleidingOpen} waarde={opleiding} locale={locale} teksten={w.opl} onKies={setOpleiding} onSluit={() => setOpleidingOpen(false)} />
    </form>
  );
}
