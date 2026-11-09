"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

// Goedkeuren of afwijzen van een document "recht om te werken" (lib/werkrecht).
// Afwijzen vraagt een reden: die ziet de werker bij Verificatie en in de push.
export function WerkrechtActions({ userId, wrId }: { userId: string; wrId: string }) {
  const router = useRouter();
  const redenId = useId();
  const [bezig, setBezig] = useState(false);
  const [afwijzen, setAfwijzen] = useState(false);
  const [reden, setReden] = useState("");
  const [fout, setFout] = useState<string | null>(null);

  async function besluit(decision: "approve" | "reject") {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch(`/api/admin/gebruikers/${userId}/werkrecht/${wrId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision === "reject" ? { decision, note: reden.trim() } : { decision }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setFout(data.error?.message ?? "Dat lukte niet.");
        return;
      }
      router.refresh();
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!afwijzen ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => void besluit("approve")} disabled={bezig} className="btn-ghost text-xs text-ok disabled:opacity-50">
            Goedkeuren
          </button>
          <button type="button" onClick={() => setAfwijzen(true)} disabled={bezig} className="btn-ghost text-xs text-crit disabled:opacity-50">
            Afwijzen
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-1.5">
          <label htmlFor={redenId} className="text-xs" style={{ color: "var(--a-mute)" }}>
            Reden (de werker ziet die)
          </label>
          <input
            id={redenId}
            value={reden}
            onChange={(e) => setReden(e.target.value)}
            maxLength={300}
            placeholder="Bijv. foto onleesbaar, document verlopen"
            className="w-56 rounded-md px-2 py-1 text-xs"
            style={{ border: "1px solid var(--a-border)", background: "var(--a-panel-2)", color: "var(--a-text)" }}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setAfwijzen(false)} disabled={bezig} className="btn-ghost text-xs disabled:opacity-50">
              Terug
            </button>
            <button type="button" onClick={() => void besluit("reject")} disabled={bezig || !reden.trim()} className="btn-ghost text-xs text-crit disabled:opacity-50">
              Afwijzen
            </button>
          </div>
        </div>
      )}
      {fout && (
        <p role="alert" className="text-xs text-crit">
          {fout}
        </p>
      )}
    </div>
  );
}
