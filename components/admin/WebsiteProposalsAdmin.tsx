"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { Empty, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import type { ProposalAction, ProposalStatus, WebsiteProposal } from "@/lib/sales/website-proposal";
import { DOMAIN_LABEL as DOMEIN, STATUS_LABEL, euro, isProposalExpired, proposalMailText as mailText, shortDay as day, type ProposalOfferView as Offer } from "@/lib/sales/website-proposal-shared";

// ---------------------------------------------------------------------------
// Admin → Websitevoorstellen (lib/sales/website-proposal.ts): make a proposal
// from a company's website address, send it yourself (copy the link or a ready
// e-mail text), and follow it up: seen, yes, no, more time, withdraw. Prices
// and the launch discount are set at the bottom. Sales people have the same
// list without the prices at /sales/websitevoorstellen.
// ---------------------------------------------------------------------------

interface Data {
  proposals: WebsiteProposal[];
  offer: Offer;
  pricingSet: boolean;
  /** proposal id → the companies its "ja" e-mail already manages (a transfer needs exactly one) */
  accounts: Record<string, string[]>;
}

const TONE: Record<ProposalStatus, Tone> = { concept: "neutral", verstuurd: "plan", bekeken: "trust", akkoord: "ok", afgewezen: "warn", ingetrokken: "neutral", overgezet: "ok" };
const STATUS = Object.fromEntries((Object.keys(TONE) as ProposalStatus[]).map((s) => [s, { label: STATUS_LABEL[s], tone: TONE[s] }])) as Record<ProposalStatus, { label: string; tone: Tone }>;

export function WebsiteProposalsAdmin({ origin, me }: { origin: string; me: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/websitevoorstellen", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setMessage({ tone: "crit", text: "Kon de voorstellen niet laden." });
    setData((await r.json()) as Data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy("nieuw");
    setMessage(null);
    const r = await fetch("/api/admin/websitevoorstellen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setMessage({ tone: "crit", text: d?.error?.message ?? "Het voorstel maken lukte niet." });
    setUrl("");
    setMessage({ tone: "ok", text: `Voorstel voor ${d.proposal.bedrijf} staat klaar. Bekijk de nieuwe website en de voorstelpagina voordat je hem verstuurt.` });
    await load();
  }

  async function act(p: WebsiteProposal, action: ProposalAction | "meten") {
    if (action === "ingetrokken" && !window.confirm(`Het voorstel voor ${p.bedrijf} intrekken? De nieuwe website gaat offline en het webadres komt weer vrij.`)) return;
    setBusy(p.id);
    if (action === "meten") setMeasuring(p.id);
    const r = await fetch(`/api/admin/websitevoorstellen/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    setMeasuring(null);
    if (!r?.ok) return setMessage({ tone: "crit", text: d?.error?.message ?? "Dat lukte niet." });
    setMessage({ tone: "ok", text: action === "meten" ? `${p.bedrijf}: de nieuwe site scoort ${d.proposal.nieuw?.score ?? "?"}/100.` : `${p.bedrijf}: ${d.proposal.history?.[0]?.what ?? "bijgewerkt"}.` });
    await load();
  }

  async function copy(text: string, what: string) {
    setMessage((await copyText(text)) ? { tone: "ok", text: `${what} gekopieerd.` } : { tone: "warn", text: "Kopiëren lukte niet in deze browser; selecteer de tekst zelf." });
  }

  // after a yes: the site becomes the company's own, by the e-mail address of its admin
  const [transferTo, setTransferTo] = useState<Record<string, string>>({});
  async function transfer(p: WebsiteProposal, email: string) {
    if (!window.confirm(`De website overzetten naar het bedrijfsaccount van ${email}? Hij wordt dan van dat bedrijf, staat offline tot zij hem online zetten met Website-beheer, en het voorstel is afgerond.`)) return;
    setBusy(p.id);
    const r = await fetch(`/api/admin/websitevoorstellen/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "overzetten", email }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(null);
    if (!r?.ok) return setMessage({ tone: "crit", text: d?.error?.message ?? "Overzetten lukte niet." });
    setMessage({ tone: "ok", text: `De website van ${p.bedrijf} staat nu bij ${d.proposal.overgezet?.bedrijf ?? "het bedrijf"}, onder Website → Website bouwen. Online zetten doen ze zelf met Website-beheer.` });
    await load();
  }

  const now = Date.now();
  return (
    <div className="space-y-4">
      <PageHead
        title="Websitevoorstellen"
        subtitle="We lezen de website van een bedrijf, beoordelen hem en bouwen er een nieuwe, luxere website voor op zekerflex.com/site/<bedrijfsnaam>. Jij bekijkt het voorstel en verstuurt het zelf; ZekerFlex mailt bedrijven hier nooit vanzelf."
      />
      {data && !data.pricingSet && (
        <Notice tone="warn">
          Dit zijn nog de startprijzen: de website {euro(data.offer.pricing.websiteCents)} eenmalig, {data.offer.pricing.kortingPct}% introductiekorting voor de eerste {data.offer.pricing.plekken} bedrijven. Zet je eigen prijzen onderaan voordat je voorstellen verstuurt.
        </Notice>
      )}
      {message && (
        <Notice tone={message.tone} role={message.tone === "crit" ? "alert" : "status"}>
          {message.text}
        </Notice>
      )}

      <Panel title="Nieuw voorstel" subtitle="Het adres van de huidige website van het bedrijf. Duurt meestal 20 tot 60 seconden: website lezen, eigen foto's ophalen, nieuwe site bouwen.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="a-label min-w-[18rem] flex-1">
            Website van het bedrijf
            <input className="a-input" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && void create()} placeholder="bijvoorbeeld schildersbedrijfdevries.nl" inputMode="url" />
          </label>
          <button type="button" disabled={Boolean(busy) || !url.trim()} onClick={() => void create()} className="a-button disabled:opacity-50">
            {busy === "nieuw" ? "Bezig met bouwen…" : "Maak websitevoorstel"}
          </button>
        </div>
      </Panel>

      <Panel
        flush
        title="Voorstellen"
        subtitle={data ? `${data.proposals.length} in totaal · introductiekorting: nog ${data.offer.places.left} van de ${data.offer.places.total} plekken` : undefined}
      >
        {!data ? (
          <div className="h-16 animate-pulse" />
        ) : data.proposals.length === 0 ? (
          <Empty title="Nog geen websitevoorstellen" body="Vul hierboven de website van een bedrijf in om het eerste voorstel te maken." />
        ) : (
          <ul>
            {data.proposals.map((p) => {
              const expired = isProposalExpired(p, now);
              const st = STATUS[p.status];
              const link = `${origin}/websitevoorstel/${p.id}`;
              const open = p.status !== "ingetrokken" && p.status !== "overgezet";
              return (
                <li key={p.id} className="space-y-2 px-4 py-4 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[0.875rem] font-medium" style={{ color: "var(--a-text)" }}>
                      {p.bedrijf}
                      <span className="font-normal" style={{ color: "var(--a-mute)" }}>
                        {" "}· {p.host} · huidige site {p.check.score}/100{p.nieuw ? ` → nieuwe site ${p.nieuw.score}/100` : ""}
                      </span>
                    </p>
                    {expired && open && p.status !== "akkoord" ? <Pill tone="crit">Verlopen</Pill> : <Pill tone={st.tone}>{st.label}</Pill>}
                  </div>
                  <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                    Gemaakt {day(p.createdAt)} door {p.createdBy} · geldig tot {day(p.expiresAt)} · {p.views === 1 ? "1 keer bekeken" : `${p.views} keer bekeken`}
                    {p.sentAt ? ` · verstuurd ${day(p.sentAt)}` : ""}
                  </p>
                  {p.akkoord && (
                    <p className="text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
                      Ja op {day(p.akkoord.at)}: {p.akkoord.naam}, {p.akkoord.email}
                      {p.akkoord.telefoon ? `, ${p.akkoord.telefoon}` : ""} · Website-beheer {p.akkoord.pakket === "pro" ? "Pro" : "Basis"} · website {euro(p.akkoord.prijs.teBetalenCents)}
                      {p.akkoord.plek ? ` (introductieplek ${p.akkoord.plek}, ${p.akkoord.prijs.kortingPct}% korting)` : ""} · {DOMEIN[p.akkoord.domein] ?? p.akkoord.domein}
                      {p.akkoord.opmerking ? ` · “${p.akkoord.opmerking}”` : ""}
                    </p>
                  )}
                  {p.overgezet && (
                    <p className="text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
                      Overgezet op {day(p.overgezet.at)} naar {p.overgezet.bedrijf}: de website staat in hun websitebouwer en gaat online zodra zij Website-beheer nemen.
                    </p>
                  )}
                  {p.status === "akkoord" && p.akkoord && (
                    <p className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--a-mute)" }}>
                      {(data.accounts[p.id]?.length ?? 0) === 1 ? (
                        <>
                          <Pill tone="ok">Account staat klaar</Pill>
                          {p.akkoord.email} beheert {data.accounts[p.id]?.[0]}: je kunt nu overzetten.
                        </>
                      ) : data.accounts[p.id] ? (
                        <>
                          <Pill tone="warn">Meerdere bedrijven</Pill>
                          {p.akkoord.email} beheert {data.accounts[p.id]?.join(", ")}. Vul het e-mailadres van de beheerder van het juiste bedrijf in.
                        </>
                      ) : (
                        <>
                          <Pill tone="warn">Nog geen account</Pill>
                          Nog geen bedrijfsaccount met {p.akkoord.email}. Het bedrijf kan er zelf een maken met de knop na hun ja; dan zie je het hier.
                        </>
                      )}
                    </p>
                  )}
                  {p.status === "akkoord" && (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="a-label min-w-[16rem] flex-1">
                        E-mailadres van de beheerder van het bedrijfsaccount
                        <input
                          className="a-input"
                          type="email"
                          value={transferTo[p.id] ?? p.akkoord?.email ?? ""}
                          onChange={(e) => setTransferTo((t) => ({ ...t, [p.id]: e.target.value }))}
                          placeholder="naam@bedrijf.nl"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy === p.id || !(transferTo[p.id] ?? p.akkoord?.email ?? "").includes("@")}
                        onClick={() => void transfer(p, (transferTo[p.id] ?? p.akkoord?.email ?? "").trim())}
                        className="a-button a-button-primary text-xs disabled:opacity-50"
                      >
                        Zet over naar bedrijf
                      </button>
                    </div>
                  )}
                  {open && (
                    <div className="flex flex-wrap gap-2">
                      <a href={`/site/${p.slug}`} target="_blank" rel="noopener" className="a-button text-xs">Nieuwe website</a>
                      <Link href={`/admin/websitevoorstellen/${p.id}/bouwer`} className="a-button text-xs">Aanpassen in de bouwer</Link>
                      <a href={`/websitevoorstel/${p.id}`} target="_blank" rel="noopener" className="a-button text-xs">Voorstelpagina</a>
                      <button type="button" onClick={() => void copy(link, "Link")} className="a-button text-xs">Kopieer link</button>
                      <button type="button" onClick={() => void copy(mailText(p, data.offer, origin, me), "Mailtekst")} className="a-button text-xs">Kopieer mailtekst</button>
                      {p.status === "concept" && (
                        <button type="button" disabled={busy === p.id} onClick={() => void act(p, "verstuurd")} className="a-button text-xs">Ik heb hem verstuurd</button>
                      )}
                      <button type="button" disabled={busy === p.id} onClick={() => void act(p, "meten")} className="a-button text-xs">{measuring === p.id ? "Bezig met meten…" : "Meet nieuwe site"}</button>
                      <button type="button" disabled={busy === p.id} onClick={() => void act(p, "verlengen")} className="a-button text-xs">Verleng {data.offer.pricing.geldigDagen} dagen</button>
                      {p.status !== "akkoord" && p.status !== "afgewezen" && (
                        <button type="button" disabled={busy === p.id} onClick={() => void act(p, "afgewezen")} className="a-button text-xs">Afgezegd</button>
                      )}
                      {p.akkoord?.plek ? (
                        <button type="button" disabled={busy === p.id} onClick={() => void act(p, "plek-vrijgeven")} className="a-button text-xs">Introductieplek vrijgeven</button>
                      ) : null}
                      <button type="button" disabled={busy === p.id} onClick={() => void act(p, "ingetrokken")} className="a-button text-xs">Intrekken</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {data && <PricingPanel offer={data.offer} onSaved={(text) => { setMessage({ tone: "ok", text }); void load(); }} onError={(text) => setMessage({ tone: "crit", text })} />}
    </div>
  );
}

/** "495", "495,50", "1.250,00" and "495.50" → cents; NaN for anything else. */
export function parseEuro(input: string): number {
  const t = input.trim().replace(/[\s€]/g, "");
  const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, "");
  return /^\d+(\.\d{1,2})?$/.test(n) ? Math.round(Number(n) * 100) : NaN;
}

function PricingPanel({ offer, onSaved, onError }: { offer: Offer; onSaved: (text: string) => void; onError: (text: string) => void }) {
  const [websiteEuro, setWebsiteEuro] = useState(String(offer.pricing.websiteCents / 100).replace(".", ","));
  const [kortingPct, setKortingPct] = useState(String(offer.pricing.kortingPct));
  const [plekken, setPlekken] = useState(String(offer.pricing.plekken));
  const [geldigDagen, setGeldigDagen] = useState(String(offer.pricing.geldigDagen));
  const [busy, setBusy] = useState(false);

  const cents = parseEuro(websiteEuro);
  async function save() {
    const body = { websiteCents: cents, kortingPct: Number(kortingPct), plekken: Number(plekken), geldigDagen: Number(geldigDagen) };
    if (!Object.values(body).every((v) => Number.isInteger(v) && v >= 0)) return onError("Vul overal een geheel getal in (de prijs mag centen hebben).");
    setBusy(true);
    const r = await fetch("/api/admin/websitevoorstellen", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return onError(d?.error?.message ?? "Opslaan lukte niet.");
    onSaved("Prijzen opgeslagen. Ze gelden meteen op alle voorstelpagina's.");
  }

  return (
    <Panel title="Prijzen en introductiekorting" subtitle={`Website-beheer komt uit de echte abonnementen: ${offer.plannen.map((p) => `${p.label} ${euro(p.priceCentsPerMonth)} per maand`).join(", ")}. Alle bedragen exclusief btw.`}>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="a-label">
          Website, eenmalig (€)
          <input className="a-input" inputMode="decimal" value={websiteEuro} onChange={(e) => setWebsiteEuro(e.target.value)} aria-describedby="wv-prijs" />
          <span id="wv-prijs" className="text-xs font-normal" style={{ color: Number.isNaN(cents) ? "var(--a-crit)" : "var(--a-mute)" }}>
            {Number.isNaN(cents) ? "Geen geldig bedrag" : `= ${euro(cents)}${offer.pricing.kortingPct ? `, met korting ${euro(Math.round((cents * (100 - (Number(kortingPct) || 0))) / 100))}` : ""}`}
          </span>
        </label>
        <label className="a-label">
          Introductiekorting (%)
          <input className="a-input" inputMode="numeric" value={kortingPct} onChange={(e) => setKortingPct(e.target.value)} />
        </label>
        <label className="a-label">
          Aantal bedrijven met korting
          <input className="a-input" inputMode="numeric" value={plekken} onChange={(e) => setPlekken(e.target.value)} />
        </label>
        <label className="a-label">
          Voorstel geldig (dagen)
          <input className="a-input" inputMode="numeric" value={geldigDagen} onChange={(e) => setGeldigDagen(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Nu vergeven: {offer.places.taken} van de {offer.places.total} plekken. Een plek gaat pas weg als een bedrijf ja zegt; trek je dat voorstel in, dan komt hij weer vrij.
        </p>
        <button type="button" disabled={busy} onClick={() => void save()} className="a-button disabled:opacity-50">
          {busy ? "Opslaan…" : "Prijzen opslaan"}
        </button>
      </div>
    </Panel>
  );
}
