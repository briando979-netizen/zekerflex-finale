"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

interface Info {
  eind: string;
  ingesteldOp: string;
  door: string;
}

const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

/**
 * De beperkte Stripe-sleutel voor de foto's van Stripe-controles (lib/kyc/stripe-fotos.ts).
 * Eén keer zetten; daarna staan voorkant, achterkant en selfie bij elke Stripe-controle in beeld.
 */
export function StripeFotoSleutel({ begin }: { begin: Info | null }) {
  const router = useRouter();
  const veldId = useId();
  const [info, setInfo] = useState<Info | null>(begin);
  const [sleutel, setSleutel] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function verstuur(method: "PUT" | "DELETE") {
    if (method === "DELETE" && !window.confirm("De Stripe-sleutel weghalen? Dan zie je de foto's van Stripe-controles hier niet meer.")) return;
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/admin/kyc/stripe-sleutel", {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "PUT" ? { body: JSON.stringify({ sleutel }) } : {}),
      });
      const d = (await res.json().catch(() => ({}))) as { sleutel?: Info | null; error?: { message?: string } };
      if (!res.ok) {
        setFout(d.error?.message ?? `Dat lukte niet (code ${res.status}). Probeer het opnieuw.`);
        return;
      }
      setInfo(d.sleutel ?? null);
      setSleutel("");
      setOpen(false);
      router.refresh();
    } catch {
      setFout("Geen verbinding. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  if (info) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--a-ok-soft)", color: "var(--a-ok-ink)" }}>
        <span>
          Foto&apos;s van Stripe staan aan · sleutel eindigt op <strong>…{info.eind}</strong> · gezet door {info.door} op {datum(info.ingesteldOp)}
        </span>
        <button type="button" onClick={() => void verstuur("DELETE")} disabled={bezig} className="font-medium hover:underline disabled:opacity-50">
          Weghalen
        </button>
        {fout && (
          <p role="alert" className="w-full" style={{ color: "var(--a-crit)" }}>
            {fout}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg px-3 py-3 text-xs" style={{ border: "1px solid var(--a-border)", background: "var(--a-elev)", color: "var(--a-dim)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          <strong style={{ color: "var(--a-text)" }}>Foto&apos;s van Stripe-controles hier zien?</strong> Stripe geeft ze alleen aan een aparte, beperkte sleutel.
        </p>
        <button type="button" onClick={() => setOpen((o) => !o)} className="a-btn text-xs" aria-expanded={open}>
          {open ? "Sluiten" : "Instellen"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Open in Stripe{" "}
              <a href="https://dashboard.stripe.com/apikeys/create" target="_blank" rel="noopener noreferrer" className="font-medium hover:underline" style={{ color: "var(--a-accent-ink)" }}>
                Beperkte sleutel maken →
              </a>{" "}
              (live-modus, niet de testmodus).
            </li>
            <li>Geef hem een naam, bijvoorbeeld &quot;ZekerFlex ID-foto&apos;s&quot;.</li>
            <li>
              Zet bij de rechten: <strong>Identity Verification Results</strong> op Lezen, <strong>Recent Detailed Verification Results</strong> op Lezen en <strong>Files</strong> op Schrijven. De rest blijft op Geen.
            </li>
            <li>Maak de sleutel en plak hem hieronder (hij begint met rk_live_).</li>
            <li>
              Ook controles van langer dan 48 uur geleden zien? Kies bij de sleutel in Stripe &quot;IP-beperkingen beheren&quot;, vul <strong>37.97.226.24</strong> in (onze server) en zet daarna ook <strong>All Detailed Verification Results</strong> op Lezen.
            </li>
          </ol>
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor={veldId} className="sr-only">
              Beperkte Stripe-sleutel
            </label>
            <input
              id={veldId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={sleutel}
              onChange={(e) => setSleutel(e.target.value)}
              placeholder="rk_live_…"
              className="min-w-0 flex-1 rounded-md px-2.5 py-1.5 font-mono text-xs"
              style={{ border: "1px solid var(--a-border-strong)", background: "var(--a-panel)", color: "var(--a-text)" }}
              aria-invalid={fout ? true : undefined}
            />
            <button type="button" onClick={() => void verstuur("PUT")} disabled={bezig || sleutel.trim().length < 10} className="a-btn a-btn-primary text-xs disabled:opacity-50">
              {bezig ? "Controleren bij Stripe…" : "Opslaan"}
            </button>
          </div>
          <p>De sleutel wordt eerst bij Stripe gecontroleerd en daarna verzegeld bewaard; niemand kan hem hier terug lezen. De foto&apos;s komen rechtstreeks van Stripe en worden bij ons niet opgeslagen. Elke keer dat iemand een foto bekijkt, staat in het auditlog.</p>
          {fout && (
            <p role="alert" style={{ color: "var(--a-crit)" }}>
              {fout}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
