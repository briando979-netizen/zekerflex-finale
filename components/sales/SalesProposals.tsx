"use client";

import { useCallback, useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import type { ProposalAction, ProposalStatus, WebsiteProposal } from "@/lib/sales/website-proposal";
import { DOMAIN_LABEL, STATUS_LABEL, euro, isProposalExpired, proposalMailText, shortDay, type ProposalOfferView } from "@/lib/sales/website-proposal-shared";

// ---------------------------------------------------------------------------
// /sales/websitevoorstellen — the website proposals for the sales team
// (lib/sales/website-proposal.ts): type in a company's website, ZekerFlex builds
// the new one, and you send the link yourself. The same list as Admin →
// Websitevoorstellen, without changing prices.
// ---------------------------------------------------------------------------

interface Data {
  proposals: WebsiteProposal[];
  offer: ProposalOfferView;
}

const PILL: Record<ProposalStatus, string> = { concept: "pill-neutral", verstuurd: "pill-neutral", bekeken: "pill-warn", akkoord: "pill-ok", afgewezen: "pill-crit", ingetrokken: "pill-neutral", overgezet: "pill-ok" };

export function SalesProposals({ origin, me }: { origin: string; me: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/sales/websitevoorstellen", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setMessage({ ok: false, text: "Kon de voorstellen niet laden." });
    setData((await r.json()) as Data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy("nieuw");
    setMessage(null);
    const r = await fetch("/api/sales/websitevoorstellen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setMessage({ ok: false, text: d?.error?.message ?? "Het voorstel maken lukte niet." });
    setUrl("");
    setMessage({ ok: true, text: `Het voorstel voor ${d.proposal.bedrijf} staat klaar. Bekijk de nieuwe website en de voorstelpagina voordat je hem verstuurt.` });
    await load();
  }

  async function act(p: WebsiteProposal, action: ProposalAction) {
    if (action === "ingetrokken" && !window.confirm(`Het voorstel voor ${p.bedrijf} intrekken? De nieuwe website gaat offline.`)) return;
    setBusy(p.id);
    const r = await fetch(`/api/sales/websitevoorstellen/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setMessage({ ok: false, text: d?.error?.message ?? "Dat lukte niet." });
    setMessage({ ok: true, text: `${p.bedrijf}: ${d.proposal.history?.[0]?.what ?? "bijgewerkt"}.` });
    await load();
  }

  async function copy(text: string, what: string) {
    setMessage((await copyText(text)) ? { ok: true, text: `${what} gekopieerd.` } : { ok: false, text: "Kopiëren lukte niet in deze browser; selecteer de tekst zelf." });
  }

  const offer = data?.offer;
  const now = Date.now();
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">Websitevoorstellen</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-3 max-w-2xl text-sm text-neutralx-600">
          Vul de website van een bedrijf in. ZekerFlex leest de site, beoordeelt hem en bouwt een nieuwe, luxere website op zekerflex.com/site/bedrijfsnaam, met een voorstelpagina met de prijzen. Jij verstuurt de link zelf; ZekerFlex mailt bedrijven nooit vanzelf.
        </p>
        {offer && (
          <p className="mt-2 text-sm text-neutralx-600">
            Nu: website {offer.website.kortingCents !== null && offer.pricing.kortingPct > 0 ? `${euro(offer.website.kortingCents)} in plaats van ${euro(offer.website.cents)} (nog ${offer.places.left} van de ${offer.places.total} plekken met introductiekorting)` : euro(offer.website.cents)}, plus Website-beheer vanaf {euro(Math.min(...offer.plannen.map((p) => p.priceCentsPerMonth)))} per maand. Alle bedragen exclusief btw.
          </p>
        )}
      </header>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${message.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>
          {message.text}
        </p>
      )}

      <section className="card p-5">
        <h2 className="font-display text-lg font-bold text-ink">Nieuw voorstel</h2>
        <p className="mt-1 text-sm text-neutralx-600">Duurt meestal 20 tot 60 seconden: website lezen, eigen foto&apos;s ophalen, nieuwe site bouwen.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Website van het bedrijf</span>
            <input className="field-input !mt-0" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && void create()} placeholder="Website van het bedrijf, bv. bakkerijjansen.nl" inputMode="url" />
          </label>
          <button type="button" disabled={Boolean(busy) || !url.trim()} onClick={() => void create()} className="btn-primary min-h-11 disabled:opacity-50">
            {busy === "nieuw" ? "Bezig met bouwen…" : "Maak websitevoorstel"}
          </button>
        </div>
      </section>

      {!data ? (
        <div className="card h-24 animate-pulse" />
      ) : data.proposals.length === 0 ? (
        <p className="card p-6 text-sm text-neutralx-600">Nog geen websitevoorstellen. Vul hierboven de website van een bedrijf in.</p>
      ) : (
        <ul className="space-y-3">
          {data.proposals.map((p) => {
            const expired = isProposalExpired(p, now) && p.status !== "akkoord" && p.status !== "ingetrokken" && p.status !== "overgezet";
            const open = p.status !== "ingetrokken" && p.status !== "overgezet";
            return (
              <li key={p.id} className="card space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 font-semibold text-ink">
                    {p.bedrijf}
                    <span className="font-normal text-neutralx-500"> · {p.host} · huidige site {p.check.score}/100</span>
                  </p>
                  <span className={expired ? "pill-crit" : PILL[p.status]}>{expired ? "Verlopen" : STATUS_LABEL[p.status]}</span>
                </div>
                <p className="text-xs text-neutralx-500">
                  Gemaakt {shortDay(p.createdAt)} door {p.createdBy} · geldig tot {shortDay(p.expiresAt)} · {p.views === 1 ? "1 keer bekeken" : `${p.views} keer bekeken`}
                  {p.sentAt ? ` · verstuurd ${shortDay(p.sentAt)}` : ""}
                </p>
                {p.akkoord && (
                  <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ink">
                    Ja op {shortDay(p.akkoord.at)}: {p.akkoord.naam}, {p.akkoord.email}
                    {p.akkoord.telefoon ? `, ${p.akkoord.telefoon}` : ""} · Website-beheer {p.akkoord.pakket === "pro" ? "Pro" : "Basis"} · website {euro(p.akkoord.prijs.teBetalenCents)}
                    {p.akkoord.plek ? ` (introductieplek ${p.akkoord.plek})` : ""} · {DOMAIN_LABEL[p.akkoord.domein] ?? p.akkoord.domein}
                    {p.akkoord.opmerking ? ` · “${p.akkoord.opmerking}”` : ""}
                  </p>
                )}
                {p.overgezet && (
                  <p className="text-sm text-neutralx-600">Overgezet op {shortDay(p.overgezet.at)} naar {p.overgezet.bedrijf}: de website staat in hun websitebouwer.</p>
                )}
                {p.status === "akkoord" && <p className="text-sm text-neutralx-600">Een platformbeheerder zet de website over naar het account van het bedrijf zodra dat klaarstaat.</p>}
                {open && offer && (
                  <div className="flex flex-wrap gap-2 text-sm">
                    <a href={`/site/${p.slug}`} target="_blank" rel="noopener" className="btn-ghost min-h-11">Nieuwe website</a>
                    <a href={`/websitevoorstel/${p.id}`} target="_blank" rel="noopener" className="btn-ghost min-h-11">Voorstelpagina</a>
                    <button type="button" onClick={() => void copy(`${origin}/websitevoorstel/${p.id}`, "Link")} className="btn-ghost min-h-11">Kopieer link</button>
                    <button type="button" onClick={() => void copy(proposalMailText(p, offer, origin, me), "Mailtekst")} className="btn-ghost min-h-11">Kopieer mailtekst</button>
                    {p.status === "concept" && (
                      <button type="button" disabled={busy === p.id} onClick={() => void act(p, "verstuurd")} className="btn-ghost min-h-11">Ik heb hem verstuurd</button>
                    )}
                    <button type="button" disabled={busy === p.id} onClick={() => void act(p, "verlengen")} className="btn-ghost min-h-11">Verleng</button>
                    {p.status !== "akkoord" && p.status !== "afgewezen" && (
                      <button type="button" disabled={busy === p.id} onClick={() => void act(p, "afgewezen")} className="btn-ghost min-h-11">Afgezegd</button>
                    )}
                    <button type="button" disabled={busy === p.id} onClick={() => void act(p, "ingetrokken")} className="btn-ghost min-h-11 text-crit">Intrekken</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
