"use client";

import { useState, useTransition } from "react";
import { proposeHoursCorrectionAction } from "@/app/werkgever/uren/actions";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";

export function ProposeCorrectionButton({ timesheetId, submittedHours }: { timesheetId: string; submittedHours: number }) {
  const toast = useToast();
  const k = useT().urenKnoppen;
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(submittedHours);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) return <span className="text-xs text-neutralx-500">{k.voorstelVerstuurd}</span>;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-neutralx-500 underline hover:text-ink">
        {k.corrigeren}
      </button>
    );
  }

  return (
    <div className="w-full max-w-xs rounded-lg border border-hairstrong bg-white p-3 text-xs">
      <label className="block">
        <span className="mb-1 block font-medium text-ink">{k.voorgesteldeUren}</span>
        <input
          type="number"
          min={0}
          max={submittedHours}
          step={0.25}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="w-full rounded border border-hairstrong px-2 py-1"
        />
      </label>
      <label className="mt-2 block">
        <span className="mb-1 block font-medium text-ink">{k.toelichting}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder={k.toelichtingPlaceholder}
          className="w-full rounded border border-hairstrong px-2 py-1"
        />
      </label>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending || hours >= submittedHours || hours < 0 || note.trim().length < 3}
          onClick={() =>
            start(async () => {
              const r = await proposeHoursCorrectionAction(timesheetId, hours, note);
              if (r.ok) {
                setSent(true);
                toast.success(r.message);
              } else {
                toast.error(r.message);
              }
            })
          }
          className="btn-primary px-2.5 py-1 text-xs disabled:opacity-50"
        >
          {pending ? k.bezig : k.verstuurVoorstel}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-2.5 py-1 text-xs">
          {k.annuleren}
        </button>
      </div>
    </div>
  );
}
