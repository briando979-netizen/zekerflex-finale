"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

// Beheercentrum voor hosting/domein/mail. Bewaart de config via /api/admin/hosting
// (KV, runtime). De provider-API-token komt leeg binnen en wordt alleen
// overschreven als je een nieuwe invult.

type Alias = { alias: string; forwardsTo: string };
type Rec = { type: string; name: string; value: string; ttl: string };
interface Cfg {
  mail: { imapHost: string; imapPort: string; smtpHost: string; smtpPort: string; pop3Host: string; pop3Port: string; aliases: Alias[] };
  dns: { primaryNs: string; secondaryNs: string[]; records: Rec[] };
  domain: { dnssec: boolean; transferLock: boolean; authCode: string };
  ssl: { status: string; note: string };
  vps: { provider: string; host: string; ipv4: string; sshKey: string; note: string };
  api: { provider: string; endpoint: string; token: string };
}

const inp = "w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm";
const lbl = "block text-xs font-medium text-neutralx-500 mb-1";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="card space-y-3 p-5">
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-neutralx-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function HostingBoard() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [apiTokenSet, setApiTokenSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/hosting", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setApiTokenSet(Boolean(d.apiTokenSet));
        delete d.apiTokenSet;
        setCfg(d as Cfg);
      }
    })();
  }, []);

  function set<S extends keyof Cfg>(section: S, patch: Partial<Cfg[S]>) {
    setCfg((c) => (c ? { ...c, [section]: { ...c[section], ...patch } } : c));
  }

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/hosting", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
      if (res.ok) {
        setMsg("Opgeslagen.");
        if (cfg.api.token.trim()) setApiTokenSet(true);
        setCfg((c) => (c ? { ...c, api: { ...c.api, token: "" } } : c));
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d?.error?.message ?? "Opslaan mislukt.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="h-40 animate-pulse rounded-2xl bg-paper-soft" />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Hosting &amp; domein</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Eén plek voor je mailserver-, DNS-, domein- en VPS-instellingen. Dit is de administratie en het koppelpunt:
          het daadwerkelijk toepassen gebeurt bij je provider (of later automatisch via de provider-API hieronder).
        </p>
      </div>

      <Section title="Mailserver" hint="Inkomende en uitgaande mail voor je domein (met SSL: IMAP 993, SMTP 465, POP3 995).">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>IMAP-server</label><input className={inp} value={cfg.mail.imapHost} onChange={(e) => set("mail", { imapHost: e.target.value })} placeholder="imap.jouwdomein.nl" /></div>
          <div><label className={lbl}>IMAP-poort</label><input className={inp} value={cfg.mail.imapPort} onChange={(e) => set("mail", { imapPort: e.target.value })} /></div>
          <div><label className={lbl}>SMTP-server</label><input className={inp} value={cfg.mail.smtpHost} onChange={(e) => set("mail", { smtpHost: e.target.value })} placeholder="smtp.jouwdomein.nl" /></div>
          <div><label className={lbl}>SMTP-poort</label><input className={inp} value={cfg.mail.smtpPort} onChange={(e) => set("mail", { smtpPort: e.target.value })} /></div>
          <div><label className={lbl}>POP3-server</label><input className={inp} value={cfg.mail.pop3Host} onChange={(e) => set("mail", { pop3Host: e.target.value })} placeholder="pop.jouwdomein.nl" /></div>
          <div><label className={lbl}>POP3-poort</label><input className={inp} value={cfg.mail.pop3Port} onChange={(e) => set("mail", { pop3Port: e.target.value })} /></div>
        </div>
        <div>
          <label className={lbl}>Aliassen (doorstuuradressen)</label>
          <div className="space-y-2">
            {cfg.mail.aliases.map((a, i) => (
              <div key={i} className="flex gap-2">
                <input className={inp} value={a.alias} onChange={(e) => set("mail", { aliases: cfg.mail.aliases.map((x, j) => (j === i ? { ...x, alias: e.target.value } : x)) })} placeholder="info@jouwdomein.nl" />
                <span className="self-center text-xs text-neutralx-400">→</span>
                <input className={inp} value={a.forwardsTo} onChange={(e) => set("mail", { aliases: cfg.mail.aliases.map((x, j) => (j === i ? { ...x, forwardsTo: e.target.value } : x)) })} placeholder="jij@gmail.com" />
                <button type="button" onClick={() => set("mail", { aliases: cfg.mail.aliases.filter((_, j) => j !== i) })} className="btn-ghost flex-shrink-0 text-xs text-crit">×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set("mail", { aliases: [...cfg.mail.aliases, { alias: "", forwardsTo: "" }] })} className="btn-ghost mt-2 text-xs">+ alias</button>
        </div>
      </Section>

      <Section title="Nameservers &amp; DNS" hint="De nameservers van je domein en de DNS-records.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Primaire nameserver</label><input className={inp} value={cfg.dns.primaryNs} onChange={(e) => set("dns", { primaryNs: e.target.value })} placeholder="ns1.provider.nl" /></div>
          {cfg.dns.secondaryNs.map((ns, i) => (
            <div key={i}><label className={lbl}>Secundaire nameserver {i + 1}</label><input className={inp} value={ns} onChange={(e) => set("dns", { secondaryNs: cfg.dns.secondaryNs.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`ns${i + 2}.provider.nl`} /></div>
          ))}
        </div>
        <div>
          <label className={lbl}>DNS-records</label>
          <div className="space-y-2">
            {cfg.dns.records.map((r, i) => (
              <div key={i} className="grid grid-cols-[70px_1fr_1fr_60px_auto] gap-2">
                <input className={inp} value={r.type} onChange={(e) => set("dns", { records: cfg.dns.records.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)) })} placeholder="A" />
                <input className={inp} value={r.name} onChange={(e) => set("dns", { records: cfg.dns.records.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="@ of www" />
                <input className={inp} value={r.value} onChange={(e) => set("dns", { records: cfg.dns.records.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="waarde" />
                <input className={inp} value={r.ttl} onChange={(e) => set("dns", { records: cfg.dns.records.map((x, j) => (j === i ? { ...x, ttl: e.target.value } : x)) })} placeholder="3600" />
                <button type="button" onClick={() => set("dns", { records: cfg.dns.records.filter((_, j) => j !== i) })} className="btn-ghost text-xs text-crit">×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => set("dns", { records: [...cfg.dns.records, { type: "A", name: "", value: "", ttl: "3600" }] })} className="btn-ghost mt-2 text-xs">+ record</button>
        </div>
      </Section>

      <Section title="Domeinbeveiliging" hint="DNSSEC, transfer-lock en de autorisatiecode (EPP) voor verhuizen.">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.domain.dnssec} onChange={(e) => set("domain", { dnssec: e.target.checked })} /> DNSSEC ingeschakeld</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.domain.transferLock} onChange={(e) => set("domain", { transferLock: e.target.checked })} /> Transfer-lock (verhuisslot) aan</label>
        <div><label className={lbl}>Autorisatiecode (EPP)</label><input className={inp} value={cfg.domain.authCode} onChange={(e) => set("domain", { authCode: e.target.value })} placeholder="alleen nodig bij verhuizen" /></div>
      </Section>

      <Section title="Versleutelde verbinding (SSL/TLS)" hint="Het certificaat voor https:// op je website.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>Status</label>
            <select className={inp} value={cfg.ssl.status} onChange={(e) => set("ssl", { status: e.target.value })}>
              {["actief", "verloopt binnenkort", "geen", "onbekend"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className={lbl}>Notitie</label><input className={inp} value={cfg.ssl.note} onChange={(e) => set("ssl", { note: e.target.value })} placeholder="bv. Let's Encrypt, auto-vernieuwing" /></div>
        </div>
      </Section>

      <Section title="VPS &amp; SSH" hint="Je eigen server (bv. voor de AI-node) + de publieke SSH-sleutel.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Provider</label><input className={inp} value={cfg.vps.provider} onChange={(e) => set("vps", { provider: e.target.value })} placeholder="bv. Hetzner, TransIP" /></div>
          <div><label className={lbl}>Host / naam</label><input className={inp} value={cfg.vps.host} onChange={(e) => set("vps", { host: e.target.value })} /></div>
          <div><label className={lbl}>IPv4-adres</label><input className={inp} value={cfg.vps.ipv4} onChange={(e) => set("vps", { ipv4: e.target.value })} placeholder="1.2.3.4" /></div>
          <div><label className={lbl}>Notitie</label><input className={inp} value={cfg.vps.note} onChange={(e) => set("vps", { note: e.target.value })} /></div>
        </div>
        <div><label className={lbl}>Publieke SSH-sleutel</label><textarea className={`${inp} font-mono text-xs`} rows={3} value={cfg.vps.sshKey} onChange={(e) => set("vps", { sshKey: e.target.value })} placeholder="ssh-ed25519 AAAA… naam" /></div>
      </Section>

      <Section title="Provider-API (voor automatisch toepassen)" hint="Koppel een DNS-/hostingprovider-API zodat wijzigingen later automatisch worden toegepast.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={lbl}>Provider</label><input className={inp} value={cfg.api.provider} onChange={(e) => set("api", { provider: e.target.value })} placeholder="bv. Cloudflare" /></div>
          <div><label className={lbl}>API-endpoint</label><input className={inp} value={cfg.api.endpoint} onChange={(e) => set("api", { endpoint: e.target.value })} placeholder="https://api.provider.com" /></div>
        </div>
        <div>
          <label className={lbl}>API-token {apiTokenSet && <span className="text-brand-600">· ingesteld</span>}</label>
          <input className={inp} type="password" value={cfg.api.token} onChange={(e) => set("api", { token: e.target.value })} placeholder={apiTokenSet ? "laat leeg om ongewijzigd te laten" : "plak hier je token"} />
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary text-sm disabled:opacity-50">{saving ? "Opslaan…" : "Opslaan"}</button>
        <button type="button" onClick={() => window.open("/api/admin/hosting/export", "_blank")} className="btn-ghost text-sm" title="Download DNS-zone + mail-aliassen voor je eigen CoreDNS/BIND/Postfix">
          Exporteer config (DNS + mail)
        </button>
        {msg && <span className="text-sm text-neutralx-600">{msg}</span>}
        <span className="w-full text-xs text-neutralx-400">Sla eerst op; de export gebruikt de opgeslagen waarden. Volledige zelf-gehoste stack: <code>deploy/sovereign/</code>.</span>
      </div>
    </div>
  );
}
