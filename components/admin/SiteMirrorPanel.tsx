"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoList, KpiStrip, Notice, Pill } from "@/components/admin/kit";
import type { MirrorRecord } from "@/lib/website/mirror";
import type { SiteVerification } from "@/lib/website/verify";
import type { Finding } from "@/lib/website-check/analyze";

// Website-verhuizer per klant: eigendom bewijzen → kopie met verbeteringen →
// voorbeeld en score voor/na. Live zetten volgt in een volgende stap.

type State = { host: string | null; record: string; verification: SiteVerification | null; mirror: MirrorRecord | null };

const mb = (bytes: number) => `${(bytes / 1e6).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`;
const when = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const open = (f: Finding[]) => f.filter((x) => x.status !== "goed");

export function SiteMirrorPanel({ siteId }: { siteId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirmAdmin, setConfirmAdmin] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/website/mirror?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setState(data as State);
    else setMessage(data?.error?.message ?? "Laden mislukt.");
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Zolang er een kopie loopt: elke twee seconden de voortgang ophalen.
  const running = state?.mirror?.status === "bezig";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [running, load]);

  const act = async (action: "check-dns" | "admin-verify" | "start") => {
    setBusy(action);
    setMessage("");
    try {
      const res = await fetch("/api/admin/website/mirror", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, siteId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(data?.error?.message ?? "Mislukt.");
      else if (action === "check-dns" && !data.ok) setMessage("De TXT-regel is nog niet gevonden. Een DNS-wijziging kan tot een uur duren.");
      await load();
    } finally {
      setBusy(null);
      setConfirmAdmin(false);
    }
  };

  if (!state) return <div className="mt-3 h-16 animate-pulse rounded-lg" style={{ background: "var(--a-elev)" }} />;
  const m = state.mirror;
  const v = state.verification;
  const remaining = m?.after ? open(m.after.findings) : [];
  const fixed = m?.before && m.after ? open(m.before.findings).filter((b) => !remaining.some((a) => a.id === b.id)) : [];
  const up = m?.upgrades;

  return (
    <div className="mt-4 space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--a-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Website-verhuizer</p>
        {v ? <Pill tone="trust">Eigendom bewezen {v.method === "dns" ? "via DNS" : "door beheerder"}</Pill> : <Pill tone="warn">Eigendom nog niet bewezen</Pill>}
      </div>
      {message && <Notice tone="warn" role="alert">{message}</Notice>}

      {!v && (
        <div className="space-y-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
          <p>
            We kopiëren alleen een site waarvan de klant aantoont dat hij van hem is. Laat de klant bij zijn domein <strong style={{ color: "var(--a-text)" }}>{state.host}</strong> deze TXT-regel toevoegen (op het domein zelf of op _zekerflex):
          </p>
          <code className="block break-all rounded-lg px-3 py-2 font-mono text-xs" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>{state.record}</code>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="a-button text-xs" disabled={busy !== null} onClick={() => void act("check-dns")}>{busy === "check-dns" ? "Controleren…" : "Controleer DNS"}</button>
            {confirmAdmin ? (
              <>
                <button type="button" className="a-button text-xs" disabled={busy !== null} onClick={() => void act("admin-verify")}>Ja, ik weet zeker dat {state.host} van deze klant is</button>
                <button type="button" className="a-button text-xs" onClick={() => setConfirmAdmin(false)}>Annuleren</button>
              </>
            ) : (
              <button type="button" className="a-button text-xs" onClick={() => setConfirmAdmin(true)}>Eigendom zelf vastgesteld</button>
            )}
          </div>
        </div>
      )}

      {v && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="a-button a-button-primary text-xs" disabled={busy !== null || running} onClick={() => void act("start")}>
            {running ? "Kopie wordt gemaakt…" : m ? "Nieuwe kopie maken" : "Maak kopie met verbeteringen"}
          </button>
          {running && m && (
            <span className="text-xs" style={{ color: "var(--a-mute)" }} role="status">
              {m.progress.pages} pagina&apos;s en {m.progress.assets} bestanden opgehaald
            </span>
          )}
        </div>
      )}

      {m?.status === "mislukt" && <Notice tone="crit" role="alert">Kopie mislukt: {m.error}</Notice>}

      {m?.status === "klaar" && m.before && m.after && up && (
        <div className="space-y-3">
          <KpiStrip
            items={[
              { label: "Score", value: `${m.before.score} → ${m.after.score}`, delta: m.after.score - m.before.score, hint: "homepage, zelfde meting" },
              { label: "Pagina's", value: m.pages.length, hint: `${m.assets} bestanden` },
              { label: "Grootte kopie", value: mb(m.bytes), hint: up.bytesSaved > 0 ? `${mb(up.bytesSaved)} bespaard op beeld` : "geen beeld te verkleinen" },
              { label: "Kapotte links", value: m.brokenLinks.length, ...(m.brokenLinks.length > 0 ? { tone: "warn" as const } : {}), hint: "op de originele site" },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <a className="a-button a-button-primary text-xs" href={`/website-preview/${m.id}/`} target="_blank" rel="noopener noreferrer">Bekijk het voorbeeld</a>
            <a className="a-button text-xs" href={m.origin} target="_blank" rel="noopener noreferrer">Originele site</a>
            <span className="self-center text-xs" style={{ color: "var(--a-mute)" }}>Gemaakt {when(m.finishedAt ?? m.startedAt)}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold" style={{ color: "var(--a-mute)" }}>Automatisch verbeterd</p>
              <InfoList
                rows={[
                  { label: "Afbeeldingen pas laden bij scrollen", value: up.lazyImages },
                  { label: "Afbeeldingen verkleind", value: up.imagesCompressed },
                  { label: "Onveilige http-verwijzingen", value: up.httpsFixed },
                  { label: "Telefoon-instelling toegevoegd", value: up.viewportAdded },
                  { label: "Omschrijving voor Google", value: up.descriptionAdded },
                  { label: "Deel-preview (WhatsApp, LinkedIn)", value: up.socialAdded },
                  { label: "Taal van de pagina", value: up.langAdded },
                  { label: "Versienummer verborgen", value: up.generatorRemoved },
                  { label: "Sitemap gemaakt", value: up.sitemapAdded ? "ja" : "had er al een" },
                ]}
              />
            </div>
            <div className="space-y-3">
              {fixed.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold" style={{ color: "var(--a-mute)" }}>Opgelost in de kopie</p>
                  <ul className="space-y-1 text-[0.8125rem]">
                    {fixed.map((f) => (
                      <li key={f.id} className="flex gap-2" style={{ color: "var(--a-text)" }}><Pill tone="ok">Opgelost</Pill>{f.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {remaining.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold" style={{ color: "var(--a-mute)" }}>Nog te doen bij livegang of met de hand</p>
                  <ul className="space-y-1 text-[0.8125rem]">
                    {remaining.map((f) => (
                      <li key={f.id} className="flex gap-2" style={{ color: "var(--a-text)" }}><Pill tone={f.status === "probleem" ? "crit" : "warn"}>{f.status === "probleem" ? "Probleem" : "Let op"}</Pill>{f.title}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          {m.dynamic.length > 0 && (
            <Notice tone="warn">
              <strong>Werkt niet vanzelf in een kopie:</strong> {m.dynamic.join(" ")}
            </Notice>
          )}
          {(m.missing > 0 || (m.pagesOutside ?? 0) > 0) && (
            <p className="text-xs" style={{ color: "var(--a-mute)" }}>
              {m.missing > 0 && `${m.missing} bestanden van de eigen site konden niet gekopieerd worden en komen nog van de originele site. `}
              {(m.pagesOutside ?? 0) > 0 && `${m.pagesOutside} links gaan naar pagina's buiten de kopie (we kopiëren er maximaal 40) en wijzen naar de originele site.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
