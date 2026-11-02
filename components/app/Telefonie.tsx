"use client";

import { useMemo, useState } from "react";
import {
  ANSWER_AT,
  BUNDLES,
  NEEDS_OWN_NUMBER,
  NUMBER_TYPES,
  OPTIONS,
  SHOW_ON,
  bundleById,
  euro,
  numberTypeById,
  quote,
  selectedOptions,
  type AnswerAt,
  type BundleId,
  type NumberKind,
  type OptionId,
  type Pricing,
  type ShowOn,
} from "@/lib/telephony/plans";
import type { LineScope, LineStatus, PhoneLine } from "@/lib/telephony/lines";

// ---------------------------------------------------------------------------
// Zakelijk nummer samenstellen: nummersoort, bundel of losse opties, waar je
// opneemt en waar het nummer te zien is — met de maandprijs live ernaast.
// Aanvragen kost nog niets: een beheerder zet de lijn klaar, daarna betalen.
// ---------------------------------------------------------------------------

const STATUS: Record<LineStatus, { label: string; cls: string }> = {
  aangevraagd: { label: "Aangevraagd", cls: "bg-plan-soft text-plan-ink" },
  in_behandeling: { label: "Wordt klaargezet", cls: "bg-plan-soft text-plan-ink" },
  actief: { label: "Actief", cls: "bg-mintwash text-ok" },
  geannuleerd: { label: "Geannuleerd", cls: "bg-paper-soft text-neutralx-500" },
};

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** Vast formaat (geen toLocaleDateString): server en browser tonen exact hetzelfde. */
const dateNl = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
};

export function Telefonie({
  scope,
  pricing,
  free,
  initialLines,
  canRequest,
}: {
  scope: LineScope;
  pricing: Pricing;
  /** kosteloos account (lib/billing/comp): the prices are already € 0, nothing to pay later */
  free: boolean;
  initialLines: PhoneLine[];
  canRequest: boolean;
}) {
  const [lines, setLines] = useState(initialLines);
  const [kind, setKind] = useState<NumberKind>("mobiel097");
  const [bundle, setBundle] = useState<BundleId | null>("start");
  const [options, setOptions] = useState<OptionId[]>([]);
  const [answerAt, setAnswerAt] = useState<AnswerAt[]>(["telefoon"]);
  const [showOn, setShowOn] = useState<ShowOn[]>(["profiel"]);
  const [ownNumber, setOwnNumber] = useState("");
  const [forwardTo, setForwardTo] = useState("");
  const [region, setRegion] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const selection = useMemo(() => ({ kind, bundle, options }), [kind, bundle, options]);
  const q = useMemo(() => quote(selection, pricing), [selection, pricing]);
  const wanted = selectedOptions(selection);
  const included = new Set(bundleById(bundle)?.options ?? []);
  const needsForward = answerAt.includes("telefoon") || wanted.has("doorschakelen");
  const bedrijf = scope === "bedrijf";

  async function submit() {
    setBusy(true);
    setError("");
    setDone("");
    const res = await fetch("/api/telefonie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, kind, bundle, options: [...wanted], answerAt, showOn, ownNumber, forwardTo, region, note }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : null;
    setBusy(false);
    if (!res?.ok || !data?.line) {
      setError(data?.error?.message ?? "Aanvragen lukte niet. Probeer het opnieuw.");
      return;
    }
    setLines((l) => [data.line as PhoneLine, ...l]);
    setDone(free ? "Aangevraagd. We nemen binnen een werkdag contact met je op." : "Aangevraagd. We nemen binnen een werkdag contact met je op; je betaalt pas als je lijn klaarstaat.");
  }

  async function cancel(id: string) {
    const res = await fetch("/api/telefonie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", scope, id }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : null;
    if (res?.ok && data?.line) setLines((l) => l.map((x) => (x.id === id ? (data.line as PhoneLine) : x)));
    else setError(data?.error?.message ?? "Annuleren lukte niet.");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">{bedrijf ? "Zakelijk nummer & bellen" : "Je eigen werknummer"}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutralx-600">
          {bedrijf
            ? "Eén nummer voor je bedrijf, met een AI-assistent, voicemail, keuzemenu of teamnummer. Kies een bundel of stel zelf samen."
            : "Een apart nummer voor je werk, zodat je privénummer privé blijft. Met voicemail, doorschakelen of een AI-assistent die voor je opneemt."}
        </p>
      </header>

      {free && (
        <p className="rounded-xl border border-brand-200 bg-mintwash/50 px-4 py-2.5 text-sm text-brand-800">
          Gratis voor jouw account: de lijn, de bundels en alle opties kosten € 0.
        </p>
      )}

      {lines.length > 0 && (
        <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
          <h2 className="font-display text-base font-bold text-ink">Je nummers</h2>
          <ul className="mt-3 divide-y divide-hair">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{l.number ?? numberTypeById(l.selection.kind)?.label ?? "Nummer"}</p>
                  <p className="text-xs text-neutralx-500">
                    {bundleById(l.selection.bundle) ? `Bundel ${bundleById(l.selection.bundle)!.label}` : `${l.selection.options.length} opties`} · aangevraagd op {dateNl(l.createdAt)}
                    {l.quote.monthlyCents > 0 && ` · ${euro(l.quote.monthlyCents)} per maand${l.quote.onRequest ? " + nummer op aanvraag" : ""}`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>
                {l.status === "aangevraagd" && canRequest && (
                  <button type="button" onClick={() => void cancel(l.id)} className="text-xs text-neutralx-500 underline hover:text-crit">
                    Annuleren
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!canRequest ? (
        <p className="rounded-xl border border-hair bg-paper-soft px-4 py-3 text-sm text-neutralx-600">Alleen de hoofdbeheerder van je bedrijf kan een nummer aanvragen.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            {/* 1. nummer */}
            <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
              <h2 className="font-display text-base font-bold text-ink">1. Kies je nummer</h2>
              <div role="radiogroup" aria-label="Soort nummer" className="mt-3 grid gap-3 sm:grid-cols-2">
                {NUMBER_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={kind === t.id}
                    onClick={() => setKind(t.id)}
                    className={`rounded-xl border p-3 text-left transition ${kind === t.id ? "border-brand-500 ring-2 ring-brand-500/30" : "border-hair hover:border-hairstrong"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{t.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.availability === "direct" ? "bg-mintwash text-ok" : "bg-plan-soft text-plan-ink"}`}>
                        {t.availability === "direct" ? "Direct" : "Op aanvraag"}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-neutralx-500">{t.example}</span>
                    <span className="mt-1.5 block text-xs text-neutralx-600">{t.blurb}</span>
                  </button>
                ))}
              </div>
              {NEEDS_OWN_NUMBER.includes(kind) && (
                <label className="mt-4 block text-sm font-medium text-ink">
                  Je huidige nummer
                  <input value={ownNumber} onChange={(e) => setOwnNumber(e.target.value)} inputMode="tel" placeholder="06 12345678" className="mt-1 block w-full rounded-lg border border-hairstrong px-3 py-2 text-sm sm:w-72" />
                </label>
              )}
              {kind === "lokaal" && (
                <label className="mt-4 block text-sm font-medium text-ink">
                  Voor welke stad of welk netnummer?
                  <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Groningen (050)" className="mt-1 block w-full rounded-lg border border-hairstrong px-3 py-2 text-sm sm:w-72" />
                </label>
              )}
            </section>

            {/* 2. bundel of los */}
            <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
              <h2 className="font-display text-base font-bold text-ink">2. Kies een bundel of stel zelf samen</h2>
              <div role="radiogroup" aria-label="Bundel" className="mt-3 grid gap-3 sm:grid-cols-3">
                {BUNDLES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={bundle === b.id}
                    onClick={() => setBundle(b.id)}
                    className={`rounded-xl border p-3 text-left transition ${bundle === b.id ? "border-brand-500 ring-2 ring-brand-500/30" : "border-hair hover:border-hairstrong"}`}
                  >
                    <span className="block text-sm font-semibold text-ink">{b.label}</span>
                    <span className="block text-lg font-bold text-money-ink">
                      {euro(pricing.bundleCents[b.id])}
                      <span className="text-xs font-normal text-neutralx-500"> /mnd</span>
                    </span>
                    <span className="mt-1 block text-xs text-neutralx-600">{b.blurb}</span>
                    <span className="mt-1.5 block text-[11px] text-neutralx-500">{b.options.map((o) => OPTIONS.find((x) => x.id === o)?.label).join(" · ")}</span>
                  </button>
                ))}
              </div>
              <button type="button" aria-pressed={bundle === null} onClick={() => setBundle(null)} className={`mt-3 rounded-full border px-3 py-1.5 text-xs font-semibold ${bundle === null ? "border-brand-500 bg-mintwash text-ink" : "border-hairstrong text-neutralx-600"}`}>
                Zonder bundel: alleen de lijn ({euro(pricing.lineCents)} /mnd) en losse opties
              </button>

              <ul className="mt-4 divide-y divide-hair rounded-xl border border-hair">
                {OPTIONS.map((o) => {
                  const inBundle = included.has(o.id);
                  return (
                    <li key={o.id}>
                      <label className={`flex gap-3 p-3 ${inBundle ? "cursor-default" : "cursor-pointer hover:bg-paper-soft"}`}>
                        <input type="checkbox" checked={wanted.has(o.id)} disabled={inBundle} onChange={() => setOptions((list) => toggle(list, o.id))} className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink">{o.label}</span>
                          <span className="block text-xs text-neutralx-600">{o.blurb}</span>
                        </span>
                        <span className="flex-shrink-0 text-xs font-semibold text-money-ink">{inBundle ? "in bundel" : `+ ${euro(pricing.optionCents[o.id])}`}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 3. waar */}
            <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
              <h2 className="font-display text-base font-bold text-ink">3. Waar neem je op, en waar laten we je nummer zien?</h2>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-sm font-medium text-ink">Opnemen</legend>
                  {ANSWER_AT.map((a) => (
                    <label key={a.id} className={`mt-2 flex items-center gap-2 text-sm ${a.soon ? "text-neutralx-400" : "text-neutralx-700"}`}>
                      <input type="checkbox" disabled={a.soon} checked={answerAt.includes(a.id)} onChange={() => setAnswerAt((l) => toggle(l, a.id))} className="h-4 w-4" />
                      {a.label}
                      {a.soon && <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px]">binnenkort</span>}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend className="text-sm font-medium text-ink">Nummer tonen</legend>
                  {SHOW_ON.filter((s) => bedrijf || !s.bedrijfOnly).map((s) => (
                    <label key={s.id} className="mt-2 flex items-center gap-2 text-sm text-neutralx-700">
                      <input type="checkbox" checked={showOn.includes(s.id)} onChange={() => setShowOn((l) => toggle(l, s.id))} className="h-4 w-4" />
                      {s.label}
                    </label>
                  ))}
                </fieldset>
              </div>
              {needsForward && (
                <label className="mt-4 block text-sm font-medium text-ink">
                  Naar welk nummer schakelen we door?
                  <input value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} inputMode="tel" placeholder={ownNumber || "06 12345678"} className="mt-1 block w-full rounded-lg border border-hairstrong px-3 py-2 text-sm sm:w-72" />
                </label>
              )}
              <label className="mt-4 block text-sm font-medium text-ink">
                Nog iets wat we moeten weten? <span className="font-normal text-neutralx-500">(mag leeg)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} placeholder="Bijvoorbeeld je openingstijden of wie er in het team zit." className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" />
              </label>
            </section>
          </div>

          {/* samenvatting */}
          <aside className="rounded-2xl border border-money/30 bg-money-soft/60 p-5 lg:sticky lg:top-4">
            <h2 className="font-display text-base font-bold text-ink">Jouw samenstelling</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {q.lines.map((l) => (
                <li key={l.label} className="flex justify-between gap-3">
                  <span className="text-neutralx-700">{l.label}</span>
                  <span className="flex-shrink-0 font-semibold text-ink">{l.cents === null ? "op aanvraag" : euro(l.cents)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t border-money/30 pt-3">
              <span className="text-sm font-semibold text-ink">Per maand</span>
              <span className="text-2xl font-bold text-money-ink">{euro(q.monthlyCents)}</span>
            </div>
            {q.onRequest && <p className="mt-1 text-xs text-neutralx-600">Plus het nummer zelf: dat bedrag hoor je binnen 2 werkdagen.</p>}
            <p className="mt-2 text-xs text-neutralx-600">
              Inclusief {pricing.includedMinutes} belminuten per maand, daarna {euro(pricing.extraMinuteCents)} per minuut. Maandelijks opzegbaar.
            </p>
            {q.tip && (
              <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs text-ink">
                Tip: {q.tip.bundle ? `met de bundel ${bundleById(q.tip.bundle)?.label}` : "zonder bundel"} betaal je {euro(q.tip.saveCents)} minder per maand.
                <button type="button" onClick={() => setBundle(q.tip!.bundle)} className="ml-1 font-semibold text-brand-700 underline">
                  Zo doen
                </button>
              </div>
            )}
            <button type="button" onClick={() => void submit()} disabled={busy} className="mt-4 w-full rounded-lg bg-ink py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50">
              {busy ? "Bezig…" : "Aanvragen"}
            </button>
            <p className="mt-2 text-[11px] text-neutralx-500">
              {free
                ? q.onRequest
                  ? "Gratis voor jouw account: de lijn en de opties kosten niets."
                  : "Gratis voor jouw account: we zetten je lijn klaar, er komt geen betaallink."
                : "Je betaalt nog niets. We zetten je lijn klaar en sturen je dan de betaallink."}
            </p>
            {error && <p role="alert" className="mt-2 text-sm font-semibold text-crit">{error}</p>}
            {done && <p role="status" className="mt-2 text-sm font-semibold text-ok">{done}</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
