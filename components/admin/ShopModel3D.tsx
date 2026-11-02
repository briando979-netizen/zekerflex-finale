"use client";

import { useCallback, useEffect, useState } from "react";
import { Model3DViewer } from "@/components/marketing/Model3DViewer";
import type { Model3D } from "@/lib/shop/model3d";

// 3D-model bij een webshopproduct: uploaden (.glb), meteen controleren, voorbeeld
// bekijken en weer loskoppelen. De productpagina toont dan "Bekijk in 3D".

export function ShopModel3D({ productId }: { productId: string }) {
  const [model, setModel] = useState<Model3D | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/shop/model3d?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setModel(data.model ?? null);
    setUrl(data.url ?? null);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const up = await fetch("/api/uploads", { method: "POST", body });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok) {
        setMessage(upData?.error?.message ?? "Upload mislukt.");
        return;
      }
      const res = await fetch("/api/admin/shop/model3d", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, uploadId: upData.upload.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data?.error?.message ?? "Dit model kan niet gebruikt worden.");
        return;
      }
      setModel(data.model);
      setUrl(`${data.url}?v=${Date.now()}`);
      setPreview(true);
      setMessage("3D-model gekoppeld. Het staat meteen op de productpagina.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    await fetch(`/api/admin/shop/model3d?productId=${encodeURIComponent(productId)}`, { method: "DELETE" });
    setModel(null);
    setUrl(null);
    setPreview(false);
    setBusy(false);
    setMessage("3D-model losgekoppeld.");
  };

  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--a-border)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--a-mute)" }}>3D-model (draaien, zoomen, AR)</p>
      {model && url ? (
        <>
          <p className="text-xs" style={{ color: "var(--a-dim)" }}>
            {model.filename} · {Math.round(model.bytes / 1024).toLocaleString("nl-NL")} kB · {model.meshes} {model.meshes === 1 ? "onderdeel" : "onderdelen"}
          </p>
          {preview ? <Model3DViewer src={url} alt="3D-voorbeeld" className="aspect-square w-full max-w-sm overflow-hidden rounded-lg" /> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="a-button text-xs" onClick={() => setPreview((v) => !v)}>{preview ? "Voorbeeld sluiten" : "Bekijk in 3D"}</button>
            <button type="button" className="a-button text-xs" disabled={busy} onClick={() => void remove()}>Loskoppelen</button>
          </div>
        </>
      ) : (
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>Nog geen 3D-model. Upload een .glb (glTF 2, zonder Draco-compressie, tot 25 MB).</p>
      )}
      <label className="a-button inline-flex cursor-pointer text-xs">
        {busy ? "Bezig…" : model ? "Ander model uploaden" : "3D-model uploaden"}
        <input type="file" accept=".glb,model/gltf-binary" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
      </label>
      {message && <p className="text-xs" style={{ color: "var(--a-dim)" }} role="status">{message}</p>}
    </div>
  );
}
