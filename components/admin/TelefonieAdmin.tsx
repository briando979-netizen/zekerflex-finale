"use client";

import { useCallback, useEffect, useState } from "react";
import { KpiStrip, Notice, PageHead, Panel, Pill, Empty, type Tone } from "@/components/admin/kit";
import { ANSWER_AT, BUNDLES, NUMBER_TYPES, OPTIONS, SHOW_ON, bundleById, euro, numberTypeById, type Pricing } from "@/lib/telephony/plans";
import type { LineStatus, PhoneLine } from "@/lib/telephony/lines";

// ---------------------------------------------------------------------------
// Admin → Telefonie: de aanvragen voor een zakelijk nummer (lib/telephony/lines.ts)
// en de prijzen die klanten zien. Een nummer kopen gaat (nog) niet vanzelf: koop
// het in Twilio of bij de partner, vul het hier in en zet de aanvraag op Actief.
// ---------------------------------------------------------------------------

const STATUS: Record<LineStatus, { label: string; tone: Tone }> = {
  aangevraagd: { label: "Aangevraagd", tone: "plan" },
  in_behandeling: { label: "Wordt klaargezet", tone: "plan" },
  actief: { label: "Actief", tone: "ok" },
  geannuleerd: { label: "Geannuleerd", tone: "neutral" },
};

const labelOf = <T extends string>(list: readonly { id: T; label: string }[], id: T) => list.find((x) => x.id === id)?.label ?? id;
const toEuro = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const toCents = (v: string): number | null => {
  const n = Number(v.replace(",", ".").trim());
  return v.trim() === "" || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100);
};

export function TelefonieAdmin() {
  const [lines, setLines] = useState<PhoneLine[] | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [defaults, setDefaults] = useState<Pricing | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/telefonie", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setMessage({ tone: "crit", text: "Kon de aanvragen niet laden." });
    const d = await r.json();
    setLines(d.lines);
    setPricing(d.pricing);
    setDefaults(d.defaults);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: unknown): Promise<Record<string, unknown> | null> {
    const r = await fetch("/api/admin/telefonie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setMessage({ tone: "crit", text: d?.error?.message ?? "Opslaan lukte niet." });
      return null;
    }
    return d;
  }

  const head = <PageHead title="Telefonie" subtitle="Aanvragen voor een zakelijk nummer van opdrachtgevers en flexkrachten, en de prijzen die zij zien." />;
  if (!lines || !pricing || !defaults) return <div className="space-y-4">{head}<div className="a-panel h-28 animate-pulse" /></div>;

  const open = lines.filter((l) => l.status === "aangevraagd" || l.status === "in_behandeling");
  const active = lines.filter((l) => l.status === "actief");

  return (
    <div className="space-y-4">
      {head}
      <KpiStrip
        items={[
          { label: "Open aanvragen", value: open.length, hint: "aangevraagd of wordt klaargezet", ...(open.length ? { tone: "warn" as const } : {}) },
          { label: "Actieve lijnen", value: active.length, hint: "met een toegewezen nummer" },
          { label: "Per maand (actief)", value: euro(active.reduce((s, l) => s + l.quote.monthlyCents, 0)), hint: "volgens de prijs bij aanvraag" },
          { label: "Nummer op aanvraag", value: open.filter((l) => l.quote.onRequest).length, hint: "06, 085, 088, lokaal, 0800 of overzetten" },
        ]}
      />
      <Notice tone="plan">
        Direct leverbaar via Twilio: alleen Nederlandse 097-nummers (bellen en sms, ±$7,70 per maand inkoop). 06-, 085/088-, lokale en 0800-nummers en
        overzetten lopen via een partner. Een nummer kopen gaat nog niet vanzelf: koop het, vul het hieronder in en zet de aanvraag op Actief.
      </Notice>
      {message && <Notice tone={message.tone} role={message.tone === "crit" ? "alert" : "status"}>{message.text}</Notice>}

      <Panel flush title="Aanvragen" subtitle={`${lines.length} in totaal`}>
        {lines.length === 0 ? (
          <Empty title="Nog geen aanvragen" body="Opdrachtgevers vragen aan via Telefonie in hun omgeving, flexkrachten via Account → Je eigen werknummer." />
        ) : (
          <ul>
            {lines.map((l) => (
              <LineRow
                key={l.id}
                line={l}
                onSave={async (patch) => {
                  const d = await post({ action: "update", id: l.id, ...patch });
                  if (d?.line) {
                    setLines((all) => (all ?? []).map((x) => (x.id === l.id ? (d.line as PhoneLine) : x)));
                    setMessage({ tone: "ok", text: "Aanvraag bijgewerkt." });
                  }
                }}
              />
            ))}
          </ul>
        )}
      </Panel>

      <PricingEditor
        pricing={pricing}
        defaults={defaults}
        onSave={async (next) => {
          const d = await post({ action: "pricing", pricing: next });
          if (d?.pricing) {
            setPricing(d.pricing as Pricing);
            setMessage({ tone: "ok", text: "Prijzen opgeslagen. Klanten zien ze meteen." });
          }
        }}
      />
    </div>
  );
}

function LineRow({ line, onSave }: { line: PhoneLine; onSave: (patch: { status: LineStatus; number: string; adminNote: string }) => Promise<void> }) {
  const [status, setStatus] = useState<LineStatus>(line.status);
  const [number, setNumber] = useState(line.number ?? "");
  const [note, setNote] = useState(line.adminNote ?? "");
  const [busy, setBusy] = useState(false);
  const bundle = bundleById(line.selection.bundle);
  const facts = [
    line.ownNumber && `huidig nummer ${line.ownNumber}`,
    line.forwardTo && `doorschakelen naar ${line.forwardTo}`,
    line.region && `regio ${line.region}`,
    line.answerAt.length > 0 && `opnemen: ${line.answerAt.map((a) => labelOf(ANSWER_AT, a).toLowerCase()).join(", ")}`,
    line.showOn.length > 0 && `tonen: ${line.showOn.map((s) => labelOf(SHOW_ON, s).toLowerCase()).join(", ")}`,
  ].filter(Boolean);

  return (
    <li className="space-y-2 px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
            {line.orgName ?? line.requesterName} <span style={{ color: "var(--a-mute)" }}>· {line.scope === "bedrijf" ? "bedrijf" : "flexkracht"} · {line.requesterEmail}</span>
          </p>
          <p className="text-xs" style={{ color: "var(--a-dim)" }}>
            {numberTypeById(line.selection.kind)?.label ?? line.selection.kind} · {bundle ? `bundel ${bundle.label}` : "zonder bundel"} · {line.selection.options.map((o) => labelOf(OPTIONS, o)).join(", ") || "geen opties"} ·{" "}
            <span style={{ color: "var(--a-money)" }}>{euro(line.quote.monthlyCents)}/mnd{line.quote.onRequest ? " + nummer op aanvraag" : ""}</span>
          </p>
          {facts.length > 0 && <p className="text-xs" style={{ color: "var(--a-mute)" }}>{facts.join(" · ")}</p>}
          {line.note && <p className="mt-1 text-xs italic" style={{ color: "var(--a-dim)" }}>“{line.note}”</p>}
        </div>
        <span className="flex flex-col items-end gap-1">
          <Pill tone={STATUS[line.status].tone}>{STATUS[line.status].label}</Pill>
          <span className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>{line.createdAt.slice(0, 10)}</span>
        </span>
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave({ status, number, adminNote: note });
          setBusy(false);
        }}
      >
        <select value={status} onChange={(e) => setStatus(e.target.value as LineStatus)} className="a-input w-auto" aria-label="Status">
          {(Object.keys(STATUS) as LineStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS[s].label}</option>
          ))}
        </select>
        <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Toegewezen nummer" aria-label="Toegewezen nummer" className="a-input w-44" />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notitie (alleen beheer)" aria-label="Notitie" className="a-input min-w-0 flex-1" />
        <button type="submit" className="a-button" disabled={busy}>{busy ? "Bezig…" : "Opslaan"}</button>
      </form>
    </li>
  );
}

function PricingEditor({ pricing, defaults, onSave }: { pricing: Pricing; defaults: Pricing; onSave: (p: Pricing) => Promise<void> }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = { line: toEuro(pricing.lineCents), minutes: String(pricing.includedMinutes), extraMinute: toEuro(pricing.extraMinuteCents) };
    for (const b of BUNDLES) d[`b:${b.id}`] = toEuro(pricing.bundleCents[b.id]);
    for (const o of OPTIONS) d[`o:${o.id}`] = toEuro(pricing.optionCents[o.id]);
    for (const t of NUMBER_TYPES) d[`n:${t.id}`] = toEuro(pricing.numberCents[t.id]);
    return d;
  });
  const [error, setError] = useState("");
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function build(): Pricing | null {
    const need = (k: string) => toCents(draft[k] ?? "");
    const p: Pricing = {
      lineCents: need("line") ?? -1,
      includedMinutes: Math.round(Number(draft.minutes)),
      extraMinuteCents: need("extraMinute") ?? -1,
      bundleCents: Object.fromEntries(BUNDLES.map((b) => [b.id, need(`b:${b.id}`) ?? -1])) as Pricing["bundleCents"],
      optionCents: Object.fromEntries(OPTIONS.map((o) => [o.id, need(`o:${o.id}`) ?? -1])) as Pricing["optionCents"],
      // leeg = prijs op aanvraag
      numberCents: Object.fromEntries(NUMBER_TYPES.map((t) => [t.id, need(`n:${t.id}`)])) as Pricing["numberCents"],
    };
    const bad = [p.lineCents, p.extraMinuteCents, ...Object.values(p.bundleCents), ...Object.values(p.optionCents)].some((c) => c < 0) || !Number.isFinite(p.includedMinutes) || p.includedMinutes < 0;
    return bad ? null : p;
  }

  const field = (k: string, label: string, hint: string) => (
    <label key={k} className="block text-xs" style={{ color: "var(--a-dim)" }}>
      {label}
      <input value={draft[k] ?? ""} onChange={(e) => set(k, e.target.value)} inputMode="decimal" className="a-input mt-1 w-full" aria-label={label} />
      <span className="mt-0.5 block text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>{hint}</span>
    </label>
  );

  return (
    <Panel title="Prijzen" subtitle="In euro per maand, inclusief btw zoals klanten ze zien. Leeg bij een nummersoort = prijs op aanvraag.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {field("line", "ZekerFlex-lijn (zonder bundel)", `standaard ${euro(defaults.lineCents)}`)}
        {BUNDLES.map((b) => field(`b:${b.id}`, `Bundel ${b.label}`, `standaard ${euro(defaults.bundleCents[b.id])}`))}
        {OPTIONS.map((o) => field(`o:${o.id}`, o.label, `standaard ${euro(defaults.optionCents[o.id])}`))}
        {NUMBER_TYPES.map((t) => field(`n:${t.id}`, `Extra voor: ${t.label}`, defaults.numberCents[t.id] === null ? "standaard op aanvraag" : `standaard ${euro(defaults.numberCents[t.id]!)}`))}
        {field("minutes", "Belminuten inbegrepen", `standaard ${defaults.includedMinutes}`)}
        {field("extraMinute", "Per minuut daarna", `standaard ${euro(defaults.extraMinuteCents)}`)}
      </div>
      {error && <p role="alert" className="mt-3 text-xs" style={{ color: "var(--a-crit)" }}>{error}</p>}
      <button
        type="button"
        className="a-button a-button-primary mt-4"
        onClick={() => {
          const p = build();
          if (!p) return setError("Vul overal een geldig bedrag in (bij een nummersoort mag het leeg blijven).");
          setError("");
          void onSave(p);
        }}
      >
        Prijzen opslaan
      </button>
    </Panel>
  );
}
