"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoList, KpiStrip, Notice, Pill } from "@/components/admin/kit";
import type { MirrorRecord } from "@/lib/website/mirror";
import type { SiteVerification } from "@/lib/website/verify";
import type { Approval, DeployConfig, DeployRecord } from "@/lib/website/deploy";
import type { Finding } from "@/lib/website-check/analyze";

// Website-verhuizer per klant: eigendom bewijzen → kopie met verbeteringen →
// voorbeeld en score voor/na → (na akkoord van de klant) live zetten via SSH,
// met de oude site bewaard en terugzetten in één klik.

type State = {
  host: string | null;
  record: string;
  verification: SiteVerification | null;
  mirror: MirrorRecord | null;
  deployConfig: DeployConfig;
  approval: Approval | null;
  deploy: DeployRecord | null;
};
type TestResult = { result: { ok: true; real: string; files: number; sizeKb: number } | { ok: false; reason: string }; hostKey: string | null };

const DEPLOY_LABEL: Record<DeployRecord["status"], { label: string; tone: "ok" | "warn" | "crit" | "plan" }> = {
  bezig: { label: "Bezig met live zetten", tone: "plan" },
  live: { label: "Live", tone: "ok" },
  mislukt: { label: "Mislukt", tone: "crit" },
  teruggezet: { label: "Teruggezet", tone: "warn" },
};

const mb = (bytes: number) => `${(bytes / 1e6).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`;
const when = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const open = (f: Finding[]) => f.filter((x) => x.status !== "goed");

function LiveSection({
  state,
  m,
  webroot,
  setWebroot,
  test,
  busy,
  confirm,
  setConfirm,
  act,
}: {
  state: State;
  m: MirrorRecord;
  webroot: string;
  setWebroot: (v: string) => void;
  test: TestResult | null;
  busy: string | null;
  confirm: "deploy" | "rollback" | null;
  setConfirm: (v: "deploy" | "rollback" | null) => void;
  act: (a: "set-webroot" | "test-ssh" | "deploy" | "rollback") => Promise<void>;
}) {
  const cfg = state.deployConfig;
  const approved = state.approval?.mirrorId === m.id;
  const tested = Boolean(cfg.testedAt && cfg.realWebroot);
  const d = state.deploy;
  const ready = approved && tested && d?.status !== "bezig";
  return (
    <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--a-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold" style={{ color: "var(--a-mute)" }}>Live zetten op de server van de klant</p>
        {approved ? <Pill tone="ok">Akkoord van de klant {when(state.approval?.at ?? "")}</Pill> : <Pill tone="warn">Wacht op akkoord van de klant</Pill>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`webroot-${m.id}`}>Map van de website op de server</label>
        <input id={`webroot-${m.id}`} value={webroot} onChange={(e) => setWebroot(e.target.value)} className="a-input !w-64 font-mono text-xs" placeholder="~/public_html" />
        <button type="button" className="a-button text-xs" disabled={busy !== null || webroot === cfg.webroot} onClick={() => void act("set-webroot")}>Map opslaan</button>
        <button type="button" className="a-button text-xs" disabled={busy !== null || !cfg.webroot} onClick={() => void act("test-ssh")}>{busy === "test-ssh" ? "Testen…" : "Test verbinding (alleen lezen)"}</button>
      </div>
      {test && !test.result.ok && <Notice tone="crit" role="alert">{test.result.reason}</Notice>}
      {tested && (
        <p className="text-xs" style={{ color: "var(--a-dim)" }}>
          Gevonden: <span className="font-mono">{cfg.realWebroot}</span> · {cfg.filesNow} items · {mb((cfg.sizeKb ?? 0) * 1024)} · server <span className="font-mono">{cfg.hostKey}</span> · getest {when(cfg.testedAt ?? "")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {confirm === "deploy" ? (
          <>
            <button type="button" className="a-button a-button-primary text-xs" disabled={busy !== null} onClick={() => void act("deploy")}>Ja, zet live (oude site gaat opzij en blijft bewaard)</button>
            <button type="button" className="a-button text-xs" onClick={() => setConfirm(null)}>Annuleren</button>
          </>
        ) : (
          <button type="button" className="a-button a-button-primary text-xs" disabled={!ready || busy !== null} onClick={() => setConfirm("deploy")}>Zet live</button>
        )}
        {d?.status === "live" && (
          confirm === "rollback" ? (
            <>
              <button type="button" className="a-button text-xs" disabled={busy !== null} onClick={() => void act("rollback")}>Ja, zet de oude site terug</button>
              <button type="button" className="a-button text-xs" onClick={() => setConfirm(null)}>Annuleren</button>
            </>
          ) : (
            <button type="button" className="a-button text-xs" disabled={busy !== null} onClick={() => setConfirm("rollback")}>Terug naar de oude site</button>
          )
        )}
        {!ready && !d && <span className="text-xs" style={{ color: "var(--a-mute)" }}>{!approved ? "Kan pas na akkoord van de klant." : "Test eerst de verbinding."}</span>}
      </div>
      {d && (
        <div className="space-y-1">
          <Pill tone={DEPLOY_LABEL[d.status].tone}>{DEPLOY_LABEL[d.status].label}</Pill>
          {d.status === "bezig" && <span className="ml-2 text-xs" style={{ color: "var(--a-mute)" }} role="status">{d.files} bestanden geüpload</span>}
          <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--a-dim)" }}>
            {d.steps.map((s) => (
              <li key={s.at + s.text}>{when(s.at)} · {s.text}</li>
            ))}
          </ul>
          {d.error && <Notice tone="crit" role="alert">{d.error}</Notice>}
        </div>
      )}
    </div>
  );
}

export function SiteMirrorPanel({ siteId }: { siteId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [webroot, setWebroot] = useState("");
  const [test, setTest] = useState<TestResult | null>(null);
  const [confirmDeploy, setConfirmDeploy] = useState<"deploy" | "rollback" | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/website/mirror?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setState(data as State);
      setWebroot((w) => w || (data as State).deployConfig?.webroot || "~/public_html");
    } else setMessage(data?.error?.message ?? "Laden mislukt.");
  }, [siteId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Zolang er een kopie of live-zetting loopt: elke twee seconden de voortgang ophalen.
  const running = state?.mirror?.status === "bezig" || state?.deploy?.status === "bezig";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [running, load]);

  const act = async (action: "check-dns" | "admin-verify" | "start" | "set-webroot" | "test-ssh" | "deploy" | "rollback") => {
    setBusy(action);
    setMessage("");
    try {
      const res = await fetch("/api/admin/website/mirror", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, siteId, ...(action === "set-webroot" ? { webroot } : {}) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(data?.error?.message ?? "Mislukt.");
      else if (action === "check-dns" && !data.ok) setMessage("De TXT-regel is nog niet gevonden. Een DNS-wijziging kan tot een uur duren.");
      else if (action === "test-ssh" && data.test) setTest(data.test as TestResult);
      await load();
    } finally {
      setBusy(null);
      setConfirmAdmin(false);
      setConfirmDeploy(null);
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
          <LiveSection state={state} m={m} webroot={webroot} setWebroot={setWebroot} test={test} busy={busy} confirm={confirmDeploy} setConfirm={setConfirmDeploy} act={act} />
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
