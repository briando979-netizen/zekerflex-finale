"use client";

import { useCallback, useEffect, useState, type DragEvent } from "react";

// ---------------------------------------------------------------------------
// Media-bibliotheek (Site-ontwerper → Media) en de kiezer die de blokken
// gebruiken. Uploaden met de knop of door te slepen; foto's worden op de
// server schoongemaakt (geen locatie, WebP), video's alleen MP4/WebM.
// ---------------------------------------------------------------------------

export interface MediaItem {
  id: string;
  soort: "foto" | "video";
  naam: string;
  alt: string;
  bytes: number;
  breedte: number | null;
  hoogte: number | null;
  op: string;
}

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const veld = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };
const mb = (b: number) => `${(b / 1_000_000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`;

export function useMedia() {
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const laad = useCallback(() => {
    fetch("/api/admin/ontwerp/media", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { media?: MediaItem[] } | null) => setMedia(d?.media ?? []))
      .catch(() => setMedia([]));
  }, []);
  useEffect(laad, [laad]);
  return { media, setMedia, laad };
}

async function upload(bestanden: File[], onItem: (m: MediaItem) => void): Promise<string | null> {
  for (const f of bestanden) {
    const fd = new FormData();
    fd.append("bestand", f);
    const r = await fetch("/api/admin/ontwerp/media", { method: "POST", body: fd });
    const d = (await r.json().catch(() => null)) as { item?: MediaItem; error?: { message?: string } } | null;
    if (!r.ok || !d?.item) return d?.error?.message ?? `Uploaden van ${f.name} lukte niet.`;
    onItem(d.item);
  }
  return null;
}

function Uploadvak({ onItem, accept }: { onItem: (m: MediaItem) => void; accept: string }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [boven, setBoven] = useState(false);
  const verwerk = async (lijst: FileList | null) => {
    if (!lijst?.length) return;
    setBezig(true);
    setFout(null);
    setFout(await upload([...lijst], onItem));
    setBezig(false);
  };
  const sleep = (e: DragEvent) => {
    e.preventDefault();
    setBoven(false);
    void verwerk(e.dataTransfer.files);
  };
  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setBoven(true);
        }}
        onDragLeave={() => setBoven(false)}
        onDrop={sleep}
        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl p-5 text-center text-sm"
        style={{ border: `2px dashed ${boven ? "var(--a-accent)" : "var(--a-border-strong)"}`, background: boven ? "var(--a-accent-soft)" : "var(--a-elev)", color: "var(--a-text)" }}
      >
        <input type="file" accept={accept} multiple className="sr-only" onChange={(e) => void verwerk(e.target.files)} disabled={bezig} />
        <span className="font-semibold">{bezig ? "Bezig met uploaden…" : "Sleep hier foto's of video's, of klik om te kiezen"}</span>
        <span className="text-xs" style={{ color: "var(--a-mute)" }}>
          Foto tot 15 MB (JPG, PNG, WebP), video tot 80 MB (MP4 of WebM)
        </span>
      </label>
      {fout ? (
        <p role="alert" className="mt-2 text-xs font-semibold" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      ) : null}
    </div>
  );
}

function Tegel({ m, actief = false }: { m: MediaItem; actief?: boolean }) {
  return (
    <span className="relative block aspect-square overflow-hidden rounded-lg" style={{ background: "var(--a-elev)", outline: actief ? "3px solid var(--a-accent)" : "none" }}>
      {m.soort === "foto" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/beeld/${m.id}?klein=1`} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center text-3xl" aria-hidden="true">
          ▶
        </span>
      )}
      {m.soort === "video" ? <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 text-[10px] font-semibold text-white">Video</span> : null}
    </span>
  );
}

function MediaRij({ m, onWijzig, onWeg }: { m: MediaItem; onWijzig: (m: MediaItem) => void; onWeg: (id: string) => void }) {
  const [alt, setAlt] = useState(m.alt);
  const [status, setStatus] = useState<string | null>(null);
  const bewaar = async () => {
    if (alt === m.alt) return;
    const r = await fetch("/api/admin/ontwerp/media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: m.id, alt }) });
    const d = (await r.json().catch(() => null)) as { item?: MediaItem } | null;
    if (r.ok && d?.item) {
      onWijzig(d.item);
      setStatus("Bewaard");
    } else setStatus("Bewaren lukte niet");
  };
  return (
    <li className="flex gap-3 rounded-xl p-2" style={paneel}>
      <span className="w-20 flex-shrink-0">
        <Tegel m={m} />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="block truncate text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          {m.naam}
        </span>
        <span className="block text-[11px]" style={{ color: "var(--a-mute)" }}>
          {m.soort === "foto" ? `${m.breedte} × ${m.hoogte} px` : "Video"} · {mb(m.bytes)}
        </span>
        {m.soort === "foto" ? (
          <label className="block">
            <span className="sr-only">Omschrijving van {m.naam}</span>
            <input value={alt} onChange={(e) => setAlt(e.target.value)} onBlur={bewaar} maxLength={200} placeholder="Wat staat erop? (voor schermlezers en Google)" className="w-full rounded-lg px-2 py-1 text-xs" style={veld} />
          </label>
        ) : null}
        <span className="flex items-center gap-3 text-[11px]">
          <a href={`/beeld/${m.id}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--a-accent-ink)" }}>
            Openen ↗
          </a>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`"${m.naam}" verwijderen? Op pagina's waar hij staat, blijft die plek dan leeg.`)) onWeg(m.id);
            }}
            className="font-semibold hover:underline"
            style={{ color: "var(--a-crit)" }}
          >
            Verwijderen
          </button>
          {status ? <span style={{ color: "var(--a-mute)" }}>{status}</span> : null}
        </span>
      </span>
    </li>
  );
}

export function MediaPaneel() {
  const { media, setMedia } = useMedia();
  const weg = async (id: string) => {
    const r = await fetch(`/api/admin/ontwerp/media?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (r.ok) setMedia((cur) => (cur ?? []).filter((m) => m.id !== id));
  };
  return (
    <div className="space-y-3">
      <section className="space-y-3 rounded-xl p-4" style={paneel}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          Media-bibliotheek
        </h3>
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Foto&apos;s en video&apos;s voor je eigen pagina&apos;s. Ze staan op onze eigen server; bezoekers laden niets van anderen.
        </p>
        <Uploadvak accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm" onItem={(m) => setMedia((cur) => [m, ...(cur ?? [])])} />
      </section>
      {media === null ? (
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Laden…
        </p>
      ) : media.length ? (
        <ul className="space-y-2">
          {media.map((m) => (
            <MediaRij key={m.id} m={m} onWijzig={(n) => setMedia((cur) => (cur ?? []).map((x) => (x.id === n.id ? n : x)))} onWeg={weg} />
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          Nog niets geüpload.
        </p>
      )}
    </div>
  );
}

/** Een foto of video kiezen voor een blok, met uploaden erbij. */
export function MediaKiezer({ soort, gekozen, onKies, onSluit }: { soort: "foto" | "video"; gekozen: string; onKies: (id: string) => void; onSluit: () => void }) {
  const { media, setMedia } = useMedia();
  const lijst = (media ?? []).filter((m) => m.soort === soort);
  return (
    <div className="space-y-2 rounded-xl p-3" style={{ ...paneel, borderColor: "var(--a-accent)" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
          Kies een {soort === "foto" ? "foto" : "video"}
        </p>
        <button type="button" onClick={onSluit} className="text-xs font-semibold hover:underline" style={{ color: "var(--a-mute)" }}>
          Sluiten
        </button>
      </div>
      <Uploadvak accept={soort === "foto" ? "image/jpeg,image/png,image/webp,image/avif" : "video/mp4,video/webm"} onItem={(m) => setMedia((cur) => [m, ...(cur ?? [])])} />
      {media === null ? (
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Laden…
        </p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {gekozen ? (
            <button type="button" onClick={() => onKies("")} className="grid aspect-square place-items-center rounded-lg text-[11px] font-semibold" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
              Geen
            </button>
          ) : null}
          {lijst.map((m) => (
            <button key={m.id} type="button" onClick={() => onKies(m.id)} aria-label={`Kies ${m.naam}`} aria-pressed={m.id === gekozen}>
              <Tegel m={m} actief={m.id === gekozen} />
            </button>
          ))}
        </div>
      )}
      {media !== null && !lijst.length ? (
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Nog geen {soort === "foto" ? "foto's" : "video's"}. Upload er hierboven een.
        </p>
      ) : null}
    </div>
  );
}

export function MediaVoorbeeld({ id, soort }: { id: string; soort: "foto" | "video" }) {
  if (!id) return null;
  return soort === "foto" ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/beeld/${id}?klein=1`} alt="" className="h-16 w-24 rounded-md object-cover" />
  ) : (
    <span className="grid h-16 w-24 place-items-center rounded-md text-xs font-semibold" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
      ▶ Video
    </span>
  );
}
