"use client";

import { useEffect, useState } from "react";
import { MediaKiezer } from "@/components/admin/ontwerper/Media";
import type { FotoKeuze } from "@/lib/ontwerp/fotos";

// ---------------------------------------------------------------------------
// Tabblad Media, bovenaan: de vaste foto's van de site (homepage, Voor
// bedrijven, Over ons …) vervangen door een foto uit de bibliotheek. Meteen
// live en blijvend (de bibliotheek staat op het opslagvolume, niet in de
// container); "Standaardfoto" zet de oorspronkelijke terug.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mute = { color: "var(--a-mute)" };

interface Plek {
  key: string;
  plek: string;
  aspect: "portrait" | "landscape" | "wide";
  standaardAlt: string;
  standaard: string | null;
  keuze: FotoKeuze | null;
}

function PlekRij({ p, bezig, onKies, onAlt, onStandaard }: { p: Plek; bezig: boolean; onKies: (media: string) => void; onAlt: (alt: string) => void; onStandaard: () => void }) {
  const [kiezen, setKiezen] = useState(false);
  const [alt, setAlt] = useState(p.keuze?.alt ?? "");
  useEffect(() => setAlt(p.keuze?.alt ?? ""), [p.keuze?.alt, p.keuze?.media]);
  const bron = p.keuze ? `/beeld/${p.keuze.media}?klein=1` : p.standaard;
  return (
    <li className="space-y-2 rounded-xl p-3" style={paneel}>
      <div className="flex items-start gap-3">
        {bron ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bron} alt="" className="h-16 w-24 flex-shrink-0 rounded-md object-cover" />
        ) : (
          <span className="grid h-16 w-24 flex-shrink-0 place-items-center rounded-md text-[11px]" style={{ background: "var(--a-elev)", color: "var(--a-mute)" }}>
            Tekening
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
            {p.plek}
          </p>
          <p className="text-[11px]" style={mute}>
            {p.keuze ? "Eigen foto uit de bibliotheek" : "Standaardfoto"} · {p.aspect === "portrait" ? "staand" : p.aspect === "wide" ? "breed" : "liggend"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setKiezen((k) => !k)} disabled={bezig} className="a-button text-xs" aria-expanded={kiezen}>
              {kiezen ? "Sluiten" : "Andere foto kiezen"}
            </button>
            {p.keuze ? (
              <button type="button" onClick={onStandaard} disabled={bezig} className="a-button text-xs">
                Standaardfoto
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {p.keuze ? (
        <label className="block">
          <span className="mb-1 block text-[11px]" style={mute}>
            Beschrijving voor schermlezers en Google (leeg = &ldquo;{p.standaardAlt}&rdquo;)
          </span>
          <input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onBlur={() => {
              if (alt.trim() !== (p.keuze?.alt ?? "")) onAlt(alt.trim());
            }}
            maxLength={200}
            className="w-full rounded-lg px-2 py-1 text-xs"
            style={veld}
          />
        </label>
      ) : null}
      {kiezen ? (
        <MediaKiezer
          soort="foto"
          gekozen={p.keuze?.media ?? ""}
          onKies={(id) => {
            setKiezen(false);
            if (id) onKies(id);
            else onStandaard();
          }}
          onSluit={() => setKiezen(false)}
        />
      ) : null}
    </li>
  );
}

export function SiteFotos({ onVernieuw }: { onVernieuw: () => void }) {
  const [plekken, setPlekken] = useState<Plek[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/admin/ontwerp/fotos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { plekken?: Plek[] } | null) => setPlekken(d?.plekken ?? []))
      .catch(() => setPlekken([]));
  }, []);

  async function stuur(init: RequestInit, url = "/api/admin/ontwerp/fotos", klaar = "Live. Het voorbeeld toont de nieuwe foto.") {
    setBezig(true);
    setMelding(null);
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const d = (await r.json().catch(() => null)) as { plekken?: Plek[]; error?: { message?: string } } | null;
      if (!r.ok || !d?.plekken) throw new Error(d?.error?.message ?? "Dat lukte niet.");
      setPlekken(d.plekken);
      setMelding({ tekst: klaar });
      onVernieuw();
    } catch (e) {
      setMelding({ tekst: e instanceof Error ? e.message : "Dat lukte niet.", fout: true });
    } finally {
      setBezig(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl p-4" style={paneel}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        Foto&apos;s van de site
      </h2>
      <p className="text-xs" style={mute}>
        De vaste foto&apos;s op de homepage en de andere pagina&apos;s. Kies een foto uit de bibliotheek (of upload er een); dat staat meteen live en blijft staan na een update van de site.
      </p>
      {melding ? (
        <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
          {melding.tekst}
        </p>
      ) : null}
      {plekken === null ? (
        <p className="text-xs" style={mute}>
          Laden…
        </p>
      ) : (
        <ul className="space-y-2">
          {plekken.map((p) => (
            <PlekRij
              key={p.key}
              p={p}
              bezig={bezig}
              onKies={(media) => stuur({ method: "PUT", body: JSON.stringify({ plek: p.key, media, alt: p.keuze?.media === media ? p.keuze.alt : "" }) })}
              onAlt={(alt) => p.keuze && stuur({ method: "PUT", body: JSON.stringify({ plek: p.key, media: p.keuze.media, alt }) }, undefined, "Beschrijving bewaard.")}
              onStandaard={() => stuur({ method: "DELETE" }, `/api/admin/ontwerp/fotos?plek=${p.key}`, "De standaardfoto staat weer live.")}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
