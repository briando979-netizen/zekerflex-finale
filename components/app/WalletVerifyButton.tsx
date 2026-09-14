"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface WalletCheck {
  label: string;
  ok: boolean;
  detail: string;
}
interface WalletClaimsSummary {
  givenName: string | null;
  familyName: string | null;
  expiryDate: string | null;
}
interface WalletResult {
  outcome: "verified" | "in_review" | "rejected";
  summary: string;
  checks: WalletCheck[];
}

type Stage =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "claims"; attemptId: string; claims: WalletClaimsSummary; checks: WalletCheck[] }
  | { kind: "error"; message: string; checks?: WalletCheck[] }
  | { kind: "result"; result: WalletResult };

/**
 * Optional, additive identity-verification path via the browser's W3C
 * Digital Credentials API (an already-issued digital ID from the OS/browser
 * wallet, e.g. a mobile driver's license) — alongside, never instead of, the
 * 3-photo capture in OnboardingForm. Renders nothing at all when the browser
 * doesn't support the API, which today is almost everyone: this is brand
 * new and needs both a supporting browser and a government-issued digital
 * ID already provisioned in a wallet.
 */
export function WalletVerifyButton({ requireKvk = true }: { requireKvk?: boolean }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "checking" });

  useEffect(() => {
    setStage(typeof window !== "undefined" && "DigitalCredential" in window ? { kind: "idle" } : { kind: "unsupported" });
  }, []);

  async function start(): Promise<void> {
    setStage({ kind: "busy", label: "Wallet wordt geopend…" });
    try {
      const startRes = await fetch("/api/onboarding/wallet/start", { method: "POST" });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData?.error?.message ?? "Kon de verificatie niet starten");

      const { requestCredentials } = await import("id-verifier");
      const credentials = await requestCredentials(startData.requestParams, { timeout: 300_000 });

      setStage({ kind: "busy", label: "Wordt gecontroleerd…" });
      const verifyRes = await fetch("/api/onboarding/wallet/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId: startData.attemptId, credentials }),
      });
      const outcome = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(outcome?.error?.message ?? "Verificatie mislukt");
      if (!outcome.ok) {
        setStage({
          kind: "error",
          message: outcome.reason ?? "De digitale ID kon niet worden bevestigd.",
          checks: outcome.checks,
        });
        return;
      }
      setStage({ kind: "claims", attemptId: startData.attemptId, claims: outcome.claims, checks: outcome.checks });
    } catch (e) {
      setStage({ kind: "error", message: (e as Error).message || "Kon geen digitale ID ophalen." });
    }
  }

  async function submit(attemptId: string, form: FormData): Promise<void> {
    setStage({ kind: "busy", label: "Bezig met opslaan…" });
    try {
      const res = await fetch("/api/onboarding/wallet/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attemptId,
          kvkNumber: form.get("kvkNumber") || undefined,
          postalCode: form.get("postalCode"),
          houseNumber: form.get("houseNumber"),
          payoutIban: form.get("payoutIban"),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStage({ kind: "error", message: data?.error?.message ?? "Opslaan is mislukt." });
        return;
      }
      setStage({ kind: "result", result: data });
      if (data.outcome === "verified") setTimeout(() => router.refresh(), 1500);
    } catch {
      setStage({ kind: "error", message: "Kon de gegevens niet opslaan. Controleer je verbinding." });
    }
  }

  if (stage.kind === "checking" || stage.kind === "unsupported") return null;

  if (stage.kind === "idle" || stage.kind === "busy") {
    return (
      <div className="card flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-ink">Digitale ID-wallet</p>
          <p className="mt-0.5 text-xs text-neutralx-500">
            Heb je een ID in een wallet op dit apparaat staan? Dan hoef je geen foto&apos;s te maken.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void start()}
          disabled={stage.kind === "busy"}
          className="btn-ghost flex-shrink-0 whitespace-nowrap text-sm"
        >
          {stage.kind === "busy" ? stage.label : "Verifieer met wallet"}
        </button>
      </div>
    );
  }

  if (stage.kind === "error") {
    return (
      <div className="card space-y-3 p-5">
        <p className="text-sm text-crit">{stage.message}</p>
        {stage.checks && (
          <ul className="space-y-1 text-xs text-neutralx-500">
            {stage.checks.filter((c) => !c.ok).map((c) => (
              <li key={c.label}>· {c.detail}</li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setStage({ kind: "idle" })} className="btn-ghost text-sm">
          Probeer opnieuw
        </button>
      </div>
    );
  }

  if (stage.kind === "result") {
    const tone =
      stage.result.outcome === "verified" ? "text-ok" : stage.result.outcome === "rejected" ? "text-crit" : "text-warn";
    return (
      <div className="card space-y-3 p-5">
        <p className={`text-sm font-semibold ${tone}`}>{stage.result.summary}</p>
        <ul className="divide-y divide-hair text-sm">
          {stage.result.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 py-2">
              <span className={`mt-0.5 ${c.ok ? "text-ok" : "text-crit"}`}>{c.ok ? "✓" : "!"}</span>
              <span className="text-neutralx-600">{c.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // stage.kind === "claims"
  const name = [stage.claims.givenName, stage.claims.familyName].filter(Boolean).join(" ") || "onbekend";
  return (
    <div className="card space-y-4 p-5">
      <div>
        <p className="text-sm font-semibold text-ok">✓ Wallet geverifieerd: {name}</p>
        <p className="mt-0.5 text-xs text-neutralx-500">
          {stage.claims.expiryDate ? `Geldig tot ${stage.claims.expiryDate}` : null}
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(stage.attemptId, new FormData(e.currentTarget));
        }}
        className="space-y-3"
      >
        {requireKvk && (
          <label className="block">
            <span className="field-label">KVK-nummer</span>
            <input name="kvkNumber" required inputMode="numeric" placeholder="12345678" className="field-input" />
          </label>
        )}
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <label className="block">
            <span className="field-label">Postcode</span>
            <input name="postalCode" required placeholder="1012 AB" className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Huisnr.</span>
            <input name="houseNumber" required placeholder="10" className="field-input" />
          </label>
        </div>
        <label className="block">
          <span className="field-label">IBAN voor uitbetalingen</span>
          <input name="payoutIban" required placeholder="NL00 BANK 0000 0000 00" className="field-input" />
        </label>
        <button type="submit" className="btn-primary w-full">
          Verificatie afronden
        </button>
      </form>
    </div>
  );
}
