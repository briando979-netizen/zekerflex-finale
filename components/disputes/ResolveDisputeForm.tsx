"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";
import type { DisputeDto } from "@/types/disputes";
import {
  resolveDisputeAction,
  type ActionState,
} from "@/app/admin/disputes/actions";
import { formatHm, formatHours } from "./format";

const initialState: ActionState = { ok: false, message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
    >
      {pending ? "Bezig…" : label}
    </button>
  );
}

export function ResolveDisputeForm({ dispute }: { dispute: DisputeDto }) {
  const [state, formAction] = useFormState(resolveDisputeAction, initialState);
  const [decision, setDecision] = useState<"APPROVE_CLAIMED" | "OVERRULE">(
    "OVERRULE",
  );

  const gpsSuggestion =
    dispute.gps.measuredOnSiteMinutes !== null
      ? dispute.gps.measuredOnSiteMinutes
      : dispute.proposedMinutes;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="disputeId" value={dispute.id} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Beslissing</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="decision"
            value="APPROVE_CLAIMED"
            checked={decision === "APPROVE_CLAIMED"}
            onChange={() => setDecision("APPROVE_CLAIMED")}
            className="mt-1"
          />
          <span>
            Uren freelancer goedkeuren —{" "}
            <span className="font-medium">
              {formatHours(dispute.claimedMinutes)}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="decision"
            value="OVERRULE"
            checked={decision === "OVERRULE"}
            onChange={() => setDecision("OVERRULE")}
            className="mt-1"
          />
          <span>Overrule met gecorrigeerde uren</span>
        </label>
      </fieldset>

      {decision === "OVERRULE" && (
        <label className="block text-sm">
          <span className="text-slate-700">Gecorrigeerde minuten</span>
          <input
            type="number"
            name="resolvedMinutes"
            min={0}
            max={1440}
            defaultValue={gpsSuggestion}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            GPS-suggestie: {formatHm(gpsSuggestion)} · claim freelancer:{" "}
            {formatHm(dispute.claimedMinutes)}
          </span>
        </label>
      )}

      <label className="block text-sm">
        <span className="text-slate-700">Toelichting (verplicht)</span>
        <textarea
          name="note"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Onderbouwing van de beslissing, zichtbaar in de audit trail."
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="approveAfterResolve" value="true" />
        Direct goedkeuren, factureren en uitbetalen
      </label>

      <div className="flex items-center gap-3">
        <SubmitButton
          label={decision === "OVERRULE" ? "Overrule toepassen" : "Goedkeuren"}
        />
        {state.message && (
          <p
            className={`text-sm ${
              state.ok ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
