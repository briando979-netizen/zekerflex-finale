"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * No-show prevention controls for an upcoming assignment:
 *  - "Bevestig dat je komt" (one tap → storage/prefs)
 *  - "Kan niet? Regel een vervanger" (→ storage/replacements + ops mail)
 */
export function ShiftConfirm({
  assignmentId,
  confirmedAt,
  replacementRequested,
}: {
  assignmentId: string;
  confirmedAt: string | null;
  replacementRequested: boolean;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirmed, setConfirmed] = useState(Boolean(confirmedAt));
  const [reqDone, setReqDone] = useState(replacementRequested);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  if (reqDone) {
    return <span className="pill-warn">Vervanger aangevraagd</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {confirmed ? (
        <span className="pill-ok">✓ Bevestigd</span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await fetch("/api/me/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignmentId }),
              });
              if (res.ok) {
                setConfirmed(true);
                toast.success("Bedankt — je komst is bevestigd");
              } else {
                toast.error("Bevestigen mislukt");
              }
            })
          }
          className="btn-primary px-3 py-1.5 text-xs"
        >
          Bevestig dat je komt
        </button>
      )}

      {!showNote ? (
        <button type="button" onClick={() => setShowNote(true)} className="text-xs text-neutralx-400 hover:text-crit">
          Kan niet? Regel een vervanger
        </button>
      ) : (
        <div className="w-56 rounded-lg border border-hair bg-white p-2 text-left shadow-card">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Korte toelichting (optioneel)"
            className="w-full rounded border border-hairstrong px-2 py-1 text-xs outline-none"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowNote(false)} className="text-xs text-neutralx-400">
              annuleer
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await fetch("/api/me/replacement", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assignmentId, note: note || undefined }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setReqDone(true);
                    toast.success("Vervanger aangevraagd", "We zoeken iemand en houden je op de hoogte.");
                  } else {
                    toast.error(data?.error?.message ?? "Aanvraag mislukt");
                  }
                })
              }
              className="btn-primary px-2.5 py-1 text-xs"
            >
              Aanvragen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
