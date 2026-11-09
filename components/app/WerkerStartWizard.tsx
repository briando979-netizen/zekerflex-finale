"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFT } from "@/components/i18n/useFT";

type Kind = "zzp" | "flexwerker" | "uitzendkracht";
type StepKey = "kind" | "email" | "verify";

const KINDS: Kind[] = ["zzp", "flexwerker", "uitzendkracht"];

function Dot({ done, active }: { done: boolean; active: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border text-[10px] ${
        done ? "border-brand-500 bg-brand-500 text-white" : active ? "border-brand-500 text-brand-500" : "border-hairstrong text-neutralx-400"
      }`}
      aria-hidden
    >
      {done ? "✓" : active ? "●" : ""}
    </span>
  );
}

/**
 * De start van een nieuwe werker, zoals de start van een werkgever: eerst kiezen welke richting
 * (ZZP'er, flexwerker of uitzendkracht), dan e-mail bevestigen, dan gegevens en identiteit.
 * Staat bovenaan "Vind jouw klus" tot het profiel compleet is. De gegevens zelf (KVK, btw, BSN,
 * IBAN) staan op /dashboard/verificatie; hier alleen de keuze die de rest bepaalt.
 */
export function WerkerStartWizard({
  workerKind,
  emailVerified,
  profileComplete,
}: {
  workerKind: Kind | null;
  emailVerified: boolean;
  profileComplete: boolean;
}) {
  const t = useFT().start;
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(workerKind);
  const [pick, setPick] = useState<Kind | null>(workerKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done: Record<StepKey, boolean> = { kind: kind !== null, email: emailVerified, verify: profileComplete };
  const ORDER: StepKey[] = ["kind", "email", "verify"];
  const first = ORDER.find((k) => !done[k]);
  const [open, setOpen] = useState<StepKey>(first ?? "verify");
  const completed = ORDER.filter((k) => done[k]).length;
  const pct = Math.round((completed / ORDER.length) * 100);
  const label: Record<StepKey, string> = { kind: t.kindStep, email: t.emailStep, verify: t.verifyStep };

  async function save() {
    if (!pick || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/richting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerKind: pick }),
      });
      const d: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = d && typeof d === "object" && "error" in d ? (d as { error?: { message?: unknown } }).error?.message : null;
        setError(typeof msg === "string" ? msg : t.saveError);
        return;
      }
      setKind(pick);
      setOpen(emailVerified ? "verify" : "email");
      router.refresh();
    } catch {
      setError(t.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-6 overflow-hidden p-0" aria-labelledby="werker-start-titel">
      <div className="border-b border-hair p-5">
        <p className="eyebrow mb-1">{t.eyebrow}</p>
        <h2 id="werker-start-titel" className="font-display text-xl font-bold leading-tight text-ink">{t.title}</h2>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hair" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-neutralx-500">{t.progress.replace("{done}", String(completed)).replace("{total}", String(ORDER.length))}</span>
        </div>
      </div>

      <ol>
        {ORDER.map((k) => {
          const isOpen = open === k;
          return (
            <li key={k} className="border-b border-hair last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(k)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm font-semibold text-ink"
              >
                <Dot done={done[k]} active={isOpen} />
                <span className="flex-1">{label[k]}</span>
                {k === "kind" && kind && <span className="text-xs font-normal text-neutralx-500">{t.chosen.replace("{kind}", t.kinds[kind][0] ?? "")}</span>}
              </button>

              {isOpen && k === "kind" && (
                <div className="space-y-3 px-5 pb-5">
                  <p className="text-xs text-neutralx-500">{t.kindHint}</p>
                  <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t.kindStep}>
                    {KINDS.map((opt) => {
                      const on = pick === opt;
                      const locked = kind !== null && kind !== opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={locked}
                          onClick={() => setPick(opt)}
                          className={`rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50 ${
                            on ? "border-brand-500 bg-brand-50" : "border-hairstrong hover:border-brand-500"
                          }`}
                        >
                          <span className="block text-sm font-semibold text-ink">{t.kinds[opt][0]}</span>
                          <span className="mt-1 block text-xs leading-snug text-neutralx-500">{t.kinds[opt][1]}</span>
                        </button>
                      );
                    })}
                  </div>
                  {error && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}
                  {kind === null && (
                    <button type="button" onClick={save} disabled={!pick || busy} className="btn-primary text-sm disabled:opacity-50">
                      {busy ? t.saving : t.pick}
                    </button>
                  )}
                </div>
              )}

              {isOpen && k === "email" && (
                <div className="space-y-3 px-5 pb-5">
                  <p className="text-sm text-neutralx-600">{t.emailBody}</p>
                  {!emailVerified && <Link href="/verifieer-email" className="btn-primary inline-block text-sm">{t.emailCta}</Link>}
                </div>
              )}

              {isOpen && k === "verify" && (
                <div className="space-y-3 px-5 pb-5">
                  <p className="text-sm text-neutralx-600">{t.verifyBody}</p>
                  <Link href="/dashboard/verificatie" className="btn-primary inline-block text-sm">{t.verifyCta}</Link>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="bg-paper-soft px-5 py-2.5 text-xs text-neutralx-500">{t.browse}</p>
    </section>
  );
}
