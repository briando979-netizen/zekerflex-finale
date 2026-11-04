"use client";

import { useEffect, useState } from "react";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";

interface Health {
  configured: boolean;
  backend: string;
  baseUrl: string;
  reachable: boolean;
  local: boolean;
  detail?: string;
  models?: string[];
  warning?: string;
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

  const [mode, setMode] = useState<"preset" | "idea" | "edit">("preset");
  const [presetKey, setPresetKey] = useState("");
  const [idea, setIdea] = useState("");
  const [enhance, setEnhance] = useState(true);
  const [extra, setExtra] = useState("");
  const [aspect, setAspect] = useState<"portrait" | "landscape" | "wide">("landscape");
  const [steps, setSteps] = useState(28);
  const [editSrc, setEditSrc] = useState<string | null>(null); // base64 bron-foto om te bewerken
  const [instruction, setInstruction] = useState("");
  const [denoise, setDenoise] = useState(0.6);
  // Alleen bij Gemini: Nano Banana 2 (snel) of Pro (hoogste kwaliteit), en hoe groot.
  const [geminiModel, setGeminiModel] = useState<"gemini-3.1-flash-image" | "gemini-3-pro-image">("gemini-3.1-flash-image");
  const [grootte, setGrootte] = useState<"1K" | "2K" | "4K">("2K");

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
            ? { presetKey, extra: extra || undefined, aspect, steps, geminiModel, grootte }
            : { idea, enhance, extra: extra || undefined, aspect, steps, geminiModel, grootte },
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

  async function editPhoto() {
    if (busy || !editSrc || !instruction.trim()) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/admin/studio/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageB64: editSrc, instruction, aspect, steps, denoise, geminiModel }),
      });
      const data = await res.json();
      if (!res.ok) setError(data?.error?.message ?? "Bewerken mislukt.");
      else setResult({ ...data, prompt: data.instruction ?? instruction } as GenResult);
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
  const gemini = health?.backend === "gemini";
  const live = slots.filter((s) => s.ready).length;

  return (
    <div className="space-y-4">
      <PageHead
        title="Studio"
        subtitle={health?.backend === "cloudflare" ? "Maak en publiceer beelden voor de site met FLUX, gratis via het dagtegoed van Cloudflare (ongeveer 170 foto's per dag)." : gemini ? "Maak, bewerk en publiceer beelden voor de site met Google Nano Banana, hetzelfde soort AI waarmee Claude en Gemini foto's maken." : "Maak, bewerk en publiceer beelden voor de site vanuit één werkplek op je eigen server. Er gaat niets naar buiten."}
        meta={health ? <Pill tone={ok && !health.warning ? "ok" : "warn"}>{!ok ? "Beeldmodel offline" : health.warning ? "Wacht op tegoed bij Google" : "Beeldmodel online"}</Pill> : undefined}
      />

      <KpiStrip
        items={[
          { label: "Beeldplekken live", value: `${live} van ${slots.length}`, hint: live < slots.length ? "de rest toont een illustratie" : "overal een echte foto" },
          { label: "Beeldmodel", value: health === null ? "—" : ok ? (health.warning ? "Geen tegoed" : "Bereikbaar") : health.configured ? "Niet bereikbaar" : "Niet ingesteld", hint: health ? (health.warning ? "zet betalen aan bij Google" : health.backend) : "status laden", ...(health && (!ok || health.warning) ? { tone: "warn" as const } : {}) },
          { label: "Draait op", value: health === null ? "—" : gemini ? "Google Gemini" : health.backend === "cloudflare" ? "Cloudflare (gratis)" : health.local ? "Eigen server" : "Op afstand", hint: health?.models?.[0] ?? "geen model gemeld" },
          { label: "Sjablonen", value: presets.length, hint: "klaar voor gebruik" },
        ]}
      />

      {health && !ok && (
        <Panel title={health.configured ? "Beeldmodel niet bereikbaar" : "Nog geen beeldmodel ingesteld"} subtitle="De Studio heeft een eigen Stable Diffusion-server nodig. De snelste weg:">
          <ol className="list-decimal space-y-1 pl-5 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
            <li>Installeer <span className="font-mono text-xs">AUTOMATIC1111</span> of <span className="font-mono text-xs">Stable Diffusion WebUI Forge</span> en start met <span className="font-mono text-xs">--api --listen</span>.</li>
            <li>Download een fotorealistisch SDXL-model, bijvoorbeeld <em>RealVisXL</em>, naar de map <span className="font-mono text-xs">models/Stable-diffusion</span>.</li>
            <li>Zet in <span className="font-mono text-xs">.env</span>: <span className="font-mono text-xs">IMAGE_ENABLED=true</span>, <span className="font-mono text-xs">IMAGE_BACKEND=a1111</span>, <span className="font-mono text-xs">IMAGE_BASE_URL=http://localhost:7860</span>.</li>
            <li>Herstart de app en ververs deze pagina.</li>
          </ol>
          {health.detail && <p className="mt-2 font-mono text-xs" style={{ color: "var(--a-mute)" }}>{health.detail}</p>}
          <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
            Geen GPU? Het werkt op CPU, maar een beeld duurt dan enkele minuten. Recept: <span className="font-mono">deploy/image-node/</span>. Draait je beeldserver op afstand, zoals de AI-node via een tunnel? Zet dan ook <span className="font-mono">IMAGE_ALLOW_REMOTE=true</span>.
          </p>
        </Panel>
      )}
      {ok && health?.warning && <Notice tone="warn">{health.warning}</Notice>}
      {ok && health && !health.warning && (
        <Notice tone="ok">
          Beeldmodel bereikbaar: <span className="font-mono text-xs">{health.backend}, {health.baseUrl}{health.models?.[0] ? `, ${health.models[0]}` : ""}</span>
        </Notice>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Maken">
          <div className="space-y-4">
            <div role="group" aria-label="Manier van maken" className="grid grid-cols-3 gap-0.5 rounded-lg p-0.5" style={{ background: "var(--a-elev)" }}>
              {(["preset", "idea", "edit"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className="rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition-colors"
                  style={mode === m ? { background: "var(--a-panel)", color: "var(--a-text)", boxShadow: "var(--a-shadow-sm)" } : { color: "var(--a-mute)" }}
                >
                  {m === "preset" ? "Sjabloon" : m === "idea" ? "Eigen idee" : "Foto bewerken"}
                </button>
              ))}
            </div>

            {mode === "preset" ? (
              <label className="a-label">
                Sjabloon
                <select value={presetKey} onChange={(e) => setPresetKey(e.target.value)} className="a-input">
                  {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </label>
            ) : mode === "idea" ? (
              <div className="space-y-2">
                <label className="a-label">
                  Beschrijf het beeld
                  <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} placeholder="Bijvoorbeeld: een monteur die 's ochtends zijn bus inlaadt bij een bedrijventerrein" className="a-input" />
                </label>
                <label className="flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                  <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
                  Laat de eigen AI de beschrijving aanscherpen
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="a-label">
                  Foto om te bewerken
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setEditSrc(typeof reader.result === "string" ? reader.result : null);
                      reader.readAsDataURL(file);
                    }}
                    className="a-input"
                  />
                </label>
                {editSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editSrc} alt="Bron-foto" className="max-h-40 rounded-lg" style={{ border: "1px solid var(--a-border)" }} />
                )}
                <label className="a-label">
                  Wat moet er veranderen?
                  <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={2} placeholder="Bijvoorbeeld: maak de achtergrond wit, voeg een bouwhelm toe, verwijder het logo" className="a-input" />
                </label>
                {!gemini && <>
                <label className="a-label">
                  Hoeveel mag veranderen: {Math.round(denoise * 100)}%
                  <input type="range" min={10} max={90} value={Math.round(denoise * 100)} onChange={(e) => setDenoise(Number(e.target.value) / 100)} className="mt-3 w-full" style={{ accentColor: "var(--a-accent)" }} />
                </label>
                <p className="text-xs" style={{ color: "var(--a-mute)" }}>Laag percentage blijft dicht bij het origineel, hoog geeft meer vrijheid.</p>
                </>}
              </div>
            )}

            {mode !== "edit" && (
              <label className="a-label">
                Extra details (optioneel)
                <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="regen, blauw uur, van opzij gefotografeerd" className="a-input" />
              </label>
            )}

            {gemini && (
              <div className="grid grid-cols-2 gap-3">
                <label className="a-label">
                  Model
                  <select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value as typeof geminiModel)} className="a-input">
                    <option value="gemini-3.1-flash-image">Nano Banana 2 (snel)</option>
                    <option value="gemini-3-pro-image">Nano Banana Pro (hoogste kwaliteit)</option>
                  </select>
                </label>
                {mode !== "edit" && (
                  <label className="a-label">
                    Grootte
                    <select value={grootte} onChange={(e) => setGrootte(e.target.value as typeof grootte)} className="a-input">
                      <option value="1K">1K (snel)</option>
                      <option value="2K">2K (scherp)</option>
                      <option value="4K">4K (hoogste)</option>
                    </select>
                  </label>
                )}
              </div>
            )}

            <div className={`grid gap-3 ${gemini ? "grid-cols-1" : "grid-cols-2"}`}>
              <label className="a-label">
                Verhouding
                <select value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)} className="a-input">
                  <option value="portrait">Staand (hero)</option>
                  <option value="landscape">Liggend</option>
                  <option value="wide">Breed (16:9)</option>
                </select>
              </label>
              {!gemini && (
                <label className="a-label">
                  Stappen: {steps}
                  <input type="range" min={12} max={40} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="mt-3 w-full" style={{ accentColor: "var(--a-accent)" }} />
                </label>
              )}
            </div>

            <button
              type="button"
              onClick={mode === "edit" ? editPhoto : generate}
              disabled={busy || !ok || (mode === "idea" && !idea.trim()) || (mode === "edit" && (!editSrc || !instruction.trim()))}
              className="a-button a-button-primary w-full"
            >
              {busy ? "Bezig met maken…" : mode === "edit" ? "Foto bewerken" : "Beeld maken"}
            </button>
            {busy && <p className="text-xs" style={{ color: "var(--a-mute)" }}>{gemini ? "Dit duurt meestal 10 tot 40 seconden." : "Op een CPU kan dit een paar minuten duren. Laat het tabblad open."}</p>}
            {error && <Notice tone="crit" role="alert">{error}</Notice>}
          </div>
        </Panel>

        <Panel title="Resultaat" className="min-h-[28rem]">
          {result ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--a-border)", background: "var(--a-panel-2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/png;base64,${result.b64}`} alt="Gemaakt beeld" className="w-full" />
              </div>
              <p className="font-mono text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
                {result.width}×{result.height}
                {result.seed !== null ? `, seed ${result.seed}` : ""}
              </p>
              <div>
                <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--a-mute)" }}>Plaatsen als</p>
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((s) => (
                    <button key={s.key} type="button" onClick={() => void saveToSlot(s.key)} className={`a-button text-xs ${saved === s.key ? "a-button-primary" : ""}`}>
                      {saved === s.key ? "Geplaatst: " : ""}
                      {SLOT_LABEL[s.key] ?? s.key}
                    </button>
                  ))}
                </div>
              </div>
              <a href={`data:image/png;base64,${result.b64}`} download="zekerflex-beeld.png" className="a-button text-xs">PNG downloaden</a>
            </div>
          ) : (
            <Empty title="Nog geen beeld" body="Kies een sjabloon of beschrijf je idee en klik op Beeld maken." />
          )}
        </Panel>
      </div>

      <Panel title="Beeldplekken op de site" subtitle="Upload een eigen foto of gebruik een gemaakt beeld. Zodra er een foto staat, verdwijnt de illustratie op de site." actions={<Pill tone={live === slots.length && slots.length > 0 ? "ok" : "warn"}>{live} van {slots.length} live</Pill>}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {slots.map((s) => (
            <div key={s.key} className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--a-border)" }}>
              <div className="aspect-[4/3]" style={{ background: "var(--a-panel-2)" }}>
                {s.ready ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/marketing/${s.file}?v=${Date.now().toString(36)}`} alt={s.spec.alt} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--a-mute)" }}>Illustratie, nog geen foto</div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="truncate text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{SLOT_LABEL[s.key] ?? s.key}</span>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <label className="a-button cursor-pointer text-xs">
                    {s.ready ? "Vervangen" : "Uploaden"}
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
                  {s.ready && <button type="button" onClick={() => void removeSlot(s.key)} className="a-button text-xs" style={{ color: "var(--a-crit)" }}>Verwijderen</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
