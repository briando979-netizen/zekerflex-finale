"use client";

import { useRef, useState } from "react";

export function AvatarUpload({
  userId,
  name,
  initialHasAvatar,
}: {
  userId: string;
  name: string;
  initialHasAvatar: boolean;
}) {
  const [hasAvatar, setHasAvatar] = useState(initialHasAvatar);
  const [busy, setBusy] = useState(false);
  const [bust, setBust] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.error?.message ?? "Upload mislukt");
      }
      setHasAvatar(true);
      setBust(Date.now());
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
  };

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
            {busy ? "Bezig…" : hasAvatar ? "Wijzig foto" : "Foto uploaden"}
          </button>
          {hasAvatar && (
            <button type="button" onClick={remove} disabled={busy} className="text-sm text-neutralx-500 hover:text-crit">
              Verwijderen
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-neutralx-400">JPG, PNG of WebP · max 8 MB. Je foto verschijnt in de chat en bij je profiel.</p>
        {err && <p className="mt-1 text-xs text-crit">{err}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
    </div>
  );
}
