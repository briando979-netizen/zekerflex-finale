"use client";

import { useState } from "react";
import Link from "next/link";
import { ReviewButton } from "@/components/app/ReviewButton";
import { PayoutChoice } from "@/components/app/PayoutChoice";

function localValue(date: Date | string) { return new Date(date).toISOString().slice(0, 16); }

type Speed = "instant" | "threeDay" | "standard";

export function TimesheetSubmitForm({ timesheetId, scheduledStart, scheduledEnd, breakMinutes, status, clientId, clientName, shiftId, payoutSpeed = "standard", payroll = false }: { timesheetId: string; scheduledStart: Date; scheduledEnd: Date; breakMinutes: number; status: string; clientId: string; clientName: string; shiftId?: string; payoutSpeed?: Speed; payroll?: boolean }) {
  const [start, setStart] = useState(localValue(scheduledStart));
  const [end, setEnd] = useState(localValue(scheduledEnd));
  const [breaks, setBreaks] = useState(String(breakMinutes));
  const [note, setNote] = useState("");
  const [extraOn, setExtraOn] = useState(false);
  const [extraAmount, setExtraAmount] = useState("");
  const [extraNote, setExtraNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(status !== "DRAFT");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    if (extraOn) {
      const cents = Math.round(Number(extraAmount.replace(",", ".")) * 100);
      if (!cents || cents <= 0) { setError("Vul een geldig bedrag in voor de extra kosten"); setBusy(false); return; }
      if (!extraNote.trim()) { setError("Beschrijf waar de extra kosten voor zijn"); setBusy(false); return; }
    }
    const extraCostsCents = extraOn ? Math.round(Number(extraAmount.replace(",", ".")) * 100) : undefined;
    try {
      const response = await fetch(`/api/timesheets/${timesheetId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actualStart: new Date(start).toISOString(), actualEnd: new Date(end).toISOString(), breakMinutes: Number(breaks), ...(note ? { note } : {}), ...(extraCostsCents ? { extraCostsCents, extraCostsNote: extraNote.trim() } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message ?? "Uren konden niet worden ingediend");
      setSubmitted(true);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  if (submitted) return <section className="surface p-5"><p className="eyebrow">Volgende stap</p><h2 className="mt-2 font-display text-xl font-bold">Uren ingediend</h2><p className="mt-2 text-sm leading-relaxed text-neutralx-600">{payroll ? "De opdrachtgever ontvangt je uren ter goedkeuring. Daarna worden ze verloond via de payroll." : "De opdrachtgever ontvangt je uren ter goedkeuring. Kies hieronder hoe snel je uitbetaald wilt worden."}</p>{payroll ? <div className="mt-5 rounded-xl border border-hair bg-paper-soft/60 p-4"><p className="text-sm font-semibold text-ink">Verloning via payroll — met voorschot</p><p className="mt-1 text-xs leading-relaxed text-neutralx-500">Je werkt als uitzendkracht. Zodra de opdrachtgever je uren goedkeurt, krijg je <strong>binnen 1 minuut een voorschot</strong> (circa de helft van je bruto) op je rekening. De rest volgt op je loonstrook van die week — met loonheffing, vakantiegeld en pensioenopbouw. Je hoeft geen uitbetaalsnelheid te kiezen.</p><Link href="/dashboard/verloning" className="mt-3 inline-block text-sm font-semibold text-brand-600 underline">Bekijk je loonstroken</Link></div> : <div className="mt-5"><PayoutChoice initialSpeed={payoutSpeed} /></div>}<div className="mt-6 rounded-xl border border-hair bg-paper-soft/60 p-4"><p className="text-sm font-semibold text-ink">Hoe was de samenwerking met {clientName}?</p><p className="mt-1 text-xs leading-relaxed text-neutralx-500">Je beoordeling helpt andere freelancers. Dit is het moment — daarna kun je geen review meer achterlaten voor deze klus.</p><div className="mt-3"><ReviewButton subjectType="company" subjectId={clientId} subjectName={clientName} {...(shiftId ? { shiftId } : {})} label={`Beoordeel ${clientName}`} /></div></div><div className="mt-6 space-y-2"><Link href="/dashboard/uitbetalingen" className="btn-ghost w-full">Meer over uitbetalen &amp; voorschot</Link><Link href="/dashboard/diensten" className="btn-primary w-full">Bekijk mijn diensten</Link></div></section>;

  return <form onSubmit={submit} className="surface p-5"><p className="eyebrow">Jouw registratie</p><h2 className="mt-2 font-display text-xl font-bold">Controleer je uren</h2><p className="mt-2 text-sm text-neutralx-600">Pas alleen aan wat afwijkt van de GPS-registratie. Pauze wordt automatisch afgetrokken.</p><div className="mt-5 space-y-4"><label className="field-label">Begintijd<input required type="datetime-local" className="field-input" value={start} onChange={(e) => setStart(e.target.value)} /></label><label className="field-label">Eindtijd<input required type="datetime-local" className="field-input" value={end} onChange={(e) => setEnd(e.target.value)} /></label><label className="field-label">Pauze in minuten<input required type="number" min="0" max="240" className="field-input" value={breaks} onChange={(e) => setBreaks(e.target.value)} /></label><label className="field-label">Notitie voor opdrachtgever <span className="font-normal text-neutralx-400">(optioneel)<textarea className="field-input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bijvoorbeeld: 10 minuten extra pauze door..." /></span></label><div className="rounded-xl border border-hair bg-paper-soft/60 p-4"><label className="flex items-start gap-3"><input type="checkbox" checked={extraOn} onChange={(e) => setExtraOn(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" /><span><span className="text-sm font-semibold text-ink">Extra kosten factureren</span><span className="mt-1 block text-xs leading-relaxed text-neutralx-500">Heb je bij deze klus extra kosten gemaakt (materiaal, reiskosten)? Factureer die hier mee — alleen als je dit vooraf met {clientName} hebt afgestemd. Vul het bedrag in inclusief btw.</span></span></label>{extraOn && <div className="mt-3 space-y-3 pl-7"><label className="field-label">Bedrag incl. btw<input required type="number" min="0.01" step="0.01" className="field-input" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} placeholder="0,00" /></label><label className="field-label">Waar zijn deze kosten voor?<textarea required className="field-input" rows={2} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="Bijvoorbeeld: parkeerkosten, materiaal ter plekke" maxLength={300} /></label></div>}</div>{error && <p className="text-sm text-crit">{error}</p>}<button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "Indienen…" : "Uren indienen"}</button><p className="text-center text-xs text-neutralx-400">{payroll ? `Na goedkeuring bij ${clientName} komen je uren op je loonstrook.` : `Na goedkeuring bij ${clientName} kies je je uitbetalingssnelheid.`}</p></div></form>;
}
