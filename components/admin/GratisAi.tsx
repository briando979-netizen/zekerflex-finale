"use client";

import { useEffect, useState } from "react";

interface Stand {
  aan: boolean;
  basis: string;
  model: string;
  standaardBasis: string;
  standaardModel: string;
}

// De knop "alles gratis": zet élke AI-taak over naar ons eigen model op de
// VPS in plaats van een betaalde aanbieder. Werkt zonder uitrol (KV).
export function GratisAi() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  function neem(d: Stand) {
    setStand(d);
    setBasis(d.basis);
    setModel(d.model);
  }

  useEffect(() => {
    void fetch("/api/admin/ai-node/gratis")
      .then((r) => r.json())
      .then((d) => neem(d as Stand))
      .catch(() => setFout("De stand kon niet worden opgehaald."));
  }, []);

  async function bewaar(next: { aan?: boolean; basis?: string; model?: string }) {
    setBusy(true);
    setMsg(null);
    setFout(null);
    try {
      const r = await fetch("/api/admin/ai-node/gratis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Opslaan mislukt");
      neem(d as Stand);
      setMsg(
        next.aan === true
          ? "Aan — alle AI draait nu op onze eigen server. Dit kost niets meer."
          : next.aan === false
            ? "Uit — de AI gaat weer naar de ingestelde aanbieder."
            : "Opgeslagen.",
      );
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const aan = stand?.aan === true;

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
            Alles gratis — AI op onze eigen server
          </p>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
            Staat dit aan, dan gaat élke AI-taak naar ons eigen model op de VPS: dat kost niets per vraag en de
            gegevens blijven op onze eigen server.
          </p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--a-warn-ink, var(--a-mute))" }}>
            <strong>Eerlijk gemeten op 6 november.</strong> Onze server heeft vijf processors en geen videokaart.
            Het model doet er dan ongeveer acht seconden over een kort antwoord, en het kent ZekerFlex niet uit
            zichzelf: op de vraag wat ZekerFlex doet, antwoordde het over &ldquo;winstprocenten vaststellen&rdquo;.
            Een groter model (qwen3:4b) was nóg trager: ruim vier minuten per antwoord. Zet dit dus aan als het
            tegoed bij de aanbieder op is of je even helemaal zelfstandig wilt draaien — niet als vaste keuze voor
            teksten die een klant leest.
          </p>
          <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
            Je hoeft hier niets voor te doen bij een storing: valt de betaalde aanbieder weg of geeft hij een
            foutcode, dan antwoordt onze eigen server al automatisch (het reservemodel).
          </p>
        </div>
        <button
          type="button"
          disabled={busy || stand === null}
          onClick={() => void bewaar({ aan: !aan })}
          aria-pressed={aan}
          className={aan ? "a-btn a-btn-primary disabled:opacity-50" : "a-btn a-btn-ghost disabled:opacity-50"}
        >
          {stand === null ? "Laden…" : aan ? "Aan — zet uit" : "Zet aan"}
        </button>
      </div>

      {stand !== null && (
        <p className="mt-3 text-xs" style={{ color: aan ? "var(--a-ok, #16a34a)" : "var(--a-mute)" }}>
          {aan
            ? `✓ Eigen server: ${stand.basis || stand.standaardBasis} · model: ${stand.model || stand.standaardModel}`
            : "Uit: de AI gebruikt de aanbieder uit de instellingen (betaald)."}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-3 text-xs underline"
        style={{ color: "var(--a-mute)" }}
      >
        {open ? "Eigen server en model verbergen" : "Eigen server en model zelf kiezen"}
      </button>

      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="block text-xs" style={{ color: "var(--a-mute)" }}>
            Eigen AI-server
            <input
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
              placeholder={stand?.standaardBasis ?? "http://ollama:11434/v1"}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--a-bg, #0b0b0c)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
            />
          </label>
          <label className="block text-xs" style={{ color: "var(--a-mute)" }}>
            Model op die server
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={stand?.standaardModel ?? ""}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--a-bg, #0b0b0c)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void bewaar({ basis, model })}
              className="a-btn a-btn-ghost disabled:opacity-50"
            >
              Opslaan
            </button>
            <span className="ml-2 text-xs" style={{ color: "var(--a-mute)" }}>
              Leeg laten = de standaard gebruiken.
            </span>
          </div>
        </div>
      )}

      {msg && (
        <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
          {msg}
        </p>
      )}
      {fout && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--a-bad, #dc2626)" }}>
          {fout}
        </p>
      )}
    </div>
  );
}
