"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

export function Offertes() {
  const [data, setData] = useState<{ mailboxConnected: boolean; offers: OfferRecord[] } | null>(null);
  const [body, setBody] = useState("");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [analysis, setAnalysis] = useState<OfferAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [sweepMsg, setSweepMsg] = useState<string | null>(null);

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
      setSweepMsg(d.ok ? `Klaar: ${d.scanned} gescand, ${d.offers} offerteaanvraag(/vragen) gevonden.` : `Niet gelukt: ${d.reason ?? "onbekend"}`);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">📨 Offerte-AI (sales@)</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          De AI leest de ZekerFlex-mailbox, herkent offerte- en personeelsaanvragen van bedrijven, haalt de details
          eruit, zet er een warme lead van in de sales-pijplijn en schrijft een concept-antwoord. Jij controleert en
          verstuurt — de AI mailt niet zelf.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hair bg-white p-4">
        <span className={`inline-flex items-center gap-1.5 text-sm ${data?.mailboxConnected ? "text-ok" : "text-neutralx-500"}`}>
          <span className={`h-2 w-2 rounded-full ${data?.mailboxConnected ? "bg-ok" : "bg-neutralx-400"}`} />
          {data?.mailboxConnected ? "Mailbox gekoppeld" : "Geen mailbox gekoppeld (IMAP)"}
        </span>
        <button
          type="button"
          onClick={() => void sweep()}
          disabled={!data?.mailboxConnected}
          className="rounded-full bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
        >
          Verwerk sales@-inbox nu
        </button>
        {sweepMsg && <span className="text-xs text-neutralx-600">{sweepMsg}</span>}
        <span className="ml-auto text-xs text-neutralx-400">Draait ook automatisch (cron).</span>
      </div>

      <section className="rounded-xl border border-hair bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">Plak een aanvraag (of forward)</h2>
        <p className="mt-1 text-xs text-neutralx-500">Test de AI op een losse mail: plak de inhoud, de AI haalt het eruit en schrijft een concept.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Afzender e-mail (optioneel)" className="rounded-lg border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500" />
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Onderwerp (optioneel)" className="rounded-lg border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500" />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Plak hier de e-mail…"
          className="mt-2 w-full resize-y rounded-lg border border-hairstrong px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => void analyze(false)} disabled={busy || !body.trim()} className="rounded-full border border-brand-500 px-4 py-1.5 text-sm font-semibold text-brand-600 hover:bg-brand-50 disabled:opacity-40">
            {busy ? "Bezig…" : "Analyseer"}
          </button>
          <button type="button" onClick={() => void analyze(true)} disabled={busy || !body.trim()} className="rounded-full bg-brand-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-40">
            Analyseer + bewaar als lead
          </button>
        </div>
        {analysis && (
          <div className="mt-3 rounded-lg border border-hair bg-paper-soft p-3 text-sm">
            {analysis.isOffer ? (
              <>
                <p className="font-semibold text-ok">✓ Offerteaanvraag ({Math.round(analysis.confidence * 100)}% zeker)</p>
                <p className="mt-1 text-neutralx-700">{analysis.samenvatting}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutralx-600">
                  {([["Bedrijf", analysis.company], ["Contact", analysis.contactName], ["Behoefte", analysis.behoefte], ["Aantal", analysis.aantal], ["Locatie", analysis.locatie], ["Periode", analysis.periode]] as [string, string | null][]) .filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><dt className="inline font-medium">{k}:</dt> <dd className="inline">{v}</dd></div>
                  ))}
                </dl>
                {analysis.draftReply && (
                  <div className="mt-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink">Concept-antwoord</span>
                      <button type="button" onClick={() => copy(analysis.draftReply)} className="text-xs text-brand-600 hover:underline">kopieer</button>
                    </div>
                    <pre className="whitespace-pre-wrap rounded border border-hair bg-white p-2 text-xs text-neutralx-700">{analysis.draftReply}</pre>
                  </div>
                )}
              </>
            ) : (
              <p className="text-neutralx-500">Dit lijkt geen offerteaanvraag. {analysis.samenvatting}</p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-hair bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Verwerkte aanvragen</h2>
          <button type="button" onClick={() => void load()} className="text-xs text-brand-600 hover:underline">vernieuwen</button>
        </div>
        <div className="mt-3 space-y-3">
          {(data?.offers ?? []).length === 0 ? (
            <p className="text-sm text-neutralx-400">Nog geen aanvragen verwerkt.</p>
          ) : (
            (data?.offers ?? []).map((o) => (
              <div key={o.id} className="rounded-lg border border-hair p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-ink">{o.company ?? o.fromName ?? o.fromAddress ?? "Onbekend"}</strong>
                  {o.fromAddress && <span className="font-mono text-xs text-neutralx-500">{o.fromAddress}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${o.status === "beantwoord" ? "bg-emerald-100 text-emerald-700" : o.status === "afgewezen" ? "bg-neutralx-100 text-neutralx-500" : "bg-amber-100 text-amber-700"}`}>{o.status}</span>
                  <span className="ml-auto text-[10px] text-neutralx-400">{new Date(o.at).toLocaleString("nl-NL")}</span>
                </div>
                <p className="mt-1 text-sm text-neutralx-700">{o.samenvatting}</p>
                {o.draftReply && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-brand-600">Concept-antwoord</summary>
                    <div className="mt-1 flex items-start gap-2">
                      <pre className="flex-1 whitespace-pre-wrap rounded border border-hair bg-paper-soft p-2 text-xs text-neutralx-700">{o.draftReply}</pre>
                      <button type="button" onClick={() => copy(o.draftReply)} className="flex-shrink-0 text-xs text-brand-600 hover:underline">kopieer</button>
                    </div>
                  </details>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {o.leadId && <Link href="/admin/sales" className="text-brand-600 hover:underline">→ in sales-pijplijn</Link>}
                  <button type="button" onClick={() => void setStatus(o.id, "beantwoord")} className="text-emerald-600 hover:underline">markeer beantwoord</button>
                  <button type="button" onClick={() => void setStatus(o.id, "afgewezen")} className="text-neutralx-500 hover:underline">afwijzen</button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
