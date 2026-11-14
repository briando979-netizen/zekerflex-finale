"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { createShiftAction, type NewShiftState } from "@/app/werkgever/diensten/nieuw/actions";
import { updateShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import type { ShiftTemplate } from "@/lib/shifts/create";
import { shiftCategory } from "@/lib/shifts/category";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { extraDayOptions } from "@/lib/shifts/extra-days";
import { AddressAutocomplete, type PickedAddress } from "@/components/app/AddressAutocomplete";
import { FairPayMeter } from "@/components/app/FairPayMeter";
import { CONCEPT_KEY, parseConcept, toShiftFormValues } from "@/lib/klusconcept/concept";
import { SjabloonGalerij } from "@/components/app/SjabloonGalerij";
import { useI18n, useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

const initial: NewShiftState = { error: null };

interface OwnTemplate {
  id: string;
  label: string;
  hourlyRateCents: number;
  breakMinutes: number;
  description: string | null;
  dresscode: string | null;
}

function Submit({ days, blocked }: { days: number; blocked?: boolean }) {
  const { pending } = useFormStatus();
  const n = useT().newShiftForm;
  return (
    <button type="submit" disabled={pending || blocked} className="btn-primary w-full disabled:opacity-50">
      {pending
        ? n.bezigUitzetten
        : days > 1
          ? fmt(n.zetUit, { n: days })
          : n.uitzetten}
    </button>
  );
}

/** An existing klus opened for editing: same form, saved with updateShiftAction. */
export interface ShiftEdit {
  shiftId: string;
  /** "Vestiging — Plaats": the location stays as it was placed */
  locatie: string;
  assignedCount: number;
  initial: {
    title: string;
    description: string;
    dresscode: string;
    extraInfo: string;
    /** datetime-local values in Dutch time ("2026-11-05T09:00") */
    startsAt: string;
    endsAt: string;
    breakMinutes: number;
    hourlyRateCents: number;
    positions: number;
  };
}

export function NewShiftForm({
  branches,
  templates,
  minRateCents = 1620,
  pools = [],
  beeld = { logoUrl: null, useLogo: false, canChange: false },
  edit,
}: {
  branches: { id: string; name: string; city: string }[];
  templates: ShiftTemplate[];
  minRateCents?: number;
  pools?: { id: string; name: string; memberCount: number }[];
  /** the organisation's logo and whether its klussen show it instead of the branch photo */
  beeld?: { logoUrl: string | null; useLogo: boolean; canChange: boolean };
  /** set: edit this klus instead of placing a new one */
  edit?: ShiftEdit;
}) {
  const router = useRouter();
  const { locale, t: dict } = useI18n();
  const n = dict.newShiftForm;
  const loc = locale === "nl" ? "nl-NL" : "en-GB";
  const komma = (s: string) => (locale === "nl" ? s.replace(".", ",") : s);
  const WD = n.weekdagen.split(",");
  const init = edit?.initial;
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const minRateEuro = minRateCents / 100;
  const [state, formAction] = useFormState(createShiftAction, initial);
  const [useLogo, setUseLogo] = useState(beeld.useLogo && Boolean(beeld.logoUrl));
  const [beeldBezig, setBeeldBezig] = useState(false);
  const [beeldFout, setBeeldFout] = useState<string | null>(null);
  const galerij = useMemo(
    () => templates.map((t) => ({ key: t.key, label: t.label, rateCents: Math.max(t.hourlyRateCents, minRateCents), branche: t.branche })),
    [templates, minRateCents],
  );
  const [tpl, setTpl] = useState("");
  const [title, setTitle] = useState(init?.title ?? "");
  const [description, setDescription] = useState(init?.description ?? "");
  const [dresscode, setDresscode] = useState(init?.dresscode ?? "");
  // het veld voor extra informatie is weg (10 nov, eigenaar: nergens meer bij de klus); een bestaande waarde blijft bij bewerken bewaard
  const [extraInfo] = useState(init?.extraInfo ?? "");
  const [writing, setWriting] = useState(false);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [forecast, setForecast] = useState<{
    marketRateCents: number;
    fillChance: number;
    suggestedRateCents: number;
    suggestedFillChance: number;
    reasons: string[];
    sample: number;
  } | null>(null);
  const [rateEuro, setRateEuro] = useState(((init?.hourlyRateCents ?? minRateCents) / 100).toFixed(2));
  const [breakMin, setBreakMin] = useState(String(init?.breakMinutes ?? 30));
  const [positions, setPositions] = useState(String(init?.positions ?? 1));
  const [startsAt, setStartsAt] = useState(init?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(init?.endsAt ?? "");
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [poolId, setPoolId] = useState("");
  const [oneOff, setOneOff] = useState(false);
  const [adHocAddress, setAdHocAddress] = useState<PickedAddress | null>(null);
  const [adHocPostalCode, setAdHocPostalCode] = useState("");
  const [adHocCity, setAdHocCity] = useState("");
  const [ownTemplates, setOwnTemplates] = useState<OwnTemplate[]>([]);
  const [fromWebsite, setFromWebsite] = useState(false);

  // A klus drafted on /klus-plaatsen before sign-up: fill it in once, then forget it.
  // Never over an existing klus that is being edited.
  const editing = Boolean(edit);
  useEffect(() => {
    if (editing) return;
    let on = true;
    const vulIn = (raw: string | null) => {
      const concept = parseConcept(raw, Date.now(), amsterdamDayKey(new Date()));
      if (!concept || !on) return false;
      const v = toShiftFormValues(concept);
      setTitle(v.title);
      setDescription(v.description);
      setRateEuro(v.rateEuro);
      setBreakMin(v.breakMin);
      setPositions(v.positions);
      setStartsAt(v.startsAt);
      setEndsAt(v.endsAt);
      setFromWebsite(true);
      return true;
    };
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(CONCEPT_KEY);
      if (raw) localStorage.removeItem(CONCEPT_KEY);
    } catch {
      /* opslag geblokkeerd: dan alleen de server */
    }
    if (vulIn(raw)) return;
    // Niets in deze browser: het concept dat bij het aanmelden is meegegeven (bevestigingsmail op een ander
    // apparaat geopend). De server wist het zodra de klus is geplaatst (createShiftAction).
    fetch("/api/werkgever/klus-concept", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { concept?: unknown } | null) => {
        if (data?.concept) vulIn(JSON.stringify(data.concept));
      })
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [editing]);

  useEffect(() => {
    fetch("/api/werkgever/templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setOwnTemplates(d.templates ?? []))
      .catch(() => undefined);
  }, []);

  // live tarief-advies / vervullingskans (debounced) zodra titel, tijd en tarief er zijn
  useEffect(() => {
    const rateCents = Math.round(parseFloat(rateEuro.replace(",", ".")) * 100);
    if (title.trim().length < 2 || !startsAt || !Number.isFinite(rateCents) || rateCents <= 0) {
      setForecast(null);
      return;
    }
    const id = setTimeout(() => {
      fetch("/api/werkgever/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, startsAt, rateCents }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setForecast(d))
        .catch(() => undefined);
    }, 600);
    return () => clearTimeout(id);
  }, [title, startsAt, rateEuro]);

  function applyTemplate(t: ShiftTemplate) {
    setTpl(t.key);
    setTitle(t.label);
    setDescription(t.description);
    setDresscode(t.dresscode ?? "");
    setRateEuro((Math.max(t.hourlyRateCents, minRateCents) / 100).toFixed(2));
    setBreakMin(String(t.breakMinutes));
  }

  // company-wide choice (all its klussen), saved at once; the server's answer is what we show
  async function kiesBeeld(logo: boolean) {
    setBeeldBezig(true);
    setBeeldFout(null);
    const res = await fetch("/api/werkgever/klus-beeld", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beeld: logo ? "logo" : "foto" }),
    }).catch(() => null);
    setBeeldBezig(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setBeeldFout(d?.error?.message ?? n.opslaanMislukt);
      return;
    }
    setUseLogo(((await res.json()) as { useLogo: boolean }).useLogo);
  }

  // edit mode: the same checks as the old edit window (updateShiftAction: overlap with booked people,
  // chat message + push to them); afterwards back to the klus with the server's version
  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit) return;
    setEditBusy(true);
    setEditError(null);
    const res = await updateShiftAction(edit.shiftId, {
      title,
      description,
      dresscode,
      extraInfo,
      startsAt,
      endsAt,
      breakMinutes: Number(breakMin) || 0,
      hourlyRateCents,
      positions: Number(positions) || 1,
    }).catch(() => ({ ok: false, message: n.opslaanMislukt }));
    setEditBusy(false);
    if (!res.ok) {
      setEditError(res.message);
      return;
    }
    router.push(`/werkgever/diensten/${edit.shiftId}`);
    router.refresh();
  }

  function applyOwnTemplate(t: OwnTemplate) {
    setTpl("");
    setTitle(t.label);
    setDescription(t.description ?? "");
    setDresscode(t.dresscode ?? "");
    setRateEuro((t.hourlyRateCents / 100).toFixed(2));
    setBreakMin(String(t.breakMinutes));
  }

  const hourlyRateCents = Math.round(parseFloat(rateEuro || "0") * 100);
  const cat = useMemo(() => shiftCategory(title || "Dienst", null), [title]);

  const hours = useMemo(() => {
    if (!startsAt || !endsAt) return 0;
    const h = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000 - Number(breakMin) / 60;
    return Math.max(0, Math.round(h * 10) / 10);
  }, [startsAt, endsAt, breakMin]);
  const grossPerSeat = Math.round(hours * hourlyRateCents);
  const totalDays = 1 + extraDates.length;

  function toggleDate(iso: string) {
    setExtraDates((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort()));
  }

  // next 21 days grid (excluding the primary start date), on the calendar date of the field
  const primaryDay = startsAt ? startsAt.slice(0, 10) : "";
  const dayOptions = useMemo(() => extraDayOptions(startsAt ? startsAt.slice(0, 10) : amsterdamDayKey(new Date())), [startsAt]);

  // de waarde van een datetime-local is al de tijd in Nederland ("2026-11-05T09:00"): laat hem zo zien, in welke zone de browser ook staat
  const tijdTekst = (v: string) => new Date(`${v}Z`).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  const plek = edit ? edit.locatie : oneOff ? adHocAddress?.label ?? n.eenmaligeLocatie : branches[0]?.name ?? n.vestigingNaam;

  return (
    // grid-cols-1 + minmax(0,…): anders wordt de kolom zo breed als de rij branche-knoppen van de galerij (4 nov: pagina 2552px breed)
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <form {...(edit ? { onSubmit: saveEdit } : { action: formAction })} className="min-w-0 space-y-7">
        {(editError ?? state.error) && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{editError ?? state.error}</p>}
        {edit && edit.assignedCount > 0 && (
          <p role="status" className="rounded-lg bg-warn/10 px-3 py-2.5 text-sm text-neutralx-700">
            {edit.assignedCount === 1 ? n.ingeplandEen : fmt(n.ingeplandMeer, { n: edit.assignedCount })} {n.ingeplandNa}
          </p>
        )}
        {fromWebsite && (
          <p role="status" className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
            {n.vanWebsite}
          </p>
        )}

        <SjabloonGalerij
          sjablonen={galerij}
          gekozen={tpl}
          onKies={(key) => {
            const t = templates.find((x) => x.key === key);
            if (t) applyTemplate(t);
          }}
        />

        {ownTemplates.length > 0 && (
          <div>
            <p className="field-label mb-2">
              {n.eigenTemplates} <span className="text-neutralx-400">{n.eigenTemplatesHint}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {ownTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyOwnTemplate(t)}
                  className="rounded-full border border-hairstrong px-3 py-1.5 text-xs font-medium text-neutralx-600 transition hover:border-brand-500"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <input type="hidden" name="templateKey" value={tpl} />
        <input type="hidden" name="hourlyRateCents" value={Number.isFinite(hourlyRateCents) ? hourlyRateCents : 0} />
        <input type="hidden" name="extraDates" value={extraDates.join(",")} />

        {edit ? (
          <div>
            <p className="field-label">{n.locatie}</p>
            <p className="rounded-xl border border-hair bg-paper-soft px-3 py-2.5 text-sm text-ink">{edit.locatie}</p>
            <p className="mt-1 text-xs text-neutralx-500">{n.locatieVast}</p>
          </div>
        ) : (
        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-neutralx-500">
            <input
              type="checkbox"
              checked={oneOff}
              onChange={(e) => setOneOff(e.target.checked)}
              className="accent-brand-500"
            />
            {n.eenmaligLabel}
          </label>

          {!oneOff ? (
            <label className="mt-2 block">
              <span className="field-label">{n.vestiging}</span>
              <select name="branchId" required className="field-input">
                {branches.length === 0 && <option value="">{n.geenVestiging}</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.city}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutralx-400">
                {n.vestigingenBeheer}{" "}
                <Link href="/werkgever/locaties" className="font-medium text-brand-600 hover:underline">
                  /werkgever/locaties
                </Link>
                .
              </span>
            </label>
          ) : (
            <div className="mt-2 space-y-3">
              <label className="block">
                <span className="field-label">{n.adres}</span>
                <AddressAutocomplete value={adHocAddress} onPick={setAdHocAddress} placeholder={n.zoekAdres} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">{n.postcode}</span>
                  <input
                    value={adHocPostalCode}
                    onChange={(e) => setAdHocPostalCode(e.target.value)}
                    className="field-input"
                  />
                </label>
                <label className="block">
                  <span className="field-label">{n.plaats}</span>
                  <input value={adHocCity} onChange={(e) => setAdHocCity(e.target.value)} className="field-input" />
                </label>
              </div>
              <input type="hidden" name="adHocLabel" value={adHocAddress?.label ?? ""} />
              <input type="hidden" name="adHocPostalCode" value={adHocPostalCode} />
              <input type="hidden" name="adHocCity" value={adHocCity} />
              <input type="hidden" name="adHocLatitude" value={adHocAddress?.lat ?? ""} />
              <input type="hidden" name="adHocLongitude" value={adHocAddress?.lng ?? ""} />
            </div>
          )}
        </div>
        )}

        <label className="block">
          <span className="field-label">{n.titel}</span>
          <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={n.titelPlaceholder} className="field-input" />
        </label>

        <div>
          <div className="flex items-end justify-between gap-2">
            <label htmlFor="shift-description" className="field-label">
              {n.omschrijving} <span className="text-neutralx-400">{n.optioneel}</span>
            </label>
            <button
              type="button"
              disabled={writing || title.trim().length < 3}
              title={title.trim().length < 3 ? n.eerstTitel : undefined}
              onClick={async (e) => {
                const fd = new FormData(e.currentTarget.form ?? undefined);
                setWriting(true);
                setWriteNote(null);
                try {
                  const r = await fetch("/api/werkgever/ai/shift-text", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title,
                      description,
                      dresscode,
                      branchId: oneOff ? undefined : String(fd.get("branchId") ?? "") || undefined,
                      city: oneOff ? adHocCity || undefined : undefined,
                      startsAt: startsAt || undefined,
                      endsAt: endsAt || undefined,
                      breakMinutes: Number(breakMin) || 0,
                      viaUitzendbureau: fd.get("viaUitzendbureau") === "on",
                    }),
                  });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d?.error?.message ?? d?.message ?? n.schrijvenMislukt);
                  setDescription(d.description);
                  if (!dresscode.trim()) setDresscode(d.dresscode);
                  setWriteNote(d.mode === "model" ? n.doorAi : n.conceptTitel);
                } catch (err) {
                  setWriteNote((err as Error).message);
                } finally {
                  setWriting(false);
                }
              }}
              className="mb-1 rounded-full border border-hair bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              {writing ? n.schrijven : description.trim() ? n.verbeter : n.schrijfVoorMij}
            </button>
          </div>
          <textarea id="shift-description" name="description" rows={description.length > 160 ? 7 : 3} value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" />
          {writeNote && <p className="mt-1 text-xs text-neutralx-500">{writeNote}</p>}
        </div>

        <label className="block">
          <span className="field-label">
            {n.kleding} <span className="text-neutralx-400">{n.optioneel}</span>
          </span>
          <textarea
            name="dresscode"
            rows={2}
            value={dresscode}
            onChange={(e) => setDresscode(e.target.value)}
            placeholder={n.kledingPlaceholder}
            className="field-input"
          />
        </label>


        {!edit && (
        <label className="flex items-start gap-3 rounded-xl border border-hairstrong bg-paper-soft px-4 py-3">
          <input type="checkbox" name="viaUitzendbureau" value="on" className="mt-0.5 h-4 w-4 accent-brand-500" />
          <span>
            <span className="block text-sm font-semibold text-ink">{n.uitzendbureau}</span>
            <span className="block text-xs text-neutralx-500">
              {n.uitzendbureauUitleg}
            </span>
          </span>
        </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">{n.start}</span>
            <input type="datetime-local" name="startsAt" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">{n.einde}</span>
            <input type="datetime-local" name="endsAt" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">{n.pauze}</span>
            <input type="number" name="breakMinutes" min={0} max={240} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">{n.plekken}</span>
            <input type="number" name="positions" min={1} max={50} value={positions} onChange={(e) => setPositions(e.target.value)} className="field-input" />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">{n.uurtarief}</span>
            <input
              type="number"
              step="0.10"
              min={minRateEuro.toFixed(2)}
              value={rateEuro}
              onChange={(e) => setRateEuro(e.target.value)}
              onBlur={(e) => {
                const v = parseFloat(e.target.value.replace(",", "."));
                if (Number.isFinite(v) && v < minRateEuro) setRateEuro(minRateEuro.toFixed(2));
              }}
              className="field-input"
            />
            <span className="mt-1 block text-xs text-neutralx-400">
              {fmt(n.minimumTekst, { min: komma(minRateEuro.toFixed(2)) })}
            </span>
            {hourlyRateCents > 0 && hourlyRateCents < minRateCents && (
              <span className="mt-1 block text-xs font-medium text-crit">
                {fmt(n.minimumFout, { min: komma(minRateEuro.toFixed(2)) })}
              </span>
            )}
          </label>
          {forecast && forecast.sample >= 8 && hourlyRateCents > 0 && (
            <FairPayMeter
              rateCents={hourlyRateCents}
              marketRateCents={forecast.marketRateCents}
              fillChance={forecast.fillChance}
              suggestedRateCents={forecast.suggestedRateCents}
              suggestedFillChance={forecast.suggestedFillChance}
              sample={forecast.sample}
              onApplySuggested={(cents) => setRateEuro((cents / 100).toFixed(2))}
            />
          )}
        </div>

        {/* multi-day (only when placing) */}
        {!edit && (
        <div className="rounded-xl border border-hair bg-paper-soft/50 p-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="accent-brand-500" />
            {n.meerdereDagen}
          </label>
          {multi && (
            <>
              <p className="mt-2 text-xs text-neutralx-500">
                {startsAt ? n.kiesDagen : n.eerstStart}
              </p>
              {startsAt && (
                <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {dayOptions.map((iso) => {
                    const dt = new Date(iso + "T12:00:00");
                    const on = extraDates.includes(iso);
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => toggleDate(iso)}
                        className={`rounded-lg border px-2 py-1.5 text-center text-[11px] transition ${
                          on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong hover:border-brand-300"
                        }`}
                      >
                        <span className="block font-semibold">{WD[dt.getDay()]}</span>
                        <span className="opacity-70">{iso.slice(5)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        )}

        {!edit && pools.length > 0 && (
          <label className="block">
            <span className="field-label">
              {n.poolKop} <span className="text-neutralx-400">{n.optioneel}</span>
            </span>
            <select name="poolId" value={poolId} onChange={(e) => setPoolId(e.target.value)} className="field-input">
              <option value="">{n.poolOpen}</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {fmt(p.memberCount === 1 ? n.poolLid : n.poolLeden, { naam: p.name, n: p.memberCount })}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-neutralx-400">
              {n.poolUitleg}
            </span>
          </label>
        )}

        {edit ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" disabled={editBusy || hourlyRateCents < minRateCents} className="btn-primary flex-1 disabled:opacity-50">
              {editBusy ? n.bezigOpslaan : n.wijzigingenOpslaan}
            </button>
            <Link href={`/werkgever/diensten/${edit.shiftId}`} className="btn-ghost text-center">
              {n.annuleren}
            </Link>
          </div>
        ) : (
          <Submit days={totalDays} blocked={hourlyRateCents < minRateCents} />
        )}
      </form>

      {/* live preview */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="field-label mb-2">{n.voorbeeld}</p>
        <article className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
          <div className="relative aspect-[16/9]">
            {useLogo && beeld.logoUrl ? (
              // fixed white: logos are made for a light background, also in dark mode
              <span className="flex h-full w-full items-center justify-center bg-[#ffffff] px-10 py-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={beeld.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
              </span>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cat.photo} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
              </>
            )}
            <span className="absolute left-3 top-3 rounded-full px-2 py-1 text-[11px] font-semibold text-white" style={{ background: `${cat.accent}cc` }}>
              {cat.label}
            </span>
            {totalDays > 1 && (
              <span className="absolute right-3 top-3 rounded-full bg-brand-500/90 px-2 py-1 text-[11px] font-bold text-white">
                {fmt(n.dagen, { n: totalDays })}
              </span>
            )}
            {!(useLogo && beeld.logoUrl) && (
              <div className="absolute inset-x-3 bottom-3 text-white">
                <p className="truncate font-display text-lg font-bold drop-shadow">{title || n.titelFallback}</p>
                <p className="truncate text-xs text-white/80">
                  {plek}
                  {startsAt ? ` · ${tijdTekst(startsAt)}` : ""}
                </p>
              </div>
            )}
          </div>
          {useLogo && beeld.logoUrl && (
            <div className="border-b border-hair px-4 pb-3 pt-3">
              <p className="truncate font-display text-lg font-bold text-ink">{title || n.titelFallback}</p>
              <p className="truncate text-xs text-neutralx-500">
                {plek}
                {startsAt ? ` · ${tijdTekst(startsAt)}` : ""}
              </p>
            </div>
          )}
          <div className="space-y-2 p-4 text-sm">
            <Row k={n.rijTarief} v={fmt(n.perUur, { bedrag: komma((hourlyRateCents / 100).toFixed(2)) })} />
            <Row k={n.rijDuur} v={hours ? `${fmt(n.duurUren, { u: hours })}${Number(breakMin) ? fmt(n.duurPauze, { m: breakMin }) : ""}` : "—"} />
            <Row k={n.rijPlekken} v={fmt(n.plekkenPerDag, { n: positions })} />
            <Row k={n.rijBruto} v={grossPerSeat ? `€ ${(grossPerSeat / 100).toFixed(0)}` : "—"} highlight />
            <Row k={n.rijPlatform} v={hours ? fmt(n.platformWaarde, { bedrag: komma((Number(hours) * 3.5).toFixed(2)) }) : "—"} />
            {totalDays > 1 && (
              <Row k={fmt(n.rijTotaal, { n: totalDays })} v={`€ ${((grossPerSeat * totalDays) / 100).toFixed(0)}`} highlight />
            )}
          </div>
        </article>
        {primaryDay && !edit && <p className="mt-2 text-[11px] text-neutralx-500">{n.gematcht}</p>}

        <fieldset className="mt-4 min-w-0 rounded-xl border border-hair bg-white p-3">
          <legend className="px-1 text-xs font-semibold text-ink">{n.beeldKop}</legend>
          {beeld.logoUrl ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <BeeldKeuze actief={!useLogo} disabled={beeldBezig || !beeld.canChange} onClick={() => void kiesBeeld(false)} label={n.beeldFoto}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cat.photo} alt="" className="h-full w-full object-cover" />
                </BeeldKeuze>
                <BeeldKeuze actief={useLogo} disabled={beeldBezig || !beeld.canChange} onClick={() => void kiesBeeld(true)} label={n.beeldLogo}>
                  <span className="flex h-full w-full items-center justify-center bg-[#ffffff] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={beeld.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                  </span>
                </BeeldKeuze>
              </div>
              <p className="mt-2 text-[11px] text-neutralx-500">
                {beeld.canChange ? n.beeldGeldt : n.beeldBeheerder}
              </p>
            </>
          ) : (
            <p className="text-xs text-neutralx-600">
              {n.beeldGeenLogo}{" "}
              <Link href="/werkgever/bedrijf" className="font-semibold text-brand-600 underline underline-offset-2">
                {n.beeldUpload}
              </Link>
              .
            </p>
          )}
          {beeldFout && (
            <p role="alert" className="mt-2 text-xs text-crit">
              {beeldFout}
            </p>
          )}
        </fieldset>
      </div>
    </div>
  );
}

function BeeldKeuze({ actief, disabled, onClick, label, children }: { actief: boolean; disabled: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={actief}
      disabled={disabled}
      onClick={onClick}
      className={`overflow-hidden rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${actief ? "border-brand-500 ring-2 ring-brand-500" : "border-hair hover:border-hairstrong"}`}
    >
      <span className="block aspect-[16/9] overflow-hidden">{children}</span>
      <span className="block px-2 py-1.5 text-xs font-semibold text-ink">{label}</span>
    </button>
  );
}

function Row({ k, v, highlight = false }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-neutralx-500">{k}</span>
      <span className={`num text-sm ${highlight ? "font-semibold text-brand-600" : "text-ink-soft"}`}>{v}</span>
    </div>
  );
}
