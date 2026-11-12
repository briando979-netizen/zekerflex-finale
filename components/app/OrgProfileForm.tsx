"use client";

import { useRef, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";

export function OrgProfileForm({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: { websiteUrl?: string; about?: string; hasPhoto: boolean };
}) {
  const o = useT().orgForm;
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl ?? "");
  const [about, setAbout] = useState(initial.about ?? "");
  const [hasPhoto, setHasPhoto] = useState(initial.hasPhoto);
  const [bust, setBust] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/api/orgs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl, about }),
      });
      setMsg(r.ok ? o.opgeslagen : o.mislukt);
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/orgs/photo", { method: "POST", body: fd });
    if (r.ok) {
      setHasPhoto(true);
      setBust(Date.now());
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="field-label">{o.foto}</p>
        <div className="mt-2 flex items-center gap-4">
          <span className="grid h-20 w-32 place-items-center overflow-hidden rounded-lg bg-paper-soft text-xs text-neutralx-400">
            {hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/orgs/${tenantId}/photo?v=${bust}`} alt="" className="h-full w-full object-cover" />
            ) : (
              o.geenFoto
            )}
          </span>
          <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost text-sm">
            {hasPhoto ? o.wijzig : o.upload}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPhoto(f);
            }}
          />
        </div>
      </div>

      <label className="block">
        <span className="field-label">{o.website}</span>
        <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="field-input" placeholder={o.websitePlaceholder} />
      </label>

      <label className="block">
        <span className="field-label">{o.over}</span>
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={4} className="field-input" placeholder={o.overPlaceholder} />
      </label>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? o.bezig : o.opslaan}
        </button>
        {msg && <span className="text-sm text-neutralx-500">{msg}</span>}
      </div>
    </div>
  );
}
