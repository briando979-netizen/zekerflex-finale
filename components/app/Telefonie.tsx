"use client";

import { useMemo, useState } from "react";
import { NietInIphone } from "@/components/app/NietInIphone";
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
import { TELEFONIE_NL, type TelefonieTeksten } from "@/lib/telephony/teksten";
import { vulIn } from "@/lib/i18n/vul-in";

// ---------------------------------------------------------------------------
// Zakelijk nummer samenstellen: nummersoort, bundel of losse opties, waar je
// opneemt en waar het nummer te zien is — met de maandprijs live ernaast.
// Aanvragen kost nog niets: een beheerder zet de lijn klaar, daarna betalen.
// ---------------------------------------------------------------------------

const STATUS_KLEUR: Record<LineStatus, string> = {
  aangevraagd: "bg-plan-soft text-plan-ink",
  in_behandeling: "bg-plan-soft text-plan-ink",
  actief: "bg-mintwash text-ok",
  geannuleerd: "bg-paper-soft text-neutralx-500",
};

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
/** Vast formaat (geen toLocaleDateString): server en browser tonen exact hetzelfde. */
const dateNl = (iso: string, maanden: string[]) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${maanden[Number(m) - 1] ?? ""} ${y}`;
};

export function Telefonie({
  scope,
  pricing,
  free,
  initialLines,
  canRequest,
  texts,
}: {
  scope: LineScope;
  pricing: Pricing;
  /** kosteloos account (lib/billing/comp): the prices are already € 0, nothing to pay later */
  free: boolean;
  initialLines: PhoneLine[];
  canRequest: boolean;
  /** de teksten in de taal van de werker (lib/telephony/teksten.ts); zonder: Nederlands (werkgever, beheer) */
  texts?: TelefonieTeksten | undefined;
}) {
  const tx = texts ?? TELEFONIE_NL;
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
  const quoteLabel = (l: { key?: string | undefined; label: string }): string => {
    if (l.key === "lijn") return tx.quote.lijn;
    if (l.key === "bundel" && bundleById(bundle)) return vulIn(tx.quote.bundel, { naam: tx.bundels[bundle!].label, aantal: bundleById(bundle)!.options.length });
    if (l.key === "nummer") return tx.nummer[kind].label;
    if (l.key?.startsWith("optie:")) return tx.optie[l.key.slice(6) as OptionId]?.label ?? l.label;
    return l.label;
  };

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
      setError(data?.error?.message ?? tx.aanvraagMislukt);
      return;
    }
    setLines((l) => [data.line as PhoneLine, ...l]);
    setDone(free ? tx.aangevraagdGratis : tx.aangevraagdBetaald);
  }

  async function cancel(id: string) {
    const res = await fetch("/api/telefonie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", scope, id }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : null;
    if (res?.ok && data?.line) setLines((l) => l.map((x) => (x.id === id ? (data.line as PhoneLine) : x)));
    else setError(data?.error?.message ?? tx.annulerenMislukt);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">{bedrijf ? tx.kopBedrijf : tx.kopWerker}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutralx-600">
          {bedrijf ? tx.introBedrijf : tx.introWerker}
        </p>
      </header>

      {free && (
        <p className="rounded-xl border border-brand-200 bg-mintwash/50 px-4 py-2.5 text-sm text-brand-800">
          {tx.gratisAccount}
        </p>
      )}

      {lines.length > 0 && (
        <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
          <h2 className="font-display text-base font-bold text-ink">{tx.jeNummers}</h2>
          <ul className="mt-3 divide-y divide-hair">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{l.number ?? (numberTypeById(l.selection.kind) ? tx.nummer[l.selection.kind].label : tx.nummerFallback)}</p>
                  <p className="text-xs text-neutralx-500">
                    {bundleById(l.selection.bundle) ? vulIn(tx.bundelNaam, { naam: tx.bundels[bundleById(l.selection.bundle)!.id].label }) : vulIn(tx.aantalOpties, { aantal: l.selection.options.length })} · {vulIn(tx.aangevraagdOp, { datum: dateNl(l.createdAt, tx.maanden) })}
                    {l.quote.monthlyCents > 0 && ` · ${vulIn(tx.perMaand, { bedrag: euro(l.quote.monthlyCents) })}${l.quote.onRequest ? tx.nummerOpAanvraag : ""}`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_KLEUR[l.status]}`}>{tx.status[l.status]}</span>
                {l.status === "aangevraagd" && canRequest && (
                  <button type="button" onClick={() => void cancel(l.id)} className="text-xs text-neutralx-500 underline hover:text-crit">
                    {tx.annuleren}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!canRequest ? (
        <p className="rounded-xl border border-hair bg-paper-soft px-4 py-3 text-sm text-neutralx-600">{tx.alleenBeheerder}</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            {/* 1. nummer */}
            <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
              <h2 className="font-display text-base font-bold text-ink">{tx.stap1}</h2>
              <div role="radiogroup" aria-label={tx.soortNummer} className="mt-3 grid gap-3 sm:grid-cols-2">
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
                      <span className="text-sm font-semibold text-ink">{tx.nummer[t.id].label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.availability === "direct" ? "bg-mintwash text-ok" : "bg-plan-soft text-plan-ink"}`}>
                        {t.availability === "direct" ? tx.direct : tx.opAanvraag}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs text-neutralx-500">{tx.nummer[t.id].example}</span>
                    <span className="mt-1.5 block text-xs text-neutralx-600">{tx.nummer[t.id].blurb}</span>
                  </button>
                ))}
              </div>
              {NEEDS_OWN_NUMBER.includes(kind) && (
                <label className="mt-4 block text-sm font-medium text-ink">
                  {tx.huidigNummer}
                  <input value={ownNumber} onChange={(e) => setOwnNumber(e.target.value)} inputMode="tel" placeholder="06 12345678" className="mt-1 block w-full rounded-lg border border-hairstrong px-3 py-2 text-sm sm:w-72" />
                </label>
              )}
              {kind === "lokaal" && (
                <label className="mt-4 block text-sm font-medium text-ink">
                  {tx.welkeStad}
                  <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Groningen (050)" className="mt-1 block w-full rounded-lg border border-hairstrong px-3 py-2 text-sm sm:w-72" />
                </label>
              )}
            </section>

            {/* 2. bundel of los */}
            <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
              <h2 className="font-display text-base font-bold text-ink">{tx.stap2}</h2>
              <div role="radiogroup" aria-label={tx.bundel} className="mt-3 grid gap-3 sm:grid-cols-3">
                {BUNDLES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={bundle === b.id}
                    onClick={() => setBundle(b.id)}
                    className={`rounded-xl border p-3 text-left transition ${bundle === b.id ? "border-brand-500 ring-2 ring-brand-500/30" : "border-hair hover:border-hairstrong"}`}
                  >
                    <span className="block text-sm font-semibold text-ink">{tx.bundels[b.id].label}</span>
                    <span className="block text-lg font-bold text-money-ink">
                      {euro(pricing.bundleCents[b.id])}
                      <span className="text-xs font-normal text-neutralx-500">{tx.perMnd}</span>
                    </span>
                    <span className="mt-1 block text-xs text-neutralx-600">{tx.bundels[b.id].blurb}</span>
                    <span className="mt-1.5 block text-[11px] text-neutralx-500">{b.options.map((o) => tx.optie[o].label).join(" · ")}</span>
                  </button>
                ))}
              </div>
              <button type="button" aria-pressed={bundle === null} onClick={() => setBundle(null)} className={`mt-3 rounded-full border px-3 py-1.5 text-xs font-semibold ${bundle === null ? "border-brand-500 bg-mintwash text-ink" : "border-hairstrong text-neutralx-600"}`}>
                {vulIn(tx.zonderBundel, { bedrag: euro(pricing.lineCents) })}
              </button>

              <ul className="mt-4 divide-y divide-hair rounded-xl border border-hair">
                {OPTIONS.map((o) => {
                  const inBundle = included.has(o.id);
                  return (
                    <li key={o.id}>
                      <label className={`flex gap-3 p-3 ${inBundle ? "cursor-default" : "cursor-pointer hover:bg-paper-soft"}`}>
                        <input type="checkbox" checked={wanted.has(o.id)} disabled={inBundle} onChange={() => setOptions((list) => toggle(list, o.id))} className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink">{tx.optie[o.id].label}</span>
                          <span className="block text-xs text-neutralx-600">{tx.optie[o.id].blurb}</span>
                        </span>
                        <span className="flex-shrink-0 text-xs font-semibold text-money-ink">{inBundle ? tx.inBundel : `+ ${euro(pricing.optionCents[o.id])}`}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 3. waar */}
            <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
              <h2 className="font-display text-base font-bold text-ink">{tx.stap3}</h2>
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-sm font-medium text-ink">{tx.opnemen}</legend>
                  {ANSWER_AT.map((a) => (
                    <label key={a.id} className={`mt-2 flex items-center gap-2 text-sm ${a.soon ? "text-neutralx-400" : "text-neutralx-700"}`}>
                      <input type="checkbox" disabled={a.soon} checked={answerAt.includes(a.id)} onChange={() => setAnswerAt((l) => toggle(l, a.id))} className="h-4 w-4" />
                      {tx.antwoord[a.id]}
                      {a.soon && <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-600">{tx.binnenkort}</span>}
                    </label>
                  ))}
                </fieldset>
                <fieldset>
                  <legend className="text-sm font-medium text-ink">{tx.nummerTonen}</legend>
                  {SHOW_ON.filter((s) => bedrijf || !s.bedrijfOnly).map((s) => (
                    <label key={s.id} className="mt-2 flex items-center gap-2 text-sm text-neutralx-700">
                      <input type="checkbox" checked={showOn.includes(s.id)} onChange={() => setShowOn((l) => toggle(l, s.id))} className="h-4 w-4" />
                      {tx.tonen[s.id]}
                    </label>
                  ))}
                </fieldset>
              </div>
              {needsForward && (
                <label className="mt-4 block text-sm font-medium text-ink">
                  {tx.doorschakelNaar}
                  <input value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} inputMode="tel" placeholder={ownNumber || "06 12345678"} className="mt-1 block w-full rounded-lg border border-hairstrong px-3 py-2 text-sm sm:w-72" />
                </label>
              )}
              <label className="mt-4 block text-sm font-medium text-ink">
                {tx.nogIets} <span className="font-normal text-neutralx-500">{tx.magLeeg}</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={600} placeholder={tx.notitieVoorbeeld} className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm" />
              </label>
            </section>
          </div>

          {/* samenvatting */}
          <aside aria-label={tx.samenstelling} className="rounded-2xl border border-money/30 bg-money-soft/60 p-5 lg:sticky lg:top-4">
            <h2 className="font-display text-base font-bold text-ink">{tx.samenstelling}</h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {q.lines.map((l) => (
                <li key={l.label} className="flex justify-between gap-3">
                  <span className="text-neutralx-700">{quoteLabel(l)}</span>
                  <span className="flex-shrink-0 font-semibold text-ink">{l.cents === null ? tx.opAanvraagKort : euro(l.cents)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t border-money/30 pt-3">
              <span className="text-sm font-semibold text-ink">{tx.perMaandKop}</span>
              <span className="text-2xl font-bold text-money-ink">{euro(q.monthlyCents)}</span>
            </div>
            {q.onRequest && <p className="mt-1 text-xs text-neutralx-600">{tx.plusNummer}</p>}
            <p className="mt-2 text-xs text-neutralx-600">
              {vulIn(tx.inclusief, { minuten: pricing.includedMinutes, bedrag: euro(pricing.extraMinuteCents) })}
            </p>
            {q.tip && (
              <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs text-ink">
                {vulIn(tx.tip, { wat: q.tip.bundle ? vulIn(tx.tipMetBundel, { naam: tx.bundels[q.tip.bundle].label }) : tx.tipZonderBundel, bedrag: euro(q.tip.saveCents) })}
                <button type="button" onClick={() => setBundle(q.tip!.bundle)} className="ml-1 font-semibold text-brand-700 underline">
                  {tx.zoDoen}
                </button>
              </div>
            )}
            <NietInIphone>
              <button type="button" onClick={() => void submit()} disabled={busy} className="mt-4 w-full rounded-lg bg-ink py-3 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50">
                {busy ? tx.bezig : tx.aanvragen}
              </button>
            </NietInIphone>
            <p className="mt-2 text-[11px] text-neutralx-500">
              {free
                ? q.onRequest
                  ? tx.gratisOpAanvraag
                  : tx.gratisZonderBetaal
                : tx.nogNietBetalen}
            </p>
            {error && <p role="alert" className="mt-2 text-sm font-semibold text-crit">{error}</p>}
            {done && <p role="status" className="mt-2 text-sm font-semibold text-ok">{done}</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
