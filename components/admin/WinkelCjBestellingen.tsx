"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Panel, Pill } from "@/components/admin/kit";
import { euro } from "@/lib/admin/format";

// Beheer → Winkel-AI → Leverancier, onderaan (18 nov 2026): de bestelstroom naar CJ en de productfeed.
// Drie bewuste stappen per bestelling (plaatsen, betalen uit het saldo, volgen), elk ook automatisch aan te zetten;
// de proefstand (sandbox) staat standaard aan, zodat de eigenaar de hele keten kan zien zonder geld of pakket.

type Instellingen = { verzendCents: number; land: string; margePct: number | null; sandbox: boolean; autoBestellen: boolean; autoBetalen: boolean; maxBetaalCents: number };
type Stand = {
  orderId: string; cjOrderId: string | null; status: string; sandbox: boolean; betaald: boolean; bedragUsdCents: number | null; bedragEurCents: number | null;
  logistiek: string | null; trackNumber: string | null; vervoerder: string | null; laatsteFout: string | null; regels: { naam: string; aantal: number }[];
};
type Kandidaat = { orderId: string; createdAt: string; status: string; naam: string; totalCents: number; cjRegels: number; andereRegels: number; stand: Stand | null; statusTekst: string | null };
type Overzicht = { saldoUsdCents: number | null; instellingen: Instellingen; bestellingen: Kandidaat[] };

async function vraag<T>(url: string, body?: unknown, methode = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(url, { method: methode, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(d.error?.message ?? "Dat lukte niet. Probeer het nog eens.");
  return d;
}
const dollar = (cents: number | null) => (cents === null ? "onbekend" : `$ ${(cents / 100).toFixed(2).replace(".", ",")}`);
const datum = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" });

export function CjBestellingen() {
  const [o, setO] = useState<Overzicht | null>(null);
  const [bezig, setBezig] = useState<string>("");
  const [fout, setFout] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string | null>(null);
  const [maxTekst, setMaxTekst] = useState("");
  const [feedBasis, setFeedBasis] = useState("");

  const laad = useCallback(async () => {
    try {
      const d = await vraag<Overzicht>("/api/admin/shop-ai/cj/bestellingen");
      setO(d);
      setMaxTekst((d.instellingen.maxBetaalCents / 100).toFixed(2).replace(".", ","));
    } catch (e) {
      setFout((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void laad();
    setFeedBasis(window.location.origin);
  }, [laad]);

  const doe = async (wat: string, werk: () => Promise<void>) => {
    setBezig(wat);
    setFout(null);
    setBericht(null);
    try {
      await werk();
      await laad();
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig("");
    }
  };

  const zet = (deel: Partial<Instellingen>) =>
    doe("instel", async () => {
      await vraag("/api/admin/shop-ai/cj/sleutel", deel, "PATCH");
      setBericht("Instellingen opgeslagen.");
    });

  const i = o?.instellingen;
  return (
    <>
      <Panel title="Zichtbaar op Google, Instagram, Facebook en TikTok" subtitle="Eén productfeed in het formaat van Google Shopping; de portalen halen hem zelf elke dag op. Alleen producten die aan staan, met foto en voorraad.">
        <p className="text-sm" style={{ color: "var(--a-text)" }}>
          Het adres van de feed: <code className="rounded px-1.5 py-0.5 text-[13px]" style={{ background: "var(--a-soft, #eee)" }}>{feedBasis}/api/shop/feed</code>
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm" style={{ color: "var(--a-text)" }}>
          <li><strong>Google:</strong> merchants.google.com → Producten → Feed toevoegen → &quot;Geplande ophaalactie&quot; → plak het adres. Google wil ook een geverifieerde website, verzend- en retourinformatie; dat vul je daar één keer in.</li>
          <li><strong>Instagram en Facebook:</strong> business.facebook.com → Commerce Manager → Catalogus → Gegevensbronnen → &quot;Gegevensfeed&quot; → &quot;Geplande feed&quot; → plak het adres. Koppel daarna de catalogus aan je Instagram-account (Winkel instellen).</li>
          <li><strong>TikTok:</strong> ads.tiktok.com → Middelen → Catalogus → Productbron → &quot;Geplande feed&quot; → plak het adres. Een echte TikTok Shop (verkopen ín TikTok) bestaat nog niet voor Nederlandse verkopers; de catalogus wel, voor video&apos;s met productlabels en advertenties.</li>
        </ol>
        <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>Titels, omschrijvingen en de pagina&apos;s zelf hebben al een nette zoekmachinetitel, omschrijving en productgegevens (JSON-LD) en staan in de sitemap; Google vindt ze dus ook zonder feed, alleen trager.</p>
      </Panel>

      <Panel title="Bestellingen bij CJ" subtitle="Een betaalde webshopbestelling met CJ-producten gaat in drie stappen naar CJ: plaatsen (adres van de klant mee), betalen uit het vooraf opgewaardeerde CJ-saldo, en volgen tot er een track & trace is. Dan gaat de bestelling op verzonden en krijgt de klant de mail met de volglink; jij krijgt mail en push bij elke stap.">
        {fout && <p role="alert" className="mb-3 text-sm" style={{ color: "var(--a-crit, #b91c1c)" }}>{fout}</p>}
        {bericht && <p className="mb-3 text-sm" style={{ color: "var(--a-ok, #15803d)" }}>{bericht}</p>}
        {o && i && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--a-text)" }}>
              <Pill tone={o.saldoUsdCents === null ? "neutral" : o.saldoUsdCents > 0 ? "money" : "warn"}>CJ-saldo {dollar(o.saldoUsdCents)}</Pill>
              <Pill tone={i.sandbox ? "plan" : "ok"}>{i.sandbox ? "Proefstand: CJ simuleert, geen geld, geen pakket" : "Echt: bestellingen gaan echt de deur uit"}</Pill>
              <span style={{ color: "var(--a-mute)" }}>Opwaarderen doe je bij CJ zelf (My CJ → Wallet). Betalen kan alleen uit dat saldo, nergens anders.</span>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex items-start gap-2 text-sm" style={{ color: "var(--a-text)" }}>
                <input type="checkbox" className="mt-1" checked={i.sandbox} disabled={bezig !== ""} onChange={(e) => { if (e.target.checked || window.confirm("Proefstand uitzetten? Vanaf dan zijn bestellingen bij CJ echt: er gaat geld van het saldo en er gaat een pakket naar de klant.")) void zet({ sandbox: e.target.checked }); }} />
                <span><strong>Proefstand</strong><br /><span style={{ color: "var(--a-mute)" }}>aan = alles gesimuleerd</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm" style={{ color: "var(--a-text)" }}>
                <input type="checkbox" className="mt-1" checked={i.autoBestellen} disabled={bezig !== ""} onChange={(e) => void zet({ autoBestellen: e.target.checked })} />
                <span><strong>Vanzelf plaatsen</strong><br /><span style={{ color: "var(--a-mute)" }}>meteen na de betaling van de klant</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm" style={{ color: "var(--a-text)" }}>
                <input type="checkbox" className="mt-1" checked={i.autoBetalen} disabled={bezig !== "" || !i.autoBestellen} onChange={(e) => { if (!e.target.checked || window.confirm("Vanzelf betalen uit het CJ-saldo aanzetten? Alleen onder de grens per bestelling; elke betaling komt in het logboek en je krijgt een melding.")) void zet({ autoBetalen: e.target.checked }); }} />
                <span><strong>Vanzelf betalen</strong><br /><span style={{ color: "var(--a-mute)" }}>uit het saldo, onder de grens</span></span>
              </label>
              <label className="a-label text-sm">
                Grens per bestelling (€)
                <span className="flex gap-2">
                  <input className="a-input" inputMode="decimal" value={maxTekst} onChange={(e) => setMaxTekst(e.target.value)} />
                  <button type="button" className="a-btn" disabled={bezig !== ""} onClick={() => { const c = Math.round(Number(maxTekst.replace(",", ".")) * 100); if (Number.isFinite(c)) void zet({ maxBetaalCents: c }); }}>Opslaan</button>
                </span>
              </label>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <button type="button" className="a-btn" disabled={bezig !== ""} onClick={() => void doe("volgen", async () => { const r = await vraag<{ volgen: { bekeken: number; verzonden: number; fouten: number } }>("/api/admin/shop-ai/cj/bestellingen", { actie: "volgen" }); setBericht(`Nagevraagd bij CJ: ${r.volgen.bekeken} open, ${r.volgen.verzonden} nu verzonden${r.volgen.fouten ? `, ${r.volgen.fouten} mislukt` : ""}. De cron doet dit elk half uur vanzelf.`); })}>
                {bezig === "volgen" ? "Navragen…" : "Nu navragen bij CJ"}
              </button>
            </div>
            {o.bestellingen.length === 0 ? (
              <Empty title="Nog geen betaalde bestelling met CJ-producten" body="Zodra een klant een CJ-product afrekent, staat de bestelling hier met de knoppen Plaatsen en Betalen." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ color: "var(--a-text)" }}>
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--a-mute)" }}>
                      <th className="py-2 pr-3">Bestelling</th><th className="py-2 pr-3">Klant</th><th className="py-2 pr-3">Bij CJ</th><th className="py-2 pr-3">Inkoop</th><th className="py-2 pr-3">Track &amp; trace</th><th className="py-2">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.bestellingen.map((b) => {
                      const s = b.stand;
                      return (
                        <tr key={b.orderId} className="border-t" style={{ borderColor: "var(--a-border)" }}>
                          <td className="py-2 pr-3"><span className="font-mono text-xs">{b.orderId}</span><span className="block text-xs" style={{ color: "var(--a-mute)" }}>{datum(b.createdAt)} · {euro(b.totalCents)} · {b.cjRegels} stuk{b.cjRegels === 1 ? "" : "s"} van CJ{b.andereRegels ? ` + ${b.andereRegels} eigen` : ""}</span></td>
                          <td className="py-2 pr-3">{b.naam}</td>
                          <td className="py-2 pr-3">
                            {s ? (
                              <><Pill tone={s.betaald ? "ok" : "warn"}>{b.statusTekst}</Pill>{s.sandbox && <span className="ml-1 text-xs" style={{ color: "var(--a-mute)" }}>proef</span>}<span className="block text-xs" style={{ color: "var(--a-mute)" }}>{s.cjOrderId}{s.logistiek ? ` · ${s.logistiek}` : ""}</span>{s.laatsteFout && <span role="alert" className="block text-xs" style={{ color: "var(--a-crit, #b91c1c)" }}>{s.laatsteFout}</span>}</>
                            ) : (
                              <Pill tone="neutral">nog niet geplaatst</Pill>
                            )}
                          </td>
                          <td className="py-2 pr-3">{s ? <>{dollar(s.bedragUsdCents)}{s.bedragEurCents !== null ? <span className="block text-xs" style={{ color: "var(--a-mute)" }}>≈ {euro(s.bedragEurCents)}</span> : null}</> : "–"}</td>
                          <td className="py-2 pr-3">{s?.trackNumber ? <>{s.trackNumber}<span className="block text-xs" style={{ color: "var(--a-mute)" }}>{s.vervoerder ?? s.logistiek}</span></> : "–"}</td>
                          <td className="py-2">
                            {!s && <button type="button" className="a-btn" disabled={bezig !== ""} onClick={() => void doe(b.orderId, async () => { await vraag("/api/admin/shop-ai/cj/bestellingen", { actie: "plaatsen", orderId: b.orderId }); setBericht("Geplaatst bij CJ. Betaal daarna uit het saldo."); })}>{bezig === b.orderId ? "Bezig…" : "Plaatsen bij CJ"}</button>}
                            {s && !s.betaald && <button type="button" className="a-btn a-btn-primary" disabled={bezig !== ""} onClick={() => { if (window.confirm(`Betalen bij CJ: ${dollar(s.bedragUsdCents)} uit het saldo${s.sandbox ? " (proef, gesimuleerd)" : ""}?`)) void doe(b.orderId, async () => { await vraag("/api/admin/shop-ai/cj/bestellingen", { actie: "betalen", orderId: b.orderId }); setBericht("Betaald uit het saldo. CJ pakt nu in; de track & trace komt vanzelf."); }); }}>{bezig === b.orderId ? "Bezig…" : "Betalen uit saldo"}</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
