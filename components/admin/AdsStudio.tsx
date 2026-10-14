"use client";

import { useEffect, useState } from "react";
import { APanel } from "@/components/admin/ui";

interface Ad {
  id: string;
  audience: "freelancer" | "werkgever";
  angle: string | null;
  headline: string;
  subheadline: string;
  body: string;
  cta: string;
  imageB64: string | null;
  imageMimeType: string | null;
  createdAt: string;
}

export function AdsStudio() {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [audience, setAudience] = useState<"freelancer" | "werkgever">("freelancer");
  const [angle, setAngle] = useState("");
  const [withImage, setWithImage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/ads", { cache: "no-store" });
    if (res.ok) setAds((await res.json()).ads);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/ads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience, angle: angle || undefined, withImage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Genereren mislukt");
      setAngle("");
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Deze advertentie verwijderen?")) return;
    const res = await fetch(`/api/admin/ads/${id}`, { method: "DELETE" });
    if (res.ok) void refresh();
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-6"
        style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}
      >
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--a-text)" }}>
          Advertentiegenerator
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--a-mute)" }}>
          Genereert tekst + beeld lokaal, op basis van echte, vaste feiten over {"ZekerFlex"} — de AI verzint geen
          cijfers of claims. Dit publiceert niets automatisch; je download en plaatst zelf.
        </p>
      </div>

      <APanel title="Nieuwe advertentie">
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["freelancer", "werkgever"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className="rounded-full border px-3 py-1.5 text-xs font-medium"
                style={
                  audience === a
                    ? { background: "#10b981", color: "#06241a", borderColor: "#10b981" }
                    : { borderColor: "var(--a-border)", color: "var(--a-dim)" }
                }
              >
                {a === "freelancer" ? "Voor freelancers" : "Voor werkgevers"}
              </button>
            ))}
          </div>
          <input
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="Invalshoek (optioneel), bijv. 'zelfde dag uitbetaald'"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--a-panel-2)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
          />
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-dim)" }}>
            <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} />
            Ook een beeld genereren (kan traag zijn op CPU)
          </label>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: "#10b981", color: "#06241a" }}
          >
            {busy ? "Bezig…" : "Genereer advertentie"}
          </button>
        </div>
      </APanel>

      <APanel title="Gegenereerde advertenties" {...(ads ? { subtitle: `${ads.length} opgeslagen` } : {})}>
        {!ads ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>
        ) : ads.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen advertenties gegenereerd.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {ads.map((ad) => (
              <div key={ad.id} className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--a-border)" }}>
                {ad.imageB64 && (
                  // eslint-disable-next-line @next/next/no-img-element -- locally generated base64, not a remote/optimizable asset
                  <img
                    src={`data:${ad.imageMimeType};base64,${ad.imageB64}`}
                    alt={ad.headline}
                    className="h-48 w-full object-cover"
                  />
                )}
                <div className="p-3">
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>
                    {ad.audience === "freelancer" ? "Freelancers" : "Werkgevers"}
                  </p>
                  <p className="mt-1 text-sm font-bold" style={{ color: "var(--a-text)" }}>{ad.headline}</p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--a-dim)" }}>{ad.subheadline}</p>
                  <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>{ad.body}</p>
                  <p className="mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(16,185,129,0.15)", color: "#4ade80" }}>
                    {ad.cta}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <button type="button" onClick={() => remove(ad.id)} className="text-[11px]" style={{ color: "var(--a-mute)" }}>
                      Verwijderen
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </APanel>
    </div>
  );
}
