"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}
interface Result {
  outcome: "verified" | "in_review" | "rejected";
  summary: string;
  kvkValid: boolean;
  companyName: string | null;
  checks: Check[];
  reasons: string[];
}

const DOC_LABEL: Record<string, string> = {
  PASSPORT: "Paspoort",
  ID_CARD: "Identiteitskaart",
  DRIVERS_LICENSE: "Rijbewijs",
};

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Er ging iets mis. Probeer het opnieuw.");
      } else {
        setResult(data as Result);
        if (data.outcome === "verified") setTimeout(() => router.refresh(), 1500);
      }
    } catch {
      setError("Kon de verificatie niet versturen. Controleer je verbinding.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const tone =
      result.outcome === "verified"
        ? { pill: "pill-ok", label: "Geverifieerd", ring: "border-ok/30 bg-ok/5" }
        : result.outcome === "rejected"
          ? { pill: "pill-crit", label: "Afgewezen", ring: "border-crit/30 bg-crit/5" }
          : { pill: "pill-warn", label: "In behandeling", ring: "border-warn/30 bg-warn/5" };

    return (
      <div className="space-y-5">
        <div className={`card p-6 ${tone.ring}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Resultaat</h2>
            <span className={tone.pill}>{tone.label}</span>
          </div>
          <p className="mt-2 text-sm text-ink-soft">{result.summary}</p>
          {result.companyName && (
            <p className="mt-1 text-xs text-neutralx-500">
              Onderneming: {result.companyName} {result.kvkValid ? "· gevalideerd" : "· niet gevalideerd"}
            </p>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Controles</div>
          <ul className="divide-y divide-hair">
            {result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[11px] ${
                    c.ok ? "bg-ok text-white" : "bg-crit text-white"
                  }`}
                >
                  {c.ok ? "✓" : "!"}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{c.label}</p>
                  <p className="text-xs text-neutralx-500">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {result.outcome !== "verified" && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                formRef.current?.reset();
                setFileName(null);
              }}
              className="btn-primary"
            >
              Gegevens aanpassen en opnieuw proberen
            </button>
            <a href="mailto:support@zekerflex.com" className="btn-ghost">
              Hulp nodig? support@zekerflex.com
            </a>
          </div>
        )}
        {result.outcome === "verified" && (
          <button type="button" onClick={() => router.refresh()} className="btn-primary">
            Naar mijn dashboard
          </button>
        )}
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-8">
      {error && (
        <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{error}</p>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">1. Onderneming</legend>
        <label className="block">
          <span className="field-label">KVK-nummer</span>
          <input name="kvkNumber" required inputMode="numeric" placeholder="12345678" className="field-input" />
          <span className="mt-1 block text-xs text-neutralx-400">
            We controleren dit live in het Handelsregister.
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">2. Thuisbasis & uitbetaling</legend>
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
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">3. Identiteitsbewijs</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Type document</span>
            <select name="documentType" required defaultValue="ID_CARD" className="field-input">
              {Object.entries(DOC_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Documentnummer</span>
            <input name="documentNumber" required placeholder="SPECI2014" className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Geldig tot</span>
            <input type="date" name="documentExpiry" required className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Naam zoals op document</span>
            <input name="nameOnDocument" required defaultValue={defaultName} className="field-input" />
          </label>
        </div>

        <label className="block">
          <span className="field-label">Foto of scan van het document</span>
          <div className="mt-1.5 flex items-center gap-3 rounded-lg border border-dashed border-hairstrong px-4 py-6">
            <input
              type="file"
              name="document"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="text-sm text-neutralx-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
            />
          </div>
          <span className="mt-1 block text-xs text-neutralx-400">
            {fileName ? `Gekozen: ${fileName}` : "JPG, PNG of PDF. De ingebouwde ID-controleur beoordeelt echtheid en consistentie."}
          </span>
        </label>
      </fieldset>

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Bezig met controleren…" : "Verificatie versturen"}
      </button>
      <p className="text-xs leading-relaxed text-neutralx-400">
        Je document wordt lokaal opgeslagen op de eigen infrastructuur van ZekerFlex en
        alleen gebruikt voor deze verificatie. Er gaat niets naar externe partijen.
      </p>
    </form>
  );
}
