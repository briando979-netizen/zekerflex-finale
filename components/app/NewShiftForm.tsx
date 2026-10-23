"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { createShiftAction, type NewShiftState } from "@/app/werkgever/diensten/nieuw/actions";
import type { ShiftTemplate } from "@/lib/shifts/create";
import { shiftCategory } from "@/lib/shifts/category";
import { AddressAutocomplete, type PickedAddress } from "@/components/app/AddressAutocomplete";

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
  return (
    <button type="submit" disabled={pending || blocked} className="btn-primary w-full disabled:opacity-50">
      {pending
        ? "Bezig met uitzetten…"
        : days > 1
          ? `Zet ${days} diensten uit & match`
          : "Dienst uitzetten & matchen"}
    </button>
  );
}

const WD = ["zo", "ma", "di", "wo", "do", "vr", "za"];

export function NewShiftForm({
  branches,
  templates,
  minRateCents = 1620,
  pools = [],
}: {
  branches: { id: string; name: string; city: string }[];
  templates: ShiftTemplate[];
  minRateCents?: number;
  pools?: { id: string; name: string; memberCount: number }[];
}) {
  const minRateEuro = minRateCents / 100;
  const [state, formAction] = useFormState(createShiftAction, initial);
  const [tpl, setTpl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dresscode, setDresscode] = useState("");
  const [writing, setWriting] = useState(false);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [forecast, setForecast] = useState<{ fillChance: number; suggestedRateCents: number; reasons: string[]; sample: number } | null>(null);
  const [rateEuro, setRateEuro] = useState(minRateEuro.toFixed(2));
  const [breakMin, setBreakMin] = useState("30");
  const [positions, setPositions] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [poolId, setPoolId] = useState("");
  const [oneOff, setOneOff] = useState(false);
  const [adHocAddress, setAdHocAddress] = useState<PickedAddress | null>(null);
  const [adHocPostalCode, setAdHocPostalCode] = useState("");
  const [adHocCity, setAdHocCity] = useState("");
  const [ownTemplates, setOwnTemplates] = useState<OwnTemplate[]>([]);

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
    setRateEuro((t.hourlyRateCents / 100).toFixed(2));
    setBreakMin(String(t.breakMinutes));
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

  // next 21 days grid (excluding the primary start date)
  const primaryDay = startsAt ? startsAt.slice(0, 10) : "";
  const dayOptions = useMemo(() => {
    const base = startsAt ? new Date(startsAt) : new Date();
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i + 1);
      return d.toISOString().slice(0, 10);
    });
  }, [startsAt]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <form action={formAction} className="space-y-7">
        {state.error && <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{state.error}</p>}

        <div>
          <p className="field-label mb-2">Kies een sjabloon (optioneel)</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTemplate(t)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  tpl === t.key ? "border-brand-500 bg-brand-50 text-brand-600" : "border-hairstrong text-neutralx-600 hover:border-brand-500"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {ownTemplates.length > 0 && (
          <div>
            <p className="field-label mb-2">
              Jouw templates <span className="text-neutralx-400">(beheer je op /werkgever/templates)</span>
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

        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-neutralx-500">
            <input
              type="checkbox"
              checked={oneOff}
              onChange={(e) => setOneOff(e.target.checked)}
              className="accent-brand-500"
            />
            Eenmalige locatie (bijv. een demo op afstand) — geen vaste vestiging
          </label>

          {!oneOff ? (
            <label className="mt-2 block">
              <span className="field-label">Vestiging</span>
              <select name="branchId" required className="field-input">
                {branches.length === 0 && <option value="">Geen vestiging beschikbaar</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.city}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutralx-400">
                Vestigingen beheer je op{" "}
                <Link href="/werkgever/locaties" className="font-medium text-brand-600 hover:underline">
                  /werkgever/locaties
                </Link>
                .
              </span>
            </label>
          ) : (
            <div className="mt-2 space-y-3">
              <label className="block">
                <span className="field-label">Adres</span>
                <AddressAutocomplete value={adHocAddress} onPick={setAdHocAddress} placeholder="Zoek adres…" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">Postcode</span>
                  <input
                    value={adHocPostalCode}
                    onChange={(e) => setAdHocPostalCode(e.target.value)}
                    className="field-input"
                  />
                </label>
                <label className="block">
                  <span className="field-label">Plaats</span>
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

        <label className="block">
          <span className="field-label">Titel van de dienst</span>
          <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Vakkenvuller avonddienst" className="field-input" />
        </label>

        <div>
          <div className="flex items-end justify-between gap-2">
            <label htmlFor="shift-description" className="field-label">
              Omschrijving <span className="text-neutralx-400">(optioneel)</span>
            </label>
            <button
              type="button"
              disabled={writing || title.trim().length < 3}
              title={title.trim().length < 3 ? "Vul eerst een titel in" : undefined}
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
                  if (!r.ok) throw new Error(d?.error?.message ?? d?.message ?? "Schrijven mislukt");
                  setDescription(d.description);
                  if (!dresscode.trim()) setDresscode(d.dresscode);
                  setWriteNote(d.mode === "model" ? "Geschreven door de AI — pas aan waar nodig." : "Concept op basis van je titel — pas aan waar nodig.");
                } catch (err) {
                  setWriteNote((err as Error).message);
                } finally {
                  setWriting(false);
                }
              }}
              className="mb-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              {writing ? "Schrijven…" : description.trim() ? "✨ Verbeter tekst" : "✨ Schrijf voor mij"}
            </button>
          </div>
          <textarea id="shift-description" name="description" rows={description.length > 160 ? 7 : 3} value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" />
          {writeNote && <p className="mt-1 text-xs text-neutralx-500">{writeNote}</p>}
        </div>

        <label className="block">
          <span className="field-label">
            Kledingvoorschriften <span className="text-neutralx-400">(optioneel)</span>
          </span>
          <textarea
            name="dresscode"
            rows={2}
            value={dresscode}
            onChange={(e) => setDresscode(e.target.value)}
            placeholder="Bijv. veiligheidsschoenen verplicht, geen sieraden, bedrijfskleding wordt verstrekt…"
            className="field-input"
          />
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-hairstrong bg-paper-soft px-4 py-3">
          <input type="checkbox" name="viaUitzendbureau" value="on" className="mt-0.5 h-4 w-4 accent-brand-500" />
          <span>
            <span className="block text-sm font-semibold text-ink">Via het ZekerFlex-uitzendbureau</span>
            <span className="block text-xs text-neutralx-500">
              Alleen uitzendkrachten (loon via ZekerFlex) kunnen hierop reageren — zzp&apos;ers en flexwerkers zien de
              klus wel staan, maar kunnen er niet op reageren.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Start</span>
            <input type="datetime-local" name="startsAt" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Einde</span>
            <input type="datetime-local" name="endsAt" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Pauze (minuten)</span>
            <input type="number" name="breakMinutes" min={0} max={240} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Aantal plekken</span>
            <input type="number" name="positions" min={1} max={50} value={positions} onChange={(e) => setPositions(e.target.value)} className="field-input" />
          </label>
          <label className="block sm:col-span-2">
            <span className="field-label">Uurtarief (€ bruto)</span>
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
              Minimum € {minRateEuro.toFixed(2).replace(".", ",")} per uur. ZekerFlex rekent daarnaast
              € 3,50 platformkosten per gewerkt uur — dat komt hierbovenop.
            </span>
            {hourlyRateCents > 0 && hourlyRateCents < minRateCents && (
              <span className="mt-1 block text-xs font-medium text-crit">
                Het uurtarief moet minimaal € {minRateEuro.toFixed(2).replace(".", ",")} zijn.
              </span>
            )}
          </label>
          {forecast && forecast.sample >= 15 && (
            <div className="rounded-xl border border-hair bg-paper-soft px-4 py-3 text-xs sm:col-span-2">
              <p className="font-semibold text-ink">
                📊 Vervullingskans: <span className={forecast.fillChance >= 0.8 ? "text-brand-700" : forecast.fillChance >= 0.5 ? "text-warn" : "text-crit"}>{Math.round(forecast.fillChance * 100)}%</span>
              </p>
              <ul className="mt-1 space-y-0.5 text-neutralx-600">
                {forecast.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {forecast.suggestedRateCents > hourlyRateCents && (
                <button type="button" onClick={() => setRateEuro((forecast.suggestedRateCents / 100).toFixed(2))} className="mt-1.5 font-semibold text-brand-700 hover:underline">
                  Zet tarief op € {(forecast.suggestedRateCents / 100).toFixed(2).replace(".", ",")} →
                </button>
              )}
            </div>
          )}
        </div>

        {/* multi-day */}
        <div className="rounded-xl border border-hair bg-paper-soft/50 p-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="accent-brand-500" />
            Meerdere dagen (zelfde tijd)
          </label>
          {multi && (
            <>
              <p className="mt-2 text-xs text-neutralx-500">
                {startsAt ? "Kies extra dagen — de kracht kan zich per dag of voor alles aanmelden." : "Vul eerst een starttijd in."}
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

        {pools.length > 0 && (
          <label className="block">
            <span className="field-label">
              Eerst privé uitnodigen <span className="text-neutralx-400">(optioneel)</span>
            </span>
            <select name="poolId" value={poolId} onChange={(e) => setPoolId(e.target.value)} className="field-input">
              <option value="">Direct op de open markt</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.memberCount} {p.memberCount === 1 ? "lid" : "leden"})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-neutralx-400">
              Alleen deze pool ziet en kan reageren op de dienst. Je zet &apos;m later zelf op de open markt — dat
              gebeurt niet automatisch.
            </span>
          </label>
        )}

        <Submit days={totalDays} blocked={hourlyRateCents < minRateCents} />
      </form>

      {/* live preview */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <p className="field-label mb-2">Voorbeeld</p>
        <article className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
          <div className="relative aspect-[16/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cat.photo} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
            <span className="absolute left-3 top-3 rounded-full px-2 py-1 text-[11px] font-semibold text-white" style={{ background: `${cat.accent}cc` }}>
              {cat.label}
            </span>
            {totalDays > 1 && (
              <span className="absolute right-3 top-3 rounded-full bg-brand-500/90 px-2 py-1 text-[11px] font-bold text-white">
                {totalDays} dagen
              </span>
            )}
            <div className="absolute inset-x-3 bottom-3 text-white">
              <p className="truncate font-display text-lg font-bold drop-shadow">{title || "Titel van de dienst"}</p>
              <p className="truncate text-xs text-white/80">
                {oneOff ? adHocAddress?.label ?? "Eenmalige locatie" : branches[0]?.name ?? "Vestiging"}
                {startsAt ? ` · ${new Date(startsAt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
              </p>
            </div>
          </div>
          <div className="space-y-2 p-4 text-sm">
            <Row k="Uurtarief" v={`€ ${(hourlyRateCents / 100).toFixed(2)}/u`} />
            <Row k="Duur" v={hours ? `${hours} u${Number(breakMin) ? ` · ${breakMin}m pauze` : ""}` : "—"} />
            <Row k="Plekken" v={`${positions} per dag`} />
            <Row k="Bruto per plek" v={grossPerSeat ? `€ ${(grossPerSeat / 100).toFixed(0)}` : "—"} highlight />
            <Row k="Platformkosten" v={hours ? `€ ${(Number(hours) * 3.5).toFixed(2)} (€ 3,50/u)` : "—"} />
            {totalDays > 1 && (
              <Row k={`Totaal (${totalDays} dagen)`} v={`€ ${((grossPerSeat * totalDays) / 100).toFixed(0)}`} highlight />
            )}
          </div>
        </article>
        {primaryDay && <p className="mt-2 text-[11px] text-neutralx-400">Wordt automatisch gematcht zodra je uitzet.</p>}
      </div>
    </div>
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
