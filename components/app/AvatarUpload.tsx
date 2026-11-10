"use client";

import { useRef, useState } from "react";

/** Eigen teksten (bijv. in een andere taal); zonder: de Nederlandse standaard van het profiel. */
export interface AvatarUploadTexts {
  upload: string;
  change: string;
  busy: string;
  remove: string;
  hint: string;
  error: string;
  /** knop "Foto maken" (camera van de telefoon); alleen in de grote variant */
  camera?: string;
}

/** Vierkant bijsnijden rond het midden (max 800 px, JPEG) vóór het uploaden; lukt dat niet (bijv. HEIC), dan gaat het origineel mee. */
async function snijdVierkant(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const zijde = Math.min(bmp.width, bmp.height);
    const uit = Math.min(800, zijde);
    const canvas = document.createElement("canvas");
    canvas.width = uit;
    canvas.height = uit;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, (bmp.width - zijde) / 2, (bmp.height - zijde) / 2, zijde, zijde, 0, 0, uit, uit);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    return blob ? new File([blob], "profielfoto.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

export function AvatarUpload({
  userId,
  name,
  initialHasAvatar,
  texts,
  onChange,
  groot = false,
}: {
  userId: string;
  name: string;
  initialHasAvatar: boolean;
  texts?: AvatarUploadTexts;
  /** na een geslaagde upload (true) of verwijdering (false) */
  onChange?: (heeftFoto: boolean) => void;
  /** grote cirkel met een ronde camera-knop (scherm "Maak een goede eerste indruk"); de foto wordt dan vierkant bijgesneden */
  groot?: boolean;
}) {
  const tx: AvatarUploadTexts = texts ?? {
    upload: "Foto uploaden",
    change: "Wijzig foto",
    busy: "Bezig…",
    remove: "Verwijderen",
    hint: "JPG, PNG of WebP · max 8 MB. Je foto verschijnt in de chat en bij je profiel.",
    error: "Upload mislukt",
  };
  const [hasAvatar, setHasAvatar] = useState(initialHasAvatar);
  const [busy, setBusy] = useState(false);
  const [bust, setBust] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", groot ? await snijdVierkant(file) : file);
      const r = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.error?.message ?? tx.error);
      }
      setHasAvatar(true);
      setBust(Date.now());
      onChange?.(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    await fetch("/api/profile/avatar", { method: "DELETE" });
    setHasAvatar(false);
    setBust(Date.now());
    setBusy(false);
    onChange?.(false);
  };

  const invoer = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void upload(f);
        e.target.value = "";
      }}
    />
  );

  const cameraInvoer = (
    <input
      ref={cameraRef}
      type="file"
      accept="image/*"
      capture="user"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void upload(f);
        e.target.value = "";
      }}
    />
  );

  if (groot) {
    return (
      <div className="flex flex-col items-center">
        <div className="relative h-56 w-56 max-w-full">
          <span className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-neutralx-100 text-neutralx-400 ring-1 ring-hair">
            {hasAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/profile/${userId}/avatar?v=${bust}`} alt={name} className="h-full w-full object-cover" />
            ) : (
              <svg width="96" height="96" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={busy ? tx.busy : hasAvatar ? tx.change : tx.upload}
            className="absolute bottom-1 right-1 grid h-14 w-14 place-items-center rounded-full bg-brand-600 text-white shadow-lift ring-4 ring-white hover:bg-brand-700 disabled:opacity-60"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 8h3l1.5-2h5L15 8h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M11 11v5M8.5 13.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {busy && <p className="mt-2 text-xs text-neutralx-500" aria-live="polite">{tx.busy}</p>}
        {tx.camera && !busy && (
          <button type="button" onClick={() => cameraRef.current?.click()} className="btn-ghost mt-4 text-sm">
            {tx.camera}
          </button>
        )}
        {hasAvatar && !busy && (
          <button type="button" onClick={remove} className="mt-3 text-sm text-neutralx-500 underline hover:text-crit">
            {tx.remove}
          </button>
        )}
        <p className="mt-1 text-center text-xs text-neutralx-400">{tx.hint}</p>
        {err && <p role="alert" className="mt-1 text-xs text-crit">{err}</p>}
        {invoer}
        {cameraInvoer}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="grid h-16 w-16 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-semibold text-white">
        {hasAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/profile/${userId}/avatar?v=${bust}`} alt={name} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </span>
      <div>
        <div className="flex gap-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-ghost text-sm">
            {busy ? tx.busy : hasAvatar ? tx.change : tx.upload}
          </button>
          {hasAvatar && (
            <button type="button" onClick={remove} disabled={busy} className="text-sm text-neutralx-500 hover:text-crit">
              {tx.remove}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-neutralx-400">{tx.hint}</p>
        {err && <p role="alert" className="mt-1 text-xs text-crit">{err}</p>}
      </div>
      {invoer}
    </div>
  );
}
