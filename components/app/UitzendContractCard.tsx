"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";
import type { ContractTekst } from "@/lib/agreements/uitzend-tekst";
import type { FreelancerDict } from "@/lib/i18n/freelancer";

// De uitzendovereenkomst: eerst lezen, dan pas tekenen. Vóór het tekenen staan de belangrijkste punten bovenaan, de
// volledige tekst is op het scherm te lezen (of als pdf te openen of te downloaden) en pas daarna komt de knop
// "Ondertekenen": die staat uit tot de overeenkomst is geopend en het vakje "Ik heb de overeenkomst gelezen" is aangevinkt.
// Na het tekenen blijft de overeenkomst terug te lezen en te downloaden. De juridische tekst is Nederlands en bindend
// (lib/agreements/uitzend-tekst.ts); de knoppen en uitleg zijn vijftalig.

interface Contract {
  id: string;
  reference: string;
  signedAt: string;
  validFrom: string;
  validUntil: string;
  phase: "A" | "B" | "C";
  weeksWorked: number;
}

type T = FreelancerDict["uitzendContract"];
type Datum = (s: string) => string;

/** De volledige tekst, leesbaar op het scherm. Een eigen scrollgebied dat met het toetsenbord te bereiken is. */
function TekstPaneel({ id, data, t, bindend }: { id: string; data: ContractTekst; t: T; bindend: boolean }) {
  return (
    <div id={id} role="region" aria-label={t.tekstLabel} lang="nl" tabIndex={0} className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-hair bg-white p-3 text-xs leading-relaxed text-ink">
      {bindend && <p className="mb-2 rounded-md bg-paper-soft p-2 font-semibold">{t.bindend}</p>}
      {data.voorbeeld && <p className="mb-1 text-xs font-semibold text-warn">{t.voorbeeldKop}</p>}
      <p className="font-display text-sm font-bold">{data.titel}</p>
      <p className="mb-2 text-xs text-neutralx-500">{data.referentie}</p>
      {data.blokken.map((b, i) =>
        b.soort === "kop" ? (
          <h3 key={i} className="mt-3 text-xs font-bold uppercase tracking-wide">{b.tekst}</h3>
        ) : b.soort === "punt" ? (
          <p key={i} className="mt-1 flex gap-2">
            <span className="w-6 flex-shrink-0 text-neutralx-500">{b.nr}</span>
            <span>{b.tekst}</span>
          </p>
        ) : b.soort === "alinea" ? (
          <p key={i} className="mt-1">{b.tekst}</p>
        ) : b.soort === "klein" ? (
          <p key={i} className="mt-2 text-xs text-neutralx-500">{b.tekst}</p>
        ) : null,
      )}
    </div>
  );
}

/** De belangrijkste punten bovenaan: loon, fase, geldigheid, opzeggen en pensioen. */
function Kernpunten({ data, t, fmt, bindend }: { data: ContractTekst; t: T; fmt: Datum; bindend: boolean }) {
  const g = data.gegevens;
  return (
    <div className="mt-3 rounded-lg bg-white/70 p-3">
      <p className="text-xs font-semibold text-ink">{t.kernTitel}</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-neutralx-700">
        <li>{t.kernLoon}</li>
        <li>{vulIn(t.kernFase, { fase: g.fase, weken: g.weken })}</li>
        <li>{vulIn(t.kernDuur, { van: fmt(g.van), tot: fmt(g.tot) })}</li>
        <li>{t.kernOpzeggen}</li>
        <li>{t.kernPensioen}</li>
      </ul>
      {bindend && <p className="mt-2 text-xs font-semibold text-neutralx-600">{t.bindend}</p>}
    </div>
  );
}

const PDF_VOORBEELD = "/api/me/uitzend/contract/pdf?voorbeeld=1";

/** Vóór het tekenen: kernpunten, de tekst lezen, het vakje "gelezen" en dan pas de knop. */
function LeesEnTeken({ t, fmt, bindend, busy, err, knop, onTekenen }: { t: T; fmt: Datum; bindend: boolean; busy: boolean; err: string; knop: string; onTekenen: () => void }) {
  const [data, setData] = useState<ContractTekst | "fout" | null>(null);
  const [open, setOpen] = useState(false);
  const [geopend, setGeopend] = useState(false);
  const [gelezen, setGelezen] = useState(false);
  const paneelId = useId();
  const hintId = useId();

  useEffect(() => {
    let weg = false;
    void (async () => {
      try {
        const r = await fetch("/api/me/uitzend/contract/tekst", { cache: "no-store" });
        const d = (await r.json()) as ContractTekst;
        if (!r.ok || !Array.isArray(d.blokken)) throw new Error("tekst");
        if (!weg) setData(d);
      } catch {
        if (!weg) setData("fout");
      }
    })();
    return () => {
      weg = true;
    };
  }, []);

  return (
    <div>
      {data === null && <p role="status" className="mt-3 text-xs text-neutralx-500">{t.tekstLaden}</p>}
      {data === "fout" && <p role="alert" className="mt-3 text-xs text-crit">{t.tekstFout}</p>}
      {data && data !== "fout" && <Kernpunten data={data} t={t} fmt={fmt} bindend={bindend} />}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {data && data !== "fout" && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={paneelId}
            onClick={() => {
              setOpen((v) => !v);
              setGeopend(true);
            }}
            className="btn-ghost min-h-[44px] px-3 py-1.5 text-xs"
          >
            {open ? t.verberg : t.lees}
          </button>
        )}
        {/* de pdf openen telt ook als lezen (en is de weg als het scherm de tekst niet kan laden) */}
        <a href={PDF_VOORBEELD} target="_blank" rel="noopener noreferrer" onClick={() => setGeopend(true)} className="inline-flex min-h-[44px] items-center text-xs font-semibold text-brand-600 underline">
          {t.pdfOpen}
        </a>
        <a href={`${PDF_VOORBEELD}&download=1`} download onClick={() => setGeopend(true)} className="inline-flex min-h-[44px] items-center text-xs font-semibold text-brand-600 underline">
          {t.pdfDownload}
        </a>
      </div>

      {open && data && data !== "fout" && <TekstPaneel id={paneelId} data={data} t={t} bindend={bindend} />}

      <label className="mt-3 flex min-h-[44px] items-center gap-3 text-xs text-ink">
        <input type="checkbox" checked={gelezen} disabled={!geopend} aria-describedby={geopend ? undefined : hintId} onChange={(e) => setGelezen(e.target.checked)} className="h-5 w-5 flex-shrink-0" />
        <span>{t.gelezen}</span>
      </label>
      {!geopend && <p id={hintId} className="mt-1 text-xs text-neutralx-500">{t.eerstLezen}</p>}

      {err && <p role="alert" className="mt-2 text-xs text-crit">{err}</p>}
      <button type="button" onClick={onTekenen} disabled={busy || !gelezen} className="btn-primary mt-3 min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
        {busy ? t.bezig : knop}
      </button>
    </div>
  );
}

/** Na het tekenen: de overeenkomst blijft te lezen en te downloaden. */
function Teruglezen({ id, t, bindend }: { id: string; t: T; bindend: boolean }) {
  const paneelId = useId();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ContractTekst | "fout" | null>(null);

  async function toggle() {
    const nieuw = !open;
    setOpen(nieuw);
    if (!nieuw || data) return;
    try {
      const r = await fetch(`/api/me/uitzend/contract/tekst?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const d = (await r.json()) as ContractTekst;
      if (!r.ok || !Array.isArray(d.blokken)) throw new Error("tekst");
      setData(d);
    } catch {
      setData("fout");
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" aria-expanded={open} aria-controls={paneelId} onClick={() => void toggle()} className="btn-ghost min-h-[44px] px-3 py-1.5 text-xs">
          {open ? t.verberg : t.lees}
        </button>
        <a href={`/api/me/uitzend/contract/pdf?id=${encodeURIComponent(id)}&download=1`} download className="inline-flex min-h-[44px] items-center text-xs font-semibold text-brand-600 underline">
          {t.pdfDownload}
        </a>
      </div>
      {open && data === null && <p role="status" className="mt-2 text-xs text-neutralx-500">{t.tekstLaden}</p>}
      {open && data === "fout" && <p role="alert" className="mt-2 text-xs text-crit">{t.tekstFout}</p>}
      {open && data && data !== "fout" && <TekstPaneel id={paneelId} data={data} t={t} bindend={bindend} />}
    </div>
  );
}

export function UitzendContractCard() {
  const ft = useFT();
  const t = ft.uitzendContract;
  const bindend = ft.intl !== "nl-NL";
  const fmt: Datum = (s) => new Date(s).toLocaleDateString(ft.intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  const [active, setActive] = useState<Contract | null | undefined>(undefined);
  // een nog geldige overeenkomst in een oudere versie: de werker leest en tekent de nieuwe (de melding komt van de server, in zijn taal)
  const [nieuw, setNieuw] = useState<{ titel: string; tekst: string } | null>(null);
  const [history, setHistory] = useState<Contract[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // na het tekenen verdwijnt de knop: de focus naar de melding "getekend", die ook wordt voorgelezen
  const getekendRef = useRef<HTMLParagraphElement>(null);
  const focusNaTekenen = useRef(false);
  useEffect(() => {
    if (active && focusNaTekenen.current) {
      focusNaTekenen.current = false;
      getekendRef.current?.focus();
    }
  }, [active]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/me/uitzend/contract", { cache: "no-store" });
      const d = await r.json();
      setActive(d.active ?? null);
      setNieuw(d.nieuw && typeof d.nieuw.titel === "string" ? { titel: d.nieuw.titel, tekst: String(d.nieuw.tekst ?? "") } : null);
      setHistory(Array.isArray(d.history) ? d.history : []);
    } catch {
      setActive(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sign() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/me/uitzend/contract", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? t.mislukt);
      focusNaTekenen.current = true;
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (active === undefined) return <p role="status" className="text-xs text-neutralx-400">{t.laden}</p>;

  if (!active) {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-brand-50/40 p-4">
        {nieuw && (
          <div role="status" className="mb-3 rounded-lg border border-warn/40 bg-warn/10 p-3">
            <p className="text-sm font-semibold text-ink">{nieuw.titel}</p>
            <p className="mt-1 text-xs leading-relaxed text-neutralx-700">{nieuw.tekst}</p>
          </div>
        )}
        <p className="text-sm font-semibold text-ink">{t.teken}</p>
        <p className="mt-1 text-xs leading-relaxed text-neutralx-600">
          {t.uitleg}
        </p>
        <LeesEnTeken t={t} fmt={fmt} bindend={bindend} busy={busy} err={err} knop={t.ondertekenen} onTekenen={() => void sign()} />
        {/* de oude versie blijft precies zoals hij getekend is: terug te lezen en te downloaden */}
        {nieuw && history[0] && (
          <div className="mt-4 border-t border-hair pt-3">
            <p className="text-xs font-semibold text-neutralx-500">{t.eerdere}</p>
            <p className="mt-0.5 text-xs text-neutralx-500">
              {history[0].reference} · {fmt(history[0].validFrom)} – {fmt(history[0].validUntil)}
            </p>
            <Teruglezen id={history[0].id} t={t} bindend={bindend} />
          </div>
        )}
      </div>
    );
  }

  const expired = new Date(active.validUntil).getTime() < Date.now();

  return (
    <div className="rounded-xl border border-hair p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p ref={getekendRef} tabIndex={-1} role="status" className="text-sm font-semibold text-ink focus:outline-none">{t.getekend}</p>
          <p className="mt-0.5 text-xs text-neutralx-500">
            {vulIn(t.ref, { ref: active.reference, datum: fmt(active.signedAt) })}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            expired ? "bg-warn/10 text-warn" : "bg-ok/10 text-ok"
          }`}
        >
          {expired ? t.verlopen : t.actief}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-neutralx-500">{t.geldigVan}</dt>
        <dd className="text-ink">{fmt(active.validFrom)}</dd>
        <dt className="text-neutralx-500">{t.geldigTot}</dt>
        <dd className="text-ink">{fmt(active.validUntil)}</dd>
        <dt className="text-neutralx-500">{t.abuFase}</dt>
        <dd className="text-ink">
          {vulIn(t.fase, { fase: active.phase, weken: active.weeksWorked })}
        </dd>
      </dl>
      <a
        href="/api/me/uitzend/contract/pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex min-h-[44px] items-center text-xs font-semibold text-brand-600 underline"
      >
        {t.bekijk}
      </a>
      <Teruglezen id={active.id} t={t} bindend={bindend} />

      {expired && (
        <div className="mt-3 border-t border-hair pt-3">
          <p className="text-xs text-neutralx-600">
            {t.verlopenTekst}
          </p>
          <LeesEnTeken t={t} fmt={fmt} bindend={bindend} busy={busy} err={err} knop={t.nieuw} onTekenen={() => void sign()} />
        </div>
      )}

      {history.length > 1 && (
        <div className="mt-3 border-t border-hair pt-3">
          <p className="text-xs font-semibold text-neutralx-500">{t.eerdere}</p>
          <ul className="mt-1 space-y-1">
            {history
              .filter((h) => h.id !== active.id)
              .map((h) => (
                <li key={h.id} className="flex items-center justify-between text-xs text-neutralx-500">
                  <span>
                    {h.reference} · {fmt(h.validFrom)} – {fmt(h.validUntil)}
                  </span>
                  <a
                    href={`/api/me/uitzend/contract/pdf?id=${h.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-600 underline"
                  >
                    {t.pdf}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
