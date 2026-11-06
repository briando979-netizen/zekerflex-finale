"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Empty, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { euro } from "@/lib/admin/format";
import { prijsUitInkoop, tariefVoor, type InkoopRegel, type MargeBeleid } from "@/lib/shop/winkel-ai-core";

// Admin → Winkel-AI: een idee wordt een volledig productconcept (UIT tot jij
// het goedkeurt), de AI stelt inkoop voor uit voorraad en verkoop (er wordt
// niets besteld of betaald) en zoekt trends met bronnen.

type Concept = { name: string; category: string; gender: string | null; collection: string | null; badge: string | null; description: string; bullets: string[]; sizes: string[]; colors: string[]; soort: string | null };
type Prijs = { prijsCents: number; exclCents: number; margeEchtPct: number };
type Trend = { naam: string; waarom: string; doelgroep: string; soort: string | null; seizoen: string | null };
type Tab = "nieuw" | "inkoop" | "trends";

async function post<T>(url: string, body: unknown, methode = "POST"): Promise<T> {
  const res = await fetch(url, { method: methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(d.error?.message ?? "Dat lukte niet. Probeer het nog eens.");
  return d;
}
const lijst = (s: string) => s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

export function WinkelAI() {
  const [tab, setTab] = useState<Tab>("nieuw");
  return (
    <>
      <PageHead title="Winkel-AI" subtitle="Maak producten uit een idee, laat de AI inkoop voorstellen en trends zoeken. Alles is een voorstel: niets wordt besteld, betaald of zonder jouw akkoord verkocht." />
      <div role="tablist" className="mb-4 flex gap-2">
        {([["nieuw", "Nieuw product"], ["inkoop", "Inkoop"], ["trends", "Trends"]] as const).map(([id, naam]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={`a-btn ${tab === id ? "a-btn-primary" : ""}`}>
            {naam}
          </button>
        ))}
      </div>
      {tab === "nieuw" && <NieuwProduct />}
      {tab === "inkoop" && <Inkoop />}
      {tab === "trends" && <Trends onIdee={() => setTab("nieuw")} />}
    </>
  );
}

function NieuwProduct() {
  const [idee, setIdee] = useState("");
  const [inkoop, setInkoop] = useState("");
  const [bezig, setBezig] = useState<"" | "concept" | "opslaan">("");
  const [fout, setFout] = useState("");
  const [c, setC] = useState<Concept | null>(null);
  const [prijs, setPrijs] = useState<number>(0);
  const [margePct, setMargePct] = useState(55);
  const [metFoto, setMetFoto] = useState(true);
  const [klaar, setKlaar] = useState<{ id: string; fotoGelukt: boolean; fotoMelding: string | null } | null>(null);

  const inkoopCents = inkoop ? Math.round(Number(inkoop.replace(",", ".")) * 100) : null;
  const heeftInkoop = inkoopCents !== null && Number.isFinite(inkoopCents) && inkoopCents > 0;

  const maak = async () => {
    setBezig("concept");
    setFout("");
    setKlaar(null);
    try {
      const d = await post<{ concept: Concept; prijs: Prijs | null; beleid: MargeBeleid }>("/api/admin/shop-ai/concept", { idee, ...(heeftInkoop ? { inkoopEuro: (inkoopCents as number) / 100 } : {}) });
      setC(d.concept);
      setMargePct(d.beleid.margePct);
      setPrijs(d.prijs?.prijsCents ?? 0);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig("");
    }
  };

  const herreken = (m: number) => {
    setMargePct(m);
    if (heeftInkoop && c) setPrijs(prijsUitInkoop(inkoopCents as number, m, tariefVoor(c.name)).prijsCents);
  };

  const bewaar = async () => {
    if (!c) return;
    setBezig("opslaan");
    setFout("");
    try {
      const d = await post<{ id: string; fotoGelukt: boolean; fotoMelding: string | null }>("/api/admin/shop-ai/opslaan", {
        concept: { name: c.name, category: c.category, gender: c.gender, collection: c.collection, badge: c.badge, description: c.description, sizes: c.sizes, colors: c.colors, soort: c.soort },
        inkoopCents: heeftInkoop ? inkoopCents : null,
        prijsCents: prijs,
        metFoto,
      });
      setKlaar(d);
      setC(null);
      setIdee("");
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig("");
    }
  };

  const echteMarge = heeftInkoop && prijs > 0 ? Math.round((1 - (inkoopCents as number) / (prijs / (1 + (c ? tariefVoor(c.name) : 0.21)))) * 1000) / 10 : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Panel title="Het idee" subtitle="Schrijf in gewone woorden wat je wilt verkopen, of plak de omschrijving van je leverancier.">
        <label className="a-label">
          Wat wil je toevoegen?
          <textarea className="a-input" rows={6} value={idee} onChange={(e) => setIdee(e.target.value)} placeholder="Bijvoorbeeld: een warme zwarte fleece trui met rits voor mannen en vrouwen, voor buitenwerk in de winter." />
        </label>
        <label className="a-label mt-3">
          Inkoopprijs per stuk, excl. btw (€)
          <input className="a-input max-w-[10rem]" inputMode="decimal" value={inkoop} onChange={(e) => setInkoop(e.target.value)} placeholder="bijv. 12,50" />
        </label>
        <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>Met een inkoopprijs rekent de AI de verkoopprijs uit je marge uit.</p>
        <button type="button" className="a-btn a-btn-primary mt-4" onClick={maak} disabled={bezig !== "" || idee.trim().length < 3}>
          {bezig === "concept" ? "De AI schrijft het product…" : "Maak productconcept"}
        </button>
        {fout && (
          <div className="mt-3">
            <Notice tone="crit" role="alert">{fout}</Notice>
          </div>
        )}
      </Panel>

      <Panel title="Concept" subtitle="Pas aan wat je wilt. Het product wordt opgeslagen als UIT: jij zet het live in Webshop.">
        {klaar ? (
          <div className="space-y-2">
            <Notice tone="ok">Opgeslagen als uitgezet product. {klaar.fotoGelukt ? "Er is een AI-impressiefoto gemaakt." : klaar.fotoMelding ?? ""}</Notice>
            <p className="text-sm">
              <Link className="underline" href="/admin/shop">Naar Webshop</Link> om het te controleren, een echte foto te zetten en live te zetten. In de paskamer is het meteen te passen zodra het live staat.
            </p>
          </div>
        ) : !c ? (
          <Empty title="Nog geen concept" body="Vul links een idee in en kies Maak productconcept." />
        ) : (
          <div className="space-y-3">
            <label className="a-label">Naam<input className="a-input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="a-label">Categorie
                <select className="a-input" value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })}>
                  {["Werk & PBM", "Kleding", "Werkdag", "Cadeaus"].map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="a-label">Voor
                <select className="a-input" value={c.gender ?? ""} onChange={(e) => setC({ ...c, gender: e.target.value || null })}>
                  <option value="">niet gekozen</option>
                  {["heren", "vrouwen", "kinderen", "unisex"].map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
            </div>
            <label className="a-label">Omschrijving
              <textarea className="a-input" rows={5} maxLength={600} value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="a-label">Maten (komma)<input className="a-input" value={c.sizes.join(", ")} onChange={(e) => setC({ ...c, sizes: lijst(e.target.value) })} /></label>
              <label className="a-label">Kleuren (komma)<input className="a-input" value={c.colors.join(", ")} onChange={(e) => setC({ ...c, colors: lijst(e.target.value) })} /></label>
            </div>
            <p className="text-xs" style={{ color: "var(--a-mute)" }}>
              Varianten: {Math.max(1, c.sizes.length) * Math.max(1, c.colors.length)} stuks, voorraad 0 (verkoopbaar na je eerste inkoop). Paskamer: {c.soort ? <Pill tone="trust">{c.soort}</Pill> : "niet te passen"}.
            </p>
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <label className="a-label">Marge (% van de prijs excl. btw)
                <input className="a-input" type="number" min={5} max={90} value={margePct} onChange={(e) => herreken(Number(e.target.value))} disabled={!heeftInkoop} />
              </label>
              <label className="a-label">Verkoopprijs incl. btw (€)
                <input className="a-input" inputMode="decimal" value={(prijs / 100).toFixed(2).replace(".", ",")} onChange={(e) => setPrijs(Math.round(Number(e.target.value.replace(",", ".")) * 100) || 0)} />
              </label>
            </div>
            {echteMarge !== null && <p className="text-xs" style={{ color: "var(--a-mute)" }}>Bij {euro(prijs / 100)} verdien je {echteMarge}% marge per stuk.</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={metFoto} onChange={(e) => setMetFoto(e.target.checked)} />
              Maak een AI-impressiefoto (vervang die later door een echte productfoto)
            </label>
            <button type="button" className="a-btn a-btn-primary" onClick={bewaar} disabled={bezig !== "" || prijs <= 0}>
              {bezig === "opslaan" ? "Opslaan…" : "Opslaan als concept (uit)"}
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Inkoop() {
  const [data, setData] = useState<{ regels: InkoopRegel[]; beleid: MargeBeleid } | null>(null);
  const [fout, setFout] = useState("");
  const [beleid, setBeleid] = useState<MargeBeleid | null>(null);
  const [melding, setMelding] = useState("");

  const laad = async () => {
    try {
      const r = await fetch("/api/admin/shop-ai/inkoop", { cache: "no-store" });
      if (!r.ok) throw new Error("Het inkoopadvies ophalen lukte niet.");
      const d = (await r.json()) as { regels: InkoopRegel[]; beleid: MargeBeleid };
      setData(d);
      setBeleid(d.beleid);
    } catch (e) {
      setFout((e as Error).message);
    }
  };
  useEffect(() => {
    void laad();
  }, []);

  const bewaarBeleid = async () => {
    if (!beleid) return;
    try {
      await post("/api/admin/shop-ai/beleid", beleid, "PUT");
      setMelding("Beleid opgeslagen.");
      await laad();
    } catch (e) {
      setFout((e as Error).message);
    }
  };

  const csv = () => {
    if (!data) return;
    const rijen = data.regels.map((r) => [r.productNaam, r.size ?? "", r.color ?? "", r.bestel, r.kostenCents === null ? "" : (r.kostenCents / 100).toFixed(2).replace(".", ",")].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob(["﻿" + ["Product;Maat;Kleur;Aantal;Kosten (excl. btw)", ...rijen].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "inkoopvoorstel.csv";
    a.click();
  };

  const totaal = data ? { stuks: data.regels.reduce((s, r) => s + r.bestel, 0), kosten: data.regels.reduce((s, r) => s + (r.kostenCents ?? 0), 0), zonder: data.regels.filter((r) => r.kostenCents === null).length } : null;

  return (
    <div className="space-y-4">
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      <Panel title="Inkoopbeleid" subtitle="Hiermee rekent de AI uit wat er besteld moet worden en welke prijs bij je marge hoort.">
        {beleid && (
          <div className="grid items-end gap-3 sm:grid-cols-5">
            <label className="a-label">Marge %<input className="a-input" type="number" value={beleid.margePct} onChange={(e) => setBeleid({ ...beleid, margePct: Number(e.target.value) })} /></label>
            <label className="a-label">Levertijd (dagen)<input className="a-input" type="number" value={beleid.leverdagen} onChange={(e) => setBeleid({ ...beleid, leverdagen: Number(e.target.value) })} /></label>
            <label className="a-label">Dekking (dagen)<input className="a-input" type="number" value={beleid.dekkingDagen} onChange={(e) => setBeleid({ ...beleid, dekkingDagen: Number(e.target.value) })} /></label>
            <label className="a-label">Doosgrootte<input className="a-input" type="number" value={beleid.doosGrootte} onChange={(e) => setBeleid({ ...beleid, doosGrootte: Number(e.target.value) })} /></label>
            <button type="button" className="a-btn" onClick={bewaarBeleid}>Opslaan</button>
          </div>
        )}
        {melding && <p className="mt-2 text-sm" role="status">{melding}</p>}
      </Panel>
      <Panel
        title="Inkoopvoorstel"
        subtitle="Uit voorraad en de verkoop van de laatste 30 dagen. Dit is een lijst om te bestellen bij je leverancier; ZekerFlex bestelt of betaalt zelf niets."
        actions={data && data.regels.length > 0 ? <button type="button" className="a-btn" onClick={csv}>Download voor je leverancier (Excel)</button> : null}
      >
        {!data ? (
          <p className="text-sm">Laden…</p>
        ) : data.regels.length === 0 ? (
          <Empty title="Niets te bestellen" body="De voorraad is ruim genoeg voor de komende weken." />
        ) : (
          <>
            {totaal && (
              <p className="mb-3 text-sm">
                <strong>{totaal.stuks}</strong> stuks, geschatte inkoop <strong>{euro(totaal.kosten / 100)}</strong> excl. btw{totaal.zonder > 0 ? ` (voor ${totaal.zonder} regels is geen inkoopprijs ingevuld)` : ""}.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: "var(--a-mute)" }}>
                    <th className="py-2 pr-3">Product</th><th className="pr-3">Maat / kleur</th><th className="pr-3">Voorraad</th><th className="pr-3">Per dag</th><th className="pr-3">Dekt nog</th><th className="pr-3">Bestel</th><th>Kosten</th>
                  </tr>
                </thead>
                <tbody>
                  {data.regels.map((r) => (
                    <tr key={r.variantId} className="border-t" style={{ borderColor: "var(--a-line)" }}>
                      <td className="py-2 pr-3 font-medium">{r.productNaam}</td>
                      <td className="pr-3">{[r.size, r.color].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="pr-3">{r.stock}</td>
                      <td className="pr-3">{r.perDag}</td>
                      <td className="pr-3">{r.reden === "uitverkocht" ? <Pill tone="crit">uitverkocht</Pill> : r.reden === "geen-verkoop" ? <Pill tone="neutral">nieuw</Pill> : `${r.dekkingDagen} dgn`}</td>
                      <td className="pr-3 font-semibold">{r.bestel}</td>
                      <td>{r.kostenCents === null ? "—" : euro(r.kostenCents / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function Trends({ onIdee }: { onIdee: () => void }) {
  const [focus, setFocus] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [uit, setUit] = useState<{ trends: Trend[]; bronnen: { titel: string; url: string }[]; metWeb: boolean } | null>(null);

  const zoek = async () => {
    setBezig(true);
    setFout("");
    try {
      setUit(await post("/api/admin/shop-ai/trends", focus ? { focus } : {}));
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig(false);
    }
  };

  return (
    <Panel title="Trends" subtitle="De AI zoekt wat er nu speelt in werk- en vrijetijdskleding voor Nederland en geeft concrete productideeën, met bronnen.">
      <div className="flex flex-wrap items-end gap-3">
        <label className="a-label min-w-[16rem] flex-1">Focus (optioneel)<input className="a-input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="bijv. winter, horeca, bouw, dames" /></label>
        <button type="button" className="a-btn a-btn-primary" onClick={zoek} disabled={bezig}>{bezig ? "Zoeken…" : "Zoek trends"}</button>
      </div>
      {fout && (
        <div className="mt-3">
          <Notice tone="crit" role="alert">{fout}</Notice>
        </div>
      )}
      {uit && (
        <div className="mt-4 space-y-3">
          {!uit.metWeb && <Notice tone="warn">Zoeken op het web was niet beschikbaar; dit is gebaseerd op de kennis van de AI en kan verouderd zijn.</Notice>}
          <ul className="grid gap-3 sm:grid-cols-2">
            {uit.trends.map((t) => (
              <li key={t.naam} className="rounded-lg border p-3" style={{ borderColor: "var(--a-line)" }}>
                <p className="font-semibold">{t.naam}</p>
                <p className="mt-1 text-sm">{t.waarom}</p>
                <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>{[t.doelgroep, t.seizoen].filter(Boolean).join(" · ")}</p>
                <button type="button" className="a-btn mt-2" onClick={() => (navigator.clipboard?.writeText(`${t.naam}. ${t.waarom}`).catch(() => undefined), onIdee())}>Maak hier een product van</button>
              </li>
            ))}
          </ul>
          {uit.bronnen.length > 0 && (
            <div>
              <p className="text-xs font-semibold">Bronnen</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {uit.bronnen.map((b) => (
                  <li key={b.url}><a className="underline" href={b.url} target="_blank" rel="noopener noreferrer">{b.titel}</a></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
