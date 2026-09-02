"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createShiftAction, type NewShiftState } from "@/app/werkgever/diensten/nieuw/actions";
import type { ShiftTemplate } from "@/lib/shifts/create";
import { shiftCategory } from "@/lib/shifts/category";

const initial: NewShiftState = { error: null };

function Submit({ days }: { days: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
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
}: {
  branches: { id: string; name: string; city: string }[];
  templates: ShiftTemplate[];
}) {
  const [state, formAction] = useFormState(createShiftAction, initial);
  const [tpl, setTpl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rateEuro, setRateEuro] = useState("15.00");
  const [breakMin, setBreakMin] = useState("30");
  const [positions, setPositions] = useState("1");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);

  function applyTemplate(t: ShiftTemplate) {
    setTpl(t.key);
    setTitle(t.label);
    setDescription(t.description);
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

        <input type="hidden" name="templateKey" value={tpl} />
        <input type="hidden" name="hourlyRateCents" value={Number.isFinite(hourlyRateCents) ? hourlyRateCents : 0} />
        <input type="hidden" name="extraDates" value={extraDates.join(",")} />

        <label className="block">
          <span className="field-label">Vestiging</span>
          <select name="branchId" required className="field-input">
            {branches.length === 0 && <option value="">Geen vestiging beschikbaar</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} — {b.city}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="field-label">Titel van de dienst</span>
          <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Vakkenvuller avonddienst" className="field-input" />
        </label>

        <label className="block">
          <span className="field-label">
            Omschrijving <span className="text-neutralx-400">(optioneel)</span>
          </span>
          <textarea name="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" />
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
            <input type="number" step="0.50" min="5" value={rateEuro} onChange={(e) => setRateEuro(e.target.value)} className="field-input" />
            <span className="mt-1 block text-xs text-neutralx-400">ZekerFlex rekent € 3,50 platformkosten per gewerkt uur — dit komt hierbovenop.</span>
          </label>
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

        <Submit days={totalDays} />
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
                {branches[0]?.name ?? "Vestiging"}
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
