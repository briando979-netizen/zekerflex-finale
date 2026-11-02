"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Empty, KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";

// ---------------------------------------------------------------------------
// Admin → ZekerFlex Mail: every own address on zekerflex.com
// (lib/mail/zf-accounts.ts). With the TransIP key set, signups are made at once;
// without it they wait here and "Activeer" makes them once the key is there.
// ---------------------------------------------------------------------------

type Status = "aangevraagd" | "actief" | "geblokkeerd";
interface Row {
  address: string;
  displayName: string;
  status: Status;
  createdAt: string;
  activatedAt: string | null;
  recoveryEmail: string | null;
  history: { at: string; what: string; by: string }[];
}

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  aangevraagd: { label: "Wacht op activering", tone: "plan" },
  actief: { label: "Actief", tone: "ok" },
  geblokkeerd: { label: "Geblokkeerd", tone: "crit" },
};
const day = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });

export function ZfMailAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/zfmail", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setMessage({ tone: "crit", text: "Kon de adressen niet laden." });
    const d = await r.json();
    setRows(d.accounts);
    setLive(d.live);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "activeer" | "blokkeer" | "deblokkeer", address: string) {
    if (action === "blokkeer" && !window.confirm(`${address} blokkeren? Het adres verdwijnt uit ZekerFlex; de mail zelf blijft bewaard.`)) return;
    setBusy(address);
    const r = await fetch("/api/admin/zfmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, address }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setMessage({ tone: "crit", text: d?.error?.message ?? "Dat lukte niet." });
    setMessage({ tone: "ok", text: action === "activeer" ? `${address} is aangemaakt en gekoppeld.` : action === "blokkeer" ? `${address} is geblokkeerd.` : `${address} is weer vrijgegeven.` });
    void load();
  }

  const head = <PageHead title="ZekerFlex Mail" subtitle="Eigen mailadressen op zekerflex.com van opdrachtgevers. De mailboxen staan bij TransIP Email, net als je eigen adressen." />;
  if (!rows) return <div className="space-y-4">{head}<div className="a-panel h-28 animate-pulse" /></div>;

  const count = (s: Status) => rows.filter((r) => r.status === s).length;

  return (
    <div className="space-y-4">
      {head}
      <KpiStrip
        items={[
          { label: "Actief", value: count("actief"), hint: "mailbox bij TransIP, gekoppeld" },
          { label: "Wacht op activering", value: count("aangevraagd"), hint: "gereserveerd, nog niet aangemaakt", ...(count("aangevraagd") ? { tone: "warn" as const } : {}) },
          { label: "Geblokkeerd", value: count("geblokkeerd"), hint: "uit ZekerFlex gehaald" },
          { label: "TransIP-koppeling", value: live ? "Aan" : "Uit", hint: live ? "nieuwe adressen direct" : "zie Admin → Te doen" },
        ]}
      />
      {live ? (
        <Notice tone="plan">Nieuwe adressen worden direct bij TransIP aangemaakt en meteen gekoppeld aan de mailpagina van de klant.</Notice>
      ) : (
        <Notice tone="warn">
          De TransIP-sleutel staat nog niet op de server. Nieuwe adressen worden gereserveerd (met het gekozen wachtwoord verzegeld bewaard) maar nog niet aangemaakt.
          Zodra de sleutel er staat, druk je hieronder op Activeer.
        </Notice>
      )}
      <Notice>Blokkeren haalt het adres uit ZekerFlex. Wil je ook inloggen via een ander mailprogramma stoppen, verander dan het wachtwoord in het TransIP-controlepaneel.</Notice>
      {message && <Notice tone={message.tone} role={message.tone === "crit" ? "alert" : "status"}>{message.text}</Notice>}

      <Panel flush title="Adressen" subtitle={`${rows.length} in totaal`}>
        {rows.length === 0 ? (
          <Empty title="Nog geen adressen" body="Opdrachtgevers maken hun adres via Mail in hun eigen omgeving." />
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.address} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <Avatar name={r.displayName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>
                    {r.address}
                  </p>
                  <p className="truncate text-xs" style={{ color: "var(--a-mute)" }}>
                    {r.displayName} · aangevraagd {day(r.createdAt)}
                    {r.activatedAt ? ` · actief sinds ${day(r.activatedAt)}` : ""}
                    {r.recoveryEmail ? ` · herstel via ${r.recoveryEmail}` : ""}
                  </p>
                </div>
                <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
                <div className="flex gap-2">
                  {r.status === "aangevraagd" && (
                    <button type="button" disabled={!live || busy === r.address} onClick={() => void act("activeer", r.address)} className="a-button text-xs disabled:opacity-50" title={live ? "" : "Eerst de TransIP-sleutel op de server zetten"}>
                      Activeer
                    </button>
                  )}
                  {r.status === "geblokkeerd" ? (
                    <button type="button" disabled={busy === r.address} onClick={() => void act("deblokkeer", r.address)} className="a-button text-xs">
                      Deblokkeer
                    </button>
                  ) : (
                    <button type="button" disabled={busy === r.address} onClick={() => void act("blokkeer", r.address)} className="a-button text-xs">
                      Blokkeer
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
