"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Portal } from "@/components/chat/Portal";
import { useToast } from "@/components/ui/Toast";

export function PickSubstituteButton({
  requestId,
  substituteUserId,
  name,
  disabled = false,
}: {
  requestId: string;
  substituteUserId: string;
  name: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/replacement/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, substituteUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Kiezen mislukt");
      toast.success(`${name} neemt de klus over`, "De dienst is overgedragen en van je lijst gehaald.");
      router.push("/dashboard/diensten");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirm(true)}
        className="btn-primary w-full px-3 py-2 text-sm disabled:opacity-50 sm:w-auto"
      >
        Kies als vervanger
      </button>
      {confirm && (
        <Portal>
          <div
            className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/40 p-4"
            onClick={() => !busy && setConfirm(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-lg font-bold text-ink">Klus overdragen aan {name}?</h2>
              <p className="mt-1 text-sm text-neutralx-600">
                {name} neemt deze dienst en de bijbehorende modelovereenkomst over. Jij bent er
                daarna niet meer verantwoordelijk voor. Dit kun je niet ongedaan maken.
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={pick} disabled={busy} className="btn-primary flex-1">
                  {busy ? "Overdragen…" : "Ja, overdragen"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm(false)}
                  disabled={busy}
                  className="btn-ghost"
                >
                  Annuleer
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
