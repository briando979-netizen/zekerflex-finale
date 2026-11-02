"use client";

import { useEffect, useState } from "react";
import { count, dateNl } from "@/lib/admin/format";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";

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

const AUDIENCE: Record<Ad["audience"], string> = { freelancer: "Freelancers", werkgever: "Werkgevers" };

export function AdsStudio() {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [audience, setAudience] = useState<"freelancer" | "werkgever">("freelancer");
  const [angle, setAngle] = useState("");
  const [withImage, setWithImage] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [show, setShow] = useState<"alle" | Ad["audience"]>("alle");

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

  function copyText(ad: Ad) {
    const text = [ad.headline, ad.subheadline, "", ad.body, "", ad.cta].join("\n");
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(ad.id);
      setTimeout(() => setCopied((c) => (c === ad.id ? null : c)), 1800);
    });
  }

  const list = ads ?? [];
  const shown = show === "alle" ? list : list.filter((a) => a.audience === show);

  return (
    <div className="space-y-4">
      <PageHead
        title="Advertenties"
        subtitle="Maakt tekst en beeld op je eigen server, op basis van vaste feiten over ZekerFlex: de AI verzint geen cijfers of claims. Er wordt niets automatisch gepubliceerd. Je kopieert of downloadt en plaatst zelf."
      />

      <KpiStrip
        items={[
          { label: "Advertenties", value: ads ? count(list.length) : "—", hint: "opgeslagen" },
          { label: "Voor freelancers", value: ads ? count(list.filter((a) => a.audience === "freelancer").length) : "—" },
          { label: "Voor werkgevers", value: ads ? count(list.filter((a) => a.audience === "werkgever").length) : "—" },
          { label: "Met beeld", value: ads ? count(list.filter((a) => a.imageB64).length) : "—" },
        ]}
      />

      <Panel title="Nieuwe advertentie" subtitle="Kies voor wie, en eventueel een invalshoek">
        <div className="space-y-3">
          <div role="group" aria-label="Doelgroep" className="inline-flex rounded-lg p-0.5" style={{ background: "var(--a-elev)" }}>
            {(["freelancer", "werkgever"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                aria-pressed={audience === a}
                className="rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition-colors"
                style={audience === a ? { background: "var(--a-panel)", color: "var(--a-text)", boxShadow: "var(--a-shadow-sm)" } : { color: "var(--a-mute)" }}
              >
                Voor {AUDIENCE[a].toLowerCase()}
              </button>
            ))}
          </div>
          <input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Invalshoek (optioneel), bijvoorbeeld: zelfde dag uitbetaald" aria-label="Invalshoek" className="a-input" />
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--a-dim)" }}>
            <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} />
            Ook een beeld maken (kan even duren)
          </label>
          {err && <Notice tone="crit" role="alert">{err}</Notice>}
          <button type="button" onClick={() => void generate()} disabled={busy} className="a-button a-button-primary">{busy ? "Bezig…" : "Advertentie maken"}</button>
        </div>
      </Panel>

      <Panel
        flush
        title="Gemaakte advertenties"
        actions={
          <div role="group" aria-label="Tonen" className="flex gap-0.5">
            {(["alle", "freelancer", "werkgever"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setShow(f)}
                aria-pressed={show === f}
                className="rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-colors"
                style={show === f ? { background: "var(--a-elev)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}
              >
                {f === "alle" ? "Alle" : AUDIENCE[f]}
              </button>
            ))}
          </div>
        }
      >
        {!ads ? (
          <div className="mx-5 mb-5 h-40 animate-pulse rounded-lg" style={{ background: "var(--a-elev)" }} />
        ) : shown.length === 0 ? (
          <Empty title="Nog geen advertenties" body="Maak hierboven je eerste advertentie." />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
            {shown.map((ad) => (
              <article key={ad.id} className="flex flex-col overflow-hidden rounded-xl" style={{ border: "1px solid var(--a-border)", background: "var(--a-panel)" }}>
                {ad.imageB64 ? (
                  // eslint-disable-next-line @next/next/no-img-element -- locally generated base64, not a remote/optimizable asset
                  <img src={`data:${ad.imageMimeType};base64,${ad.imageB64}`} alt={ad.headline} className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] w-full place-items-center px-6 text-center text-sm font-semibold" style={{ background: "var(--a-panel-2)", color: "var(--a-dim)" }}>{ad.headline}</div>
                )}
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone={ad.audience === "freelancer" ? "ok" : "plan"}>{AUDIENCE[ad.audience]}</Pill>
                    <span className="text-xs" style={{ color: "var(--a-mute)" }}>{dateNl(ad.createdAt, { day: "numeric", month: "short" })}</span>
                  </div>
                  <p className="mt-2.5 text-[0.9375rem] font-semibold leading-snug" style={{ color: "var(--a-text)" }}>{ad.headline}</p>
                  <p className="mt-1 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>{ad.subheadline}</p>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>{ad.body}</p>
                  <p className="mt-3 text-xs font-semibold" style={{ color: "var(--a-accent-ink)" }}>{ad.cta} →</p>
                  {ad.angle && <p className="mt-1 text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>Invalshoek: {ad.angle}</p>}
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    <button type="button" onClick={() => copyText(ad)} className="a-button text-xs">{copied === ad.id ? "Gekopieerd" : "Tekst kopiëren"}</button>
                    {ad.imageB64 && (
                      <a href={`data:${ad.imageMimeType};base64,${ad.imageB64}`} download={`zekerflex-advertentie-${ad.id}.${ad.imageMimeType?.split("/")[1] ?? "png"}`} className="a-button text-xs">Beeld downloaden</a>
                    )}
                    <button type="button" onClick={() => void remove(ad.id)} className="a-button ml-auto text-xs" style={{ color: "var(--a-crit)" }}>Verwijderen</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
