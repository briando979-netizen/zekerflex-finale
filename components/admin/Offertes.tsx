"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { count, dateTimeNl } from "@/lib/admin/format";
import { bucketCount, resolvePeriod, timelineKeys } from "@/lib/admin/period";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";

interface OfferAnalysis {
  isOffer: boolean;
  confidence: number;
  company: string | null;
  contactName: string | null;
  behoefte: string | null;
  aantal: string | null;
  locatie: string | null;
  periode: string | null;
  functietype: string | null;
  samenvatting: string;
  draftReply: string;
}
interface OfferRecord extends OfferAnalysis {
  id: string;
  at: string;
  fromName: string | null;
  fromAddress: string | null;
  subject: string | null;
  leadId: string | null;
  status: "nieuw" | "beantwoord" | "afgewezen";
}

const STATUS: Record<OfferRecord["status"], { label: string; tone: Tone }> = {
  nieuw: { label: "Wacht op antwoord", tone: "warn" },
  beantwoord: { label: "Beantwoord", tone: "ok" },
  afgewezen: { label: "Afgewezen", tone: "neutral" },
};

const PERIOD = resolvePeriod("30");

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

function Details({ a }: { a: OfferAnalysis }) {
  const rows = ([["Bedrijf", a.company], ["Contact", a.contactName], ["Behoefte", a.behoefte], ["Aantal", a.aantal], ["Locatie", a.locatie], ["Periode", a.periode], ["Functie", a.functietype]] as [string, string | null][]).filter(([, v]) => v);
  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="w-16 flex-shrink-0" style={{ color: "var(--a-mute)" }}>{k}</dt>
          <dd style={{ color: "var(--a-text)" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Draft({ text }: { text: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>Concept-antwoord</span>
        <button type="button" onClick={() => copy(text)} className="a-button text-xs">Kopiëren</button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg p-3 font-sans text-xs leading-relaxed" style={{ background: "var(--a-panel-2)", color: "var(--a-dim)" }}>{text}</pre>
    </div>
  );
}

export function Offertes() {
  const [data, setData] = useState<{ mailboxConnected: boolean; offers: OfferRecord[] } | null>(null);
  const [body, setBody] = useState("");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [analysis, setAnalysis] = useState<OfferAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | OfferRecord["status"]>("alle");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/offertes", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const analyze = useCallback(
    async (save: boolean) => {
      if (!body.trim() || busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/admin/offertes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "analyze",
            body: body.trim(),
            ...(from.trim() ? { fromAddress: from.trim() } : {}),
            ...(subject.trim() ? { subject: subject.trim() } : {}),
            save,
          }),
        });
        const d = await res.json().catch(() => ({}));
        setAnalysis(d.analysis ?? null);
        if (save) await load();
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    },
    [body, from, subject, busy, load],
  );

  const sweep = useCallback(async () => {
    setSweepMsg("Bezig met de inbox…");
    try {
      const res = await fetch("/api/admin/offertes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sweep" }),
      });
      const d = await res.json().catch(() => ({}));
      setSweepMsg(d.ok ? `Klaar: ${d.scanned} mails gelezen, ${d.offers} offerteaanvraag(en) gevonden.` : `Niet gelukt: ${d.reason ?? "onbekend"}`);
      await load();
    } catch {
      setSweepMsg("Netwerkfout.");
    }
  }, [load]);

  const setStatus = useCallback(
    async (id: string, status: OfferRecord["status"]) => {
      await fetch("/api/admin/offertes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", id, status }),
      }).catch(() => undefined);
      await load();
    },
    [load],
  );

  const offers = useMemo(() => data?.offers ?? [], [data]);
  const shown = filter === "alle" ? offers : offers.filter((o) => o.status === filter);
  const waiting = offers.filter((o) => o.status === "nieuw").length;
  const withLead = offers.filter((o) => o.leadId).length;

  return (
    <div className="space-y-4">
      <PageHead
        title="Offerte-AI"
        subtitle="De AI leest de mailbox van sales@, herkent offerte- en personeelsaanvragen, haalt de details eruit, maakt er een warme lead van en schrijft een concept-antwoord. Jij controleert en verstuurt: de AI mailt niet zelf."
        meta={data ? <Pill tone={data.mailboxConnected ? "ok" : "warn"}>{data.mailboxConnected ? "Mailbox gekoppeld" : "Geen mailbox gekoppeld"}</Pill> : undefined}
        actions={<button type="button" onClick={() => void sweep()} disabled={!data?.mailboxConnected} className="a-button a-button-primary">Verwerk de inbox nu</button>}
      />

      {sweepMsg && <Notice>{sweepMsg} De inbox wordt ook automatisch drie keer per dag verwerkt.</Notice>}

      <KpiStrip
        items={[
          { label: "Aanvragen", value: count(offers.length), hint: "herkend in de mailbox", spark: bucketCount(offers, (o) => new Date(o.at), PERIOD) },
          { label: "Wacht op antwoord", value: count(waiting), hint: waiting > 0 ? "concept staat klaar" : "alles beantwoord", ...(waiting > 0 ? { tone: "warn" as const } : {}) },
          { label: "Beantwoord", value: count(offers.filter((o) => o.status === "beantwoord").length) },
          { label: "In de pijplijn", value: count(withLead), hint: "als warme lead", href: "/admin/sales" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Binnengekomen" subtitle="Aanvragen per dag, de laatste 30 dagen">
          <Chart title="Offerteaanvragen per dag" kind="bars" unit="count" labels={timelineKeys(PERIOD)} series={[{ label: "Aanvragen", values: bucketCount(offers, (o) => new Date(o.at), PERIOD) }]} height={170} emptyText="Nog geen aanvragen in de laatste 30 dagen." />
        </Panel>
        <Panel title="Test met een losse mail" subtitle="Plak de inhoud: de AI haalt de details eruit en schrijft een concept">
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Afzender (optioneel)" aria-label="Afzender" className="a-input" />
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Onderwerp (optioneel)" aria-label="Onderwerp" className="a-input" />
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Plak hier de e-mail" aria-label="Inhoud van de e-mail" className="a-input resize-y" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void analyze(false)} disabled={busy || !body.trim()} className="a-button">{busy ? "Bezig…" : "Analyseren"}</button>
              <button type="button" onClick={() => void analyze(true)} disabled={busy || !body.trim()} className="a-button a-button-primary">Analyseren en als lead bewaren</button>
            </div>
            {analysis && (
              <div className="space-y-2.5 rounded-lg p-3" style={{ border: "1px solid var(--a-border)" }}>
                {analysis.isOffer ? (
                  <>
                    <p className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
                      <Pill tone="ok">Offerteaanvraag</Pill>
                      <span style={{ color: "var(--a-mute)" }}>{Math.round(analysis.confidence * 100)}% zeker</span>
                    </p>
                    <p className="text-[0.8125rem]" style={{ color: "var(--a-text)" }}>{analysis.samenvatting}</p>
                    <Details a={analysis} />
                    {analysis.draftReply && <Draft text={analysis.draftReply} />}
                  </>
                ) : (
                  <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Dit lijkt geen offerteaanvraag. {analysis.samenvatting}</p>
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel flush title="Verwerkte aanvragen" actions={<button type="button" onClick={() => void load()} className="a-button text-xs">Vernieuwen</button>}>
        <div role="group" aria-label="Aanvragen tonen" className="flex flex-wrap gap-0.5 px-3 py-2.5 sm:px-4" style={{ borderTop: "1px solid var(--a-border)", borderBottom: "1px solid var(--a-border)" }}>
          {(["alle", "nieuw", "beantwoord", "afgewezen"] as const).map((f) => {
            const n = f === "alle" ? offers.length : offers.filter((o) => o.status === f).length;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className="rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-colors"
                style={filter === f ? { background: "var(--a-elev)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}
              >
                {f === "alle" ? "Alle" : STATUS[f].label}
                <span className="num ml-1.5 text-xs" style={{ color: "var(--a-mute)" }}>{n}</span>
              </button>
            );
          })}
        </div>
        {shown.length === 0 ? (
          <Empty title={offers.length === 0 ? "Nog geen aanvragen verwerkt" : "Geen aanvragen met dit filter"} />
        ) : (
          <ul>
            {shown.map((o) => {
              const isOpen = open === o.id;
              return (
                <li key={o.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : o.id)} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-[0.8125rem] transition-colors hover:bg-[var(--a-panel-2)] sm:px-5">
                    <span className="font-medium" style={{ color: "var(--a-text)" }}>{o.company ?? o.fromName ?? o.fromAddress ?? "Onbekend"}</span>
                    <Pill tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Pill>
                    <span className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--a-mute)" }}>{o.samenvatting}</span>
                    <span className="flex-shrink-0 text-xs" style={{ color: "var(--a-mute)" }}>{dateTimeNl(o.at)}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 px-4 pb-4 sm:px-5">
                      {o.fromAddress && <p className="font-mono text-xs" style={{ color: "var(--a-mute)" }}>{o.fromAddress}{o.subject ? `, ${o.subject}` : ""}</p>}
                      <Details a={o} />
                      {o.draftReply && <Draft text={o.draftReply} />}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {o.leadId && <Link href="/admin/sales" className="a-button text-xs">In de pijplijn →</Link>}
                        {o.status !== "beantwoord" && <button type="button" onClick={() => void setStatus(o.id, "beantwoord")} className="a-button a-button-primary text-xs">Markeer als beantwoord</button>}
                        {o.status !== "afgewezen" && <button type="button" onClick={() => void setStatus(o.id, "afgewezen")} className="a-button text-xs">Afwijzen</button>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
