"use client";

import { useEffect, useState } from "react";

interface Health {
  configured: boolean;
  backend: string;
  baseUrl: string;
  reachable: boolean;
  local: boolean;
  detail?: string;
  models?: string[];
}
interface SlotInfo {
  key: string;
  ready: boolean;
  file: string;
  spec: { alt: string; aspect: string };
}
interface Preset {
  key: string;
  label: string;
  slot: string;
  aspect: "portrait" | "landscape" | "wide";
}
interface GenResult {
  b64: string;
  width: number;
  height: number;
  seed: number | null;
  prompt: string;
  aspect: string;
}

const SLOT_LABEL: Record<string, string> = {
  hero: "Homepage-hero",
  freelancer: "Voor freelancers",
  employer: "Voor bedrijven",
  team: "Team / over-ons",
};

export function Studio() {
  const [health, setHealth] = useState<Health | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);

  const [mode, setMode] = useState<"preset" | "idea">("preset");
  const [presetKey, setPresetKey] = useState("");
  const [idea, setIdea] = useState("");
  const [enhance, setEnhance] = useState(true);
  const [extra, setExtra] = useState("");
  const [aspect, setAspect] = useState<"portrait" | "landscape" | "wide">("landscape");
  const [steps, setSteps] = useState(28);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/studio", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setHealth(data.health);
        setSlots(data.slots);
        setPresets(data.presets);
        if (!presetKey && data.presets[0]) setPresetKey(data.presets[0].key);
      }
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = presets.find((x) => x.key === presetKey);
    if (p) setAspect(p.aspect);
  }, [presetKey, presets]);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/admin/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "preset"
            ? { presetKey, extra: extra || undefined, aspect, steps }
            : { idea, enhance, extra: extra || undefined, aspect, steps },
        ),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error?.message ?? "Genereren mislukt.");
      else setResult(data as GenResult);
    } catch {
      setError("De studio is niet bereikbaar.");
    } finally {
      setBusy(false);
    }
  }

  async function saveToSlot(slot: string) {
    if (!result) return;
    setSaved(null);
    try {
      const res = await fetch("/api/admin/studio/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", slot, b64: result.b64 }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error?.message ?? "Opslaan mislukt.");
      else {
        setSaved(slot);
        void refresh();
      }
    } catch {
      setError("Opslaan mislukt.");
    }
  }

  async function removeSlot(slot: string) {
    try {
      await fetch("/api/admin/studio/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", slot }),
      });
      void refresh();
    } catch {
      /* ignore */
    }
  }

  async function uploadToSlot(slot: string, file: File) {
    const fd = new FormData();
    fd.append("slot", slot);
    fd.append("file", file);
    try {
      const res = await fetch("/api/admin/studio/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) setError(data?.error?.message ?? "Uploaden mislukt.");
      else void refresh();
    } catch {
      setError("Uploaden mislukt.");
    }
  }

  const ok = health?.configured && health?.reachable;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Studio</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Genereer marketingbeelden met het lokale beeldmodel en plaats ze direct op de site.
        </p>
      </div>

      {/* backend status */}
      <div
        className={`card p-4 text-sm ${
          ok ? "border-ok/30 bg-ok/5" : "border-warn/30 bg-warn/5"
        }`}
      >
        {health === null ? (
          "Status ophalen…"
        ) : ok ? (
          <span className="flex flex-wrap items-center gap-2 text-ok">
            <span className="h-2 w-2 rounded-full bg-ok" />
            Beeldmodel bereikbaar — <span className="font-mono text-xs text-neutralx-600">{health.backend} · {health.baseUrl}</span>
            {health.models?.[0] && (
              <span className="font-mono text-xs text-neutralx-500">· {health.models[0]}</span>
            )}
          </span>
        ) : (
          <div className="space-y-2 text-neutralx-700">
            <p className="font-semibold text-ink">
              {health.configured ? "Beeldmodel niet bereikbaar" : "Nog geen beeldmodel ingesteld"}
            </p>
            <p>
              De Studio heeft een lokale Stable Diffusion-server nodig. Er gaat niets naar buiten.
              Snelste optie:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Installeer <span className="font-mono text-xs">AUTOMATIC1111</span> of{" "}
                <span className="font-mono text-xs">Stable Diffusion WebUI Forge</span> en start met{" "}
                <span className="font-mono text-xs">--api --listen</span>.
              </li>
              <li>
                Download een fotorealistisch SDXL-model (bijv. <em>RealVisXL</em>) naar de{" "}
                <span className="font-mono text-xs">models/Stable-diffusion</span> map.
              </li>
              <li>
                Zet in <span className="font-mono text-xs">.env</span>:{" "}
                <span className="font-mono text-xs">IMAGE_ENABLED=true</span>,{" "}
                <span className="font-mono text-xs">IMAGE_BACKEND=a1111</span>,{" "}
                <span className="font-mono text-xs">IMAGE_BASE_URL=http://localhost:7860</span>.
              </li>
              <li>Herstart de app en ververs deze pagina.</li>
            </ol>
            {health.detail && (
              <p className="font-mono text-xs text-neutralx-400">{health.detail}</p>
            )}
            <p className="text-xs text-neutralx-500">
              Geen GPU? Het werkt op CPU maar een render duurt dan enkele minuten.
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* controls */}
        <div className="card space-y-5 p-5">
          <div className="grid grid-cols-2 gap-1 rounded-full border border-hairstrong p-1">
            {(["preset", "idea"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  mode === m ? "bg-brand-500 text-white" : "text-neutralx-600"
                }`}
              >
                {m === "preset" ? "Sjabloon" : "Eigen idee"}
              </button>
            ))}
          </div>

          {mode === "preset" ? (
            <label className="block">
              <span className="field-label">Sjabloon</span>
              <select value={presetKey} onChange={(e) => setPresetKey(e.target.value)} className="field-input">
                {presets.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="space-y-2">
              <label className="block">
                <span className="field-label">Beschrijf het beeld</span>
                <textarea
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  rows={3}
                  placeholder="Bijv. een monteur die 's ochtends zijn bus inlaadt bij een bedrijventerrein"
                  className="field-input"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-neutralx-600">
                <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
                Laat de lokale AI de prompt aanscherpen
              </label>
            </div>
          )}

          <label className="block">
            <span className="field-label">Extra details <span className="text-neutralx-400">(optioneel)</span></span>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="regen, blauw uur, van opzij gefotografeerd…"
              className="field-input"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Verhouding</span>
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value as typeof aspect)}
                className="field-input"
              >
                <option value="portrait">Staand (hero)</option>
                <option value="landscape">Liggend</option>
                <option value="wide">Breed (16:9)</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Stappen: {steps}</span>
              <input
                type="range"
                min={12}
                max={40}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="mt-3 w-full accent-brand-500"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={busy || !ok || (mode === "idea" && !idea.trim())}
            className="btn-primary w-full"
          >
            {busy ? "Bezig met renderen…" : "Genereer"}
          </button>
          {busy && (
            <p className="text-xs text-neutralx-400">
              Op een CPU kan dit een paar minuten duren. Laat het tabblad open.
            </p>
          )}
          {error && <p className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}
        </div>

        {/* result */}
        <div className="card flex flex-col p-5">
          {result ? (
            <>
              <div className="overflow-hidden rounded-xl border border-hair bg-paper-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${result.b64}`}
                  alt="Gegenereerd beeld"
                  className="w-full"
                />
              </div>
              <p className="mt-2 font-mono text-[11px] text-neutralx-400">
                {result.width}×{result.height}
                {result.seed !== null ? ` · seed ${result.seed}` : ""}
              </p>
              <p className="mt-3 text-xs font-medium text-neutralx-600">Plaats als:</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => saveToSlot(s.key)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      saved === s.key
                        ? "border-ok bg-ok/10 text-ok"
                        : "border-hairstrong text-neutralx-600 hover:border-brand-500"
                    }`}
                  >
                    {saved === s.key ? "✓ " : ""}
                    {SLOT_LABEL[s.key] ?? s.key}
                  </button>
                ))}
              </div>
              <a
                href={`data:image/png;base64,${result.b64}`}
                download="zekerflex-beeld.png"
                className="btn-ghost mt-3 self-start text-xs"
              >
                Download PNG
              </a>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-center text-sm text-neutralx-400">
              Nog geen beeld. Kies een sjabloon en klik op <span className="mx-1 font-medium">Genereer</span>.
            </div>
          )}
        </div>
      </div>

      {/* slots overview */}
      <div>
        <h2 className="mb-1 text-sm font-semibold text-ink">Beeldplekken op de site</h2>
        <p className="mb-3 text-xs text-neutralx-500">
          Upload een eigen foto (stock of een shoot) of gebruik een gegenereerd beeld hierboven.
          Zodra er een foto staat, verdwijnt de illustratie automatisch op de site.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {slots.map((s) => (
            <div key={s.key} className="card overflow-hidden">
              <div className="aspect-[4/3] bg-paper-soft">
                {s.ready ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/marketing/${s.file}?v=${Date.now().toString(36)}`} alt={s.spec.alt} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutralx-400">
                    illustratie (geen foto)
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate text-xs font-medium text-ink">{SLOT_LABEL[s.key] ?? s.key}</span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <label className="cursor-pointer text-xs font-medium text-brand-600 hover:underline">
                    {s.ready ? "vervang" : "upload"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadToSlot(s.key, f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {s.ready && (
                    <button
                      type="button"
                      onClick={() => removeSlot(s.key)}
                      className="text-xs text-neutralx-400 hover:text-crit"
                    >
                      verwijder
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
