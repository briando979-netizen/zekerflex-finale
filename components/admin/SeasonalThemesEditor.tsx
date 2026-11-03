"use client";

import { useEffect, useState } from "react";
import { Notice, Panel, type Tone } from "@/components/admin/kit";

// ---------------------------------------------------------------------------
// Admin → Huisstijl → Seizoensthema's (lib/seasons): feestversiering op de hele
// site rond Nederlandse feestdagen en op ieders verjaardag. Alles aan of uit,
// per thema aan of uit, en elk thema vooraf bekijken met ?thema=.
// ---------------------------------------------------------------------------

interface Theme {
  id: string;
  naam: string;
  wanneer: string;
  emoji: string;
}
interface Settings {
  aan: boolean;
  uit: string[];
}

export function SeasonalThemesEditor() {
  const [data, setData] = useState<{ settings: Settings; themes: Theme[]; vandaag: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch("/api/admin/seizoenen", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return setMessage({ tone: "crit", text: "De seizoensthema's konden niet laden." });
      setData(await r.json());
    })();
  }, []);

  const save = async (settings: Settings) => {
    setBusy(true);
    setMessage(null);
    const r = await fetch("/api/admin/seizoenen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMessage({ tone: "crit", text: "Opslaan lukte niet." });
    const next = (await r.json()).settings as Settings;
    setData((d) => (d ? { ...d, settings: next } : d));
    setMessage({ tone: "ok", text: "Opgeslagen. Binnen een halve minuut zie je het op de site." });
  };

  if (!data) {
    return (
      <Panel title="Seizoensthema's" subtitle="Feestversiering rond Nederlandse feestdagen en op ieders verjaardag.">
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : <div className="h-16 animate-pulse" />}
      </Panel>
    );
  }
  const { settings, themes, vandaag } = data;
  const toggle = (id: string, on: boolean) => void save({ ...settings, uit: on ? settings.uit.filter((x) => x !== id) : [...settings.uit, id] });

  return (
    <Panel
      title="Seizoensthema's"
      subtitle="Feestversiering op de hele site rond Nederlandse feestdagen en op ieders verjaardag. Alleen versiering: niets verschuift, niets is aan te klikken, en wie minder beweging wil krijgt geen animaties. Bezoekers kunnen het per dag verbergen."
    >
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
          <input type="checkbox" checked={settings.aan} disabled={busy} onChange={(e) => void save({ ...settings, aan: e.target.checked })} />
          Seizoensthema&apos;s aan
        </label>
        {vandaag && <Notice>Vandaag: {themes.find((t) => t.id === vandaag)?.naam ?? vandaag}.</Notice>}
        {message && <Notice tone={message.tone} role={message.tone === "crit" ? "alert" : "status"}>{message.text}</Notice>}
        <ul>
          {themes.map((t) => {
            const on = !settings.uit.includes(t.id);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2" style={{ borderTop: "1px solid var(--a-border)" }}>
                <label className="flex min-w-0 flex-1 items-center gap-2 text-[0.8125rem]" style={{ color: settings.aan ? "var(--a-text)" : "var(--a-mute)" }}>
                  <input type="checkbox" checked={on} disabled={busy || !settings.aan} onChange={(e) => toggle(t.id, e.target.checked)} />
                  <span aria-hidden="true">{t.emoji}</span>
                  <span className="font-medium">{t.naam}</span>
                  <span className="truncate text-xs" style={{ color: "var(--a-mute)" }}>{t.wanneer}</span>
                </label>
                <a href={`/?thema=${t.id}`} target="_blank" rel="noopener" className="a-button text-xs">
                  Bekijk
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}
