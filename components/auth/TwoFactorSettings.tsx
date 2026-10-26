"use client";

import { copyText } from "@/lib/clipboard";

import { useCallback, useEffect, useState } from "react";

interface Status {
  enabled: boolean;
  enabledAt: string | null;
  recoveryLeft: number;
}

async function call(body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch("/api/me/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = r ? ((await r.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: Boolean(r?.ok), data };
}
const errMsg = (d: Record<string, unknown>) => ((d.error as { message?: string } | undefined)?.message ?? "Dat lukte niet. Probeer het opnieuw.");

/** Two-step verification: turn on (scan QR → confirm code → save recovery codes), regenerate codes, turn off. */
export function TwoFactorSettings({ recommended = false }: { recommended?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"idle" | "disable" | "recovery">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/me/2fa", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setStatus(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (body: unknown, onOk: (d: Record<string, unknown>) => void) => {
    setBusy(true);
    setError(null);
    const { ok, data } = await call(body);
    setBusy(false);
    if (ok) onOk(data);
    else setError(errMsg(data));
  };

  if (!status) return <p className="text-sm text-neutralx-400">Laden…</p>;

  // recovery codes, shown exactly once
  if (codes) {
    const text = `ZekerFlex herstelcodes (elke code werkt één keer)\n\n${codes.join("\n")}\n`;
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-ink">Bewaar je herstelcodes</p>
        <p className="text-sm text-neutralx-600">Telefoon kwijt? Met een van deze codes kom je toch binnen. Elke code werkt één keer. We laten ze maar één keer zien.</p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-paper-soft p-3 font-mono text-sm text-ink">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-sm" onClick={() => void copyText(text)}>
            Kopiëren
          </button>
          <a className="btn-ghost text-sm" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download="zekerflex-herstelcodes.txt">
            Downloaden
          </a>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutralx-600">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-brand-500" /> Ik heb mijn herstelcodes veilig bewaard
        </label>
        <button
          type="button"
          disabled={!saved}
          className="btn-primary text-sm disabled:opacity-50"
          onClick={() => {
            setCodes(null);
            setSaved(false);
            void load();
          }}
        >
          Klaar
        </button>
      </div>
    );
  }

  if (setup) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-neutralx-600">
          <li>Installeer een authenticator-app (bijv. Google Authenticator, Microsoft Authenticator of 1Password).</li>
          <li>Scan de QR-code met de app — of op je telefoon: tik op &ldquo;Toevoegen aan app&rdquo;.</li>
          <li>Vul de 6-cijferige code in die de app laat zien.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-4">
          {/* SVG generated server-side by the qrcode library from our own otpauth URL */}
          <div className="h-[180px] w-[180px] flex-shrink-0 overflow-hidden rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <a href={setup.otpauth} className="btn-ghost inline-block text-sm">
              Toevoegen aan app
            </a>
            <p className="text-neutralx-500">Of typ deze sleutel over:</p>
            <p className="break-all rounded-lg bg-paper-soft px-3 py-2 font-mono text-xs text-ink">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
          </div>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ action: "confirm", code }, (d) => {
              setSetup(null);
              setCode("");
              setCodes(d.recoveryCodes as string[]);
            });
          }}
        >
          <label className="block">
            <span className="field-label">Code uit de app</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" className="field-input w-40 text-center font-mono tracking-widest" />
          </label>
          <button type="submit" disabled={busy || code.replace(/\s/g, "").length < 6} className="btn-primary text-sm disabled:opacity-50">
            {busy ? "Controleren…" : "Bevestigen"}
          </button>
          <button type="button" className="btn-ghost text-sm" onClick={() => setSetup(null)}>
            Annuleren
          </button>
        </form>
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      </div>
    );
  }

  if (!status.enabled) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-neutralx-600">
          Met tweestapsverificatie heb je naast je wachtwoord ook een code van je telefoon nodig om in te loggen. Een gestolen wachtwoord is dan niet genoeg.
          {recommended && <strong className="text-ink"> Sterk aangeraden voor jouw account: je hebt toegang tot betalingen en persoonsgegevens.</strong>}
        </p>
        <button type="button" disabled={busy} className="btn-primary text-sm disabled:opacity-50" onClick={() => void run({ action: "begin" }, (d) => setSetup(d as { secret: string; otpauth: string; qrSvg: string }))}>
          {busy ? "Bezig…" : "Tweestapsverificatie aanzetten"}
        </button>
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink">
        <span className="font-semibold text-ok">✓ Aan</span>
        {status.enabledAt && <span className="text-neutralx-500"> sinds {new Date(status.enabledAt).toLocaleDateString("nl-NL")}</span>}
        <span className="text-neutralx-500"> · {status.recoveryLeft} herstelcode{status.recoveryLeft === 1 ? "" : "s"} over</span>
      </p>
      {status.recoveryLeft <= 3 && <p className="text-sm text-warn">Je hebt nog maar weinig herstelcodes — maak nieuwe aan.</p>}
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost text-sm" onClick={() => setMode("recovery")}>
            Nieuwe herstelcodes
          </button>
          <button type="button" className="btn-ghost text-sm text-crit" onClick={() => setMode("disable")}>
            Uitzetten
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ action: mode, code }, (d) => {
              setCode("");
              setMode("idle");
              if (Array.isArray(d.recoveryCodes)) setCodes(d.recoveryCodes as string[]);
              else void load();
            });
          }}
        >
          <label className="block">
            <span className="field-label">{mode === "disable" ? "Code om uit te zetten" : "Code uit de app"}</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={20} className="field-input w-44 text-center font-mono" />
          </label>
          <button type="submit" disabled={busy || code.trim().length < 6} className={`${mode === "disable" ? "btn-ghost text-crit" : "btn-primary"} text-sm disabled:opacity-50`}>
            {mode === "disable" ? "Uitzetten" : "Aanmaken"}
          </button>
          <button type="button" className="btn-ghost text-sm" onClick={() => setMode("idle")}>
            Annuleren
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-crit">{error}</p>}
    </div>
  );
}
