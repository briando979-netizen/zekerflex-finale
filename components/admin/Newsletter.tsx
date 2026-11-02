"use client";

import { useCallback, useEffect, useState } from "react";
import { count as fmtCount, dateNl, dateTimeNl, percentOf } from "@/lib/admin/format";
import { bucketCount, resolvePeriod, timelineKeys } from "@/lib/admin/period";
import { KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";

interface Sub {
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  source: string;
  createdAt: string;
  confirmedAt: string | null;
}
interface Campaign {
  id: string;
  at: string;
  subject: string;
  recipients: number;
  delivered: number;
  failed: number;
  sentByEmail: string;
  audience?: Audience;
}
type Audience = "subscribers" | "users" | "freelancers" | "employers" | "everyone";
// Mirrors AUDIENCE_LABEL in lib/newsletter/audience (server-only module).
const AUDIENCE_LABEL: Record<Audience, string> = {
  subscribers: "Nieuwsbrief-abonnees",
  users: "Alle gebruikers",
  freelancers: "Freelancers",
  employers: "Werkgevers",
  everyone: "Iedereen (abonnees + gebruikers)",
};
interface Payload {
  stats: { total: number; confirmed: number; pending: number; unsubscribed: number };
  audiences?: Record<Audience, number>;
  smtp: boolean;
  from: string;
  subscribers: Sub[];
  campaigns: Campaign[];
}

const TEMPLATES: { label: string; subject: string; body: string }[] = [
  {
    label: "App-testers werven",
    subject: "Test jij als eerste de ZekerFlex-app? 📱",
    body: `Hoi,

De ZekerFlex-app voor Android is klaar om getest te worden, en we zoeken mensen die hem als eerste willen uitproberen.

In de app kun je klussen bij jou in de buurt vinden en erop reageren, je uren schrijven en je verdiensten bijhouden, direct chatten met opdrachtgevers of freelancers, en meldingen krijgen zodra er iets voor je klaarstaat.

Zo doe je mee:
1. Stuur ons je Gmail-adres: antwoord op deze mail met het Gmail-adres dat je in de Play Store op je telefoon gebruikt. We zetten je dan op de testerslijst.
2. Open deze link op je Android-telefoon: https://play.google.com/apps/testing/com.zekerflex.app
3. Tik op "Word tester" en installeer de app via Google Play.

Zie je "app niet beschikbaar"? Dan staat je adres nog niet op de lijst. Probeer het een paar uur later nog eens.

Onze vraag aan jou: houd de app minstens 14 dagen geïnstalleerd en gebruik hem af en toe. Zie je iets wat niet werkt of beter kan? Antwoord gewoon op deze mail.

Heb je een iPhone? De iOS-versie volgt later. Tot die tijd werkt alles via zekerflex.com.

Bedankt dat je ons helpt!

Team ZekerFlex`,
  },
];

const STATUS: Record<Sub["status"], { label: string; tone: Tone }> = {
  pending: { label: "Wacht op bevestiging", tone: "warn" },
  confirmed: { label: "Bevestigd", tone: "ok" },
  unsubscribed: { label: "Afgemeld", tone: "neutral" },
};

const PERIOD = resolvePeriod("90");

/** Zo ziet de mail eruit bij de ontvanger: alinea's op lege regels, links klikbaar. */
function MailPreview({ from, subject, body }: { from: string; subject: string; body: string }) {
  const paragraphs = body.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--a-border)" }}>
      <div className="space-y-0.5 px-4 py-3 text-xs" style={{ background: "var(--a-panel-2)", borderBottom: "1px solid var(--a-border)", color: "var(--a-mute)" }}>
        <p>Van: <span style={{ color: "var(--a-dim)" }}>{from || "…"}</span></p>
        <p className="text-[0.8125rem] font-semibold" style={{ color: "var(--a-text)" }}>{subject || "Onderwerp"}</p>
      </div>
      <div className="max-h-[22rem] space-y-3 overflow-y-auto bg-white px-5 py-4 text-[0.8125rem] leading-relaxed text-[#1f2933]">
        {paragraphs.length === 0 ? (
          <p className="text-[#8a94a0]">Je bericht verschijnt hier zoals de ontvanger het ziet.</p>
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p.split(/(https?:\/\/\S+)/g).map((part, j) => (/^https?:\/\//.test(part) ? <span key={j} className="text-[#0E5C4A] underline">{part}</span> : part))}
            </p>
          ))
        )}
        <p className="border-t border-[#e5e7eb] pt-3 text-[11px] text-[#8a94a0]">Je ontvangt deze mail van ZekerFlex. Afmelden kan altijd met één klik.</p>
      </div>
    </div>
  );
}

export function Newsletter() {
  const [data, setData] = useState<Payload | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [unsubBusy, setUnsubBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/nieuwsbrief", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const s = data?.stats;
  const count = data?.audiences?.[audience] ?? (audience === "subscribers" ? (s?.confirmed ?? 0) : 0);

  async function send(test: boolean) {
    if (busy) return;
    if (!test && !window.confirm(`Mail versturen naar ${count} ontvangers (${AUDIENCE_LABEL[audience]})?`)) {
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/nieuwsbrief/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, audience, test }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(d?.error?.message ?? "Versturen mislukt.");
      } else if (test) {
        setNote(`Testmail verstuurd naar jezelf (${d.delivered}/${d.recipients} afgeleverd).`);
      } else {
        setNote(`Verstuurd: ${d.delivered} afgeleverd, ${d.failed} mislukt van ${d.recipients}.`);
        setSubject("");
        setBody("");
        void refresh();
      }
    } catch {
      setNote("Versturen mislukt: geen verbinding.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe(email: string) {
    if (!window.confirm(`${email} afmelden voor de nieuwsbrief?`)) return;
    setUnsubBusy(email);
    try {
      const res = await fetch("/api/admin/nieuwsbrief/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) await refresh();
    } finally {
      setUnsubBusy(null);
    }
  }

  const subscribers = data?.subscribers ?? [];
  const campaigns = data?.campaigns ?? [];
  const delivered = campaigns.reduce((n, c) => n + c.delivered, 0);
  const sent = campaigns.reduce((n, c) => n + c.recipients, 0);

  const subRows: TableRow[] = subscribers.map((x) => ({
    id: x.email,
    search: `${x.email} ${x.source}`,
    filters: { status: x.status },
    cells: {
      email: <span className="font-medium" style={{ color: "var(--a-text)" }}>{x.email}</span>,
      source: x.source,
      since: dateNl(x.createdAt),
      status: <Pill tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Pill>,
      action:
        x.status !== "unsubscribed" ? (
          <button type="button" onClick={() => void unsubscribe(x.email)} disabled={unsubBusy === x.email} className="a-button text-xs">{unsubBusy === x.email ? "Bezig…" : "Afmelden"}</button>
        ) : null,
    },
    sort: { email: x.email, source: x.source, since: new Date(x.createdAt).getTime(), status: STATUS[x.status].label },
    csv: { email: x.email, source: x.source, since: x.createdAt.slice(0, 10), status: STATUS[x.status].label, action: "" },
  }));

  const campaignRows: TableRow[] = campaigns.map((c) => ({
    id: c.id,
    search: c.subject,
    cells: {
      subject: <span className="font-medium" style={{ color: "var(--a-text)" }}>{c.subject}</span>,
      audience: AUDIENCE_LABEL[c.audience ?? "subscribers"] ?? c.audience,
      when: dateTimeNl(c.at),
      delivered: (
        <span className="whitespace-nowrap">
          {fmtCount(c.delivered)} van {fmtCount(c.recipients)}
          {c.failed > 0 && <span className="ml-1.5 text-xs" style={{ color: "var(--a-crit)" }}>{fmtCount(c.failed)} mislukt</span>}
        </span>
      ),
    },
    sort: { subject: c.subject, when: new Date(c.at).getTime(), delivered: c.delivered },
  }));

  return (
    <div className="space-y-4">
      <PageHead title="Nieuwsbrief" subtitle="Schrijf één mail en stuur hem in één keer naar abonnees, alle gebruikers, alleen freelancers of alleen werkgevers." />

      <KpiStrip
        items={[
          { label: "Bevestigde abonnees", value: fmtCount(s?.confirmed ?? 0), hint: `van ${fmtCount(s?.total ?? 0)} inschrijvingen`, spark: bucketCount(subscribers, (x) => new Date(x.createdAt), PERIOD) },
          { label: "Wacht op bevestiging", value: fmtCount(s?.pending ?? 0), ...((s?.pending ?? 0) > 0 ? { tone: "warn" as const } : {}) },
          { label: "Afgemeld", value: fmtCount(s?.unsubscribed ?? 0) },
          { label: "Verstuurde mails", value: fmtCount(campaigns.length), hint: sent > 0 ? `${percentOf(delivered, sent)}% afgeleverd` : "nog niets verstuurd" },
        ]}
      />

      {data && !data.smtp && <Notice tone="warn">Geen mailserver ingesteld: uitgaven worden alleen lokaal in de mailbox bewaard.</Notice>}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          title="Nieuwe mail"
          actions={
            TEMPLATES.length > 0 ? (
              <span className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => {
                      if ((subject || body) && !window.confirm("Huidige tekst vervangen door het sjabloon?")) return;
                      setSubject(t.subject);
                      setBody(t.body);
                    }}
                    className="a-button text-xs"
                  >
                    Sjabloon: {t.label}
                  </button>
                ))}
              </span>
            ) : undefined
          }
        >
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium" style={{ color: "var(--a-mute)" }}>Naar wie?</p>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAudience(a)}
                    aria-pressed={audience === a}
                    className="rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-colors"
                    style={audience === a ? { background: "var(--a-accent)", color: "var(--a-on-accent)" } : { background: "var(--a-elev)", color: "var(--a-dim)" }}
                  >
                    {AUDIENCE_LABEL[a]} <span className="num opacity-75">{data?.audiences?.[a] ?? "…"}</span>
                  </button>
                ))}
              </div>
              {audience !== "subscribers" && (
                <p className="mt-1.5 text-xs" style={{ color: "var(--a-mute)" }}>Alleen gebruikers met een bevestigd e-mailadres. Wie zich ooit afmeldde, krijgt niets. Elke mail heeft een afmeldlink.</p>
              )}
            </div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Onderwerp" aria-label="Onderwerp" className="a-input" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Bericht. Een lege regel begint een nieuwe alinea. Links worden vanzelf klikbaar." aria-label="Bericht" rows={11} className="a-input leading-relaxed" />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void send(false)} disabled={busy || subject.length < 3 || body.length < 10 || count === 0} className="a-button a-button-primary">
                {busy ? "Bezig, laat dit venster open" : `Versturen naar ${fmtCount(count)} ontvangers`}
              </button>
              <button type="button" onClick={() => void send(true)} disabled={busy || subject.length < 3 || body.length < 10} className="a-button">Eerst naar mezelf</button>
            </div>
            {note && <Notice>{note}</Notice>}
          </div>
        </Panel>
        <Panel title="Voorbeeld" subtitle="Zo ziet de ontvanger je mail">
          <MailPreview from={data?.from ?? ""} subject={subject} body={body} />
        </Panel>
      </div>

      <Panel title="Inschrijvingen" subtitle="Nieuwe inschrijvingen per dag, de laatste 90 dagen">
        <Chart title="Nieuwe inschrijvingen per dag" kind="bars" unit="count" labels={timelineKeys(PERIOD)} series={[{ label: "Inschrijvingen", values: bucketCount(subscribers, (x) => new Date(x.createdAt), PERIOD) }]} height={150} emptyText="Geen inschrijvingen in de laatste 90 dagen." />
      </Panel>

      <Panel flush title="Verstuurde mails">
        <DataTable
          columns={[
            { key: "subject", label: "Onderwerp" },
            { key: "audience", label: "Naar", hideOnMobile: true, sortable: false },
            { key: "when", label: "Verstuurd", hideOnMobile: true },
            { key: "delivered", label: "Afgeleverd", align: "right" },
          ]}
          rows={campaignRows}
          pageSize={8}
          defaultSort={{ key: "when", dir: "desc" }}
          emptyText="Nog niets verstuurd."
        />
      </Panel>

      <Panel flush title="Abonnees">
        <DataTable
          columns={[
            { key: "email", label: "E-mail" },
            { key: "source", label: "Via", hideOnMobile: true },
            { key: "since", label: "Sinds", hideOnMobile: true },
            { key: "status", label: "Status" },
            { key: "action", label: "", align: "right", sortable: false },
          ]}
          rows={subRows}
          pageSize={20}
          searchPlaceholder="Zoek een e-mailadres"
          csvName="nieuwsbrief-abonnees"
          filters={[{ key: "status", label: "Status", chips: true, options: (["confirmed", "pending", "unsubscribed"] as const).map((value) => ({ value, label: STATUS[value].label })) }]}
          defaultSort={{ key: "since", dir: "desc" }}
          emptyText="Nog geen inschrijvingen."
        />
      </Panel>
    </div>
  );
}
