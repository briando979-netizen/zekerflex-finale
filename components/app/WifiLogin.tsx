"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// De eigen wifi-login van een flexwerker (Account → Wifi): gebruikersnaam,
// wachtwoord (tonen, kopiëren, vernieuwen) en de netwerknaam bij de klussen van
// vandaag. De teksten komen als prop mee (vijf talen, lib/i18n/freelancer.ts).
// ---------------------------------------------------------------------------

export interface WifiTeksten {
  username: string;
  password: string;
  show: string;
  hide: string;
  copy: string;
  copied: string;
  how: string;
  steps: string[];
  today: string;
  network: string;
  noJobs: string;
  noWifi: string;
  renew: string;
  renewHint: string;
  renewFail: string;
}

export interface WifiKlus {
  bedrijf: string;
  vestiging: string;
  van: string;
  tot: string;
  ssid: string | null;
}

/** Tijd in Nederlandse tijd, vast formaat (server en browser gelijk). */
function klok(iso: string): string {
  const p = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("hour")}:${v("minute")}`;
}

export function WifiLogin({ gebruiker, wachtwoord: begin, vandaag, t }: { gebruiker: string; wachtwoord: string; vandaag: WifiKlus[]; t: WifiTeksten }) {
  const [wachtwoord, setWachtwoord] = useState(begin);
  const [toon, setToon] = useState(false);
  const [gekopieerd, setGekopieerd] = useState<"gebruiker" | "wachtwoord" | null>(null);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState("");

  function kopieer(wat: "gebruiker" | "wachtwoord", tekst: string) {
    navigator.clipboard?.writeText(tekst).then(() => {
      setGekopieerd(wat);
      setTimeout(() => setGekopieerd(null), 1500);
    });
  }

  async function vernieuw() {
    if (!window.confirm(t.renewHint)) return;
    setBusy(true);
    setFout("");
    const res = await fetch("/api/dashboard/wifi", { method: "POST" }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as { wachtwoord?: string }) : {};
    setBusy(false);
    if (!res?.ok || !data.wachtwoord) {
      setFout(t.renewFail);
      return;
    }
    setWachtwoord(data.wachtwoord);
    setToon(true);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{t.username}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 break-all font-mono text-ink">
              {gebruiker}
              <button type="button" className="rounded-md border border-hairstrong px-2 py-1 text-xs font-semibold text-neutralx-600" onClick={() => kopieer("gebruiker", gebruiker)}>
                {gekopieerd === "gebruiker" ? t.copied : t.copy}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{t.password}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2 font-mono text-ink">
              {toon ? wachtwoord : "••••-••••-••••-••••"}
              <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setToon((x) => !x)}>
                {toon ? t.hide : t.show}
              </button>
              {toon && (
                <button type="button" className="rounded-md border border-hairstrong px-2 py-1 text-xs font-semibold text-neutralx-600" onClick={() => kopieer("wachtwoord", wachtwoord)}>
                  {gekopieerd === "wachtwoord" ? t.copied : t.copy}
                </button>
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost" disabled={busy} onClick={vernieuw}>
            {busy ? "…" : t.renew}
          </button>
          {fout && (
            <p role="alert" className="text-sm font-semibold text-crit">
              {fout}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
        <h2 className="text-sm font-semibold text-ink">{t.today}</h2>
        {vandaag.length === 0 ? (
          <p className="mt-1 text-sm text-neutralx-500">{t.noJobs}</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair text-sm">
            {vandaag.map((k) => (
              <li key={`${k.bedrijf}-${k.van}`} className="py-2">
                <p className="font-medium text-ink">
                  {k.bedrijf} <span className="font-normal text-neutralx-400">· {k.vestiging}</span>
                </p>
                <p className="text-xs text-neutralx-500">
                  {klok(k.van)}–{klok(k.tot)}
                </p>
                {k.ssid ? (
                  <p className="mt-1 text-sm">
                    <span className="text-neutralx-500">{t.network}:</span> <span className="font-mono text-ink">{k.ssid}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-neutralx-400">{t.noWifi}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
        <h2 className="text-sm font-semibold text-ink">{t.how}</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-neutralx-700">
          {t.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
