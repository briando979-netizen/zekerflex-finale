"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Beheer → Verkopers: een product goedkeuren of afwijzen (met reden voor de
// verkoper), en "Uitbetaald" nadat het bedrag is overgemaakt.

async function post(body: unknown): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/shop-verkopers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data?.error?.message ?? "Niet gelukt.";
  } catch {
    return "Geen verbinding.";
  }
}

export function BeoordeelKnoppen({ productId, naam }: { productId: string; naam: string }) {
  const router = useRouter();
  const [afwijzen, setAfwijzen] = useState(false);
  const [reden, setReden] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const doe = async (body: unknown) => {
    setBezig(true);
    setFout("");
    const f = await post(body);
    setBezig(false);
    if (f) setFout(f);
    else router.refresh();
  };

  return (
    <div className="grid justify-items-end gap-2">
      {afwijzen ? (
        <div className="grid w-full max-w-xs gap-2">
          <label className="grid gap-1 text-xs" style={{ color: "var(--a-mute)" }} htmlFor={`reden-${productId}`}>
            Reden voor de verkoper
            <textarea id={`reden-${productId}`} value={reden} onChange={(e) => setReden(e.target.value)} rows={2} maxLength={400} className="a-input text-sm" placeholder="Bijvoorbeeld: de foto is onscherp." />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAfwijzen(false)} className="a-btn a-btn-ghost text-xs">
              Terug
            </button>
            <button type="button" disabled={bezig} onClick={() => void doe({ actie: "afwijzen", productId, reden })} className="a-btn a-btn-ghost text-xs" style={{ color: "var(--a-crit)" }}>
              {bezig ? "Bezig…" : "Afwijzen"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setAfwijzen(true)} className="a-btn a-btn-ghost text-xs" aria-label={`${naam} afwijzen`}>
            Afwijzen
          </button>
          <button type="button" disabled={bezig} onClick={() => void doe({ actie: "goedkeuren", productId })} className="a-btn a-btn-primary text-xs" aria-label={`${naam} goedkeuren`}>
            {bezig ? "Bezig…" : "Goedkeuren"}
          </button>
        </div>
      )}
      {fout && (
        <span role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>
          {fout}
        </span>
      )}
    </div>
  );
}

export function VerkoperUitbetaalKnop({ tenantId, bedrag }: { tenantId: string; bedrag: string }) {
  const router = useRouter();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const klik = async () => {
    if (!window.confirm(`Heb je ${bedrag} overgemaakt? Dan markeren we deze verkopen als uitbetaald.`)) return;
    setBezig(true);
    setFout("");
    const f = await post({ actie: "uitbetaald", tenantId });
    setBezig(false);
    if (f) setFout(f);
    else router.refresh();
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={() => void klik()} disabled={bezig} className="a-btn a-btn-primary text-xs">
        {bezig ? "Bezig…" : "Uitbetaald"}
      </button>
      {fout && (
        <span role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>
          {fout}
        </span>
      )}
    </span>
  );
}
