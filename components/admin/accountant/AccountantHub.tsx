"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { FRANCHISE, FRANCHISE_BRON, berekenFranchise, teLaatKosten } from "@/lib/accountant/franchise";
import { KENNIS, kennisBeschrijving } from "@/lib/accountant/kennis";
import { STRUCTUUR, dagenTot, type StructuurStatus, type StructuurToestand } from "@/lib/accountant/structuur";
import type { VraagAntwoord } from "@/lib/accountant/antwoord";
import type { Ernst, MaandcontroleUitslag } from "@/lib/accountant/maandcontrole-kern";
import type { Jaarconcept } from "@/lib/accountant/jaar-kern";

// ---------------------------------------------------------------------------
// Admin → Financiën → Accountant: Structuur, Delaware, Vraag en de maandcontrole op de echte
// boekhouding (lib/accountant/maandcontrole.ts, alleen lezen); jaarafsluiting en dossier volgen nog.
// De AI-accountant is geen geregistreerd accountant of belastingadviseur: geen verklaring,
// handtekening of indiening.
// ---------------------------------------------------------------------------

type Tab = "structuur" | "delaware" | "vraag" | "boekhouding";
const TABS: { id: Tab; label: string }[] = [
  { id: "structuur", label: "Structuurcheck" },
  { id: "delaware", label: "Delaware-belasting" },
  { id: "vraag", label: "Vraag het de accountant" },
  { id: "boekhouding", label: "Maand, jaar en dossier" },
];

const STATUS: Record<StructuurStatus, { naam: string; tone: Tone }> = {
  open: { naam: "Nog niet geregeld", tone: "warn" },
  bezig: { naam: "Bezig", tone: "plan" },
  klaar: { naam: "Klaar", tone: "ok" },
};

interface Overzicht {
  structuur: StructuurToestand;
  vragen: { op: string; vraag: string; soort: string }[];
  kennisRegels: number;
}

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(data?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return data;
}

const usd = (n: number) => `$${n.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}`;
const num = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
const veld = "w-full rounded-md border px-3 py-2 text-sm";

export function AccountantHub() {
  const [tab, setTab] = useState<Tab>("structuur");
  const [data, setData] = useState<Overzicht | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      setData(await api<Overzicht>("/api/admin/accountant"));
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  const open = data ? STRUCTUUR.filter((p) => data.structuur[p.id] !== "klaar").length : null;

  return (
    <div className="space-y-5">
      <PageHead title="Accountant" subtitle="Een hulp bij de administratie van zekerflex, Inc.: wat is geregeld, wat kost Delaware en waar staat het antwoord." />
      <Notice tone="warn">
        De AI-accountant is geen geregistreerd accountant of belastingadviseur. Hij geeft geen verklaring, zet geen handtekening en dient niets in. Jij blijft als bestuurder verantwoordelijk; laat beslissingen bevestigen door een mens.
      </Notice>
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      <KpiStrip
        items={[
          { label: "Punten nog open", value: open === null ? "…" : String(open), tone: open ? "warn" : "ok" },
          { label: "Regels met bron", value: String(KENNIS.length), tone: "trust" },
          { label: "Bron zelf gelezen", value: `${KENNIS.filter((r) => r.zekerheid === "gelezen").length} van ${KENNIS.length}`, tone: "neutral" },
        ]}
      />
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-full border px-3 py-1.5 text-sm ${tab === t.id ? "font-semibold" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "structuur" && <Structuur toestand={data?.structuur ?? null} onChange={(s) => setData((d) => (d ? { ...d, structuur: s } : d))} />}
      {tab === "delaware" && <Delaware />}
      {tab === "vraag" && <Vraag vragen={data?.vragen ?? []} naVraag={laad} />}
      {tab === "boekhouding" && <Boekhouding />}
    </div>
  );
}

function Structuur({ toestand, onChange }: { toestand: StructuurToestand | null; onChange: (s: StructuurToestand) => void }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const nu = useMemo(() => new Date(), []);
  const zet = async (id: string, status: StructuurStatus) => {
    setBezig(id);
    try {
      const r = await api<{ structuur: StructuurToestand }>("/api/admin/accountant", { actie: "structuur", id, status });
      onChange(r.structuur);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBezig(null);
    }
  };
  if (!toestand) return <Panel title="Structuurcheck"><p className="text-sm">Laden…</p></Panel>;
  return (
    <div className="space-y-4">
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {STRUCTUUR.map((p) => {
        const s = toestand[p.id] ?? p.start;
        const bron = KENNIS.find((r) => r.id === p.bronId);
        const dagen = p.uiterlijk ? dagenTot(p.uiterlijk, nu) : null;
        return (
          <Panel key={p.id} title={p.titel} actions={<Pill tone={STATUS[s].tone}>{STATUS[s].naam}</Pill>}>
            <dl className="space-y-2 text-sm">
              <div><dt className="font-semibold">Wat is het</dt><dd>{p.wat}</dd></div>
              <div><dt className="font-semibold">Waarom telt het</dt><dd>{p.waarom}</dd></div>
              {s !== "klaar" && <div><dt className="font-semibold">Volgende stap</dt><dd>{p.volgende}</dd></div>}
              {p.uiterlijk && dagen !== null && (
                <div>
                  <dt className="font-semibold">Uiterlijk</dt>
                  <dd>{p.uiterlijk.split("-").reverse().join("-")} {s !== "klaar" && (dagen < 0 ? "(verlopen)" : `(nog ${dagen} ${dagen === 1 ? "dag" : "dagen"})`)}</dd>
                </div>
              )}
              {bron && (
                <div>
                  <dt className="font-semibold">Bron</dt>
                  <dd>
                    {bron.bron.url.startsWith("http") ? <a href={bron.bron.url} target="_blank" rel="noopener noreferrer" className="underline">{bron.bron.naam}</a> : bron.bron.naam}
                    {" · "}{kennisBeschrijving(bron)}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Status van ${p.titel}`}>
              {(["open", "bezig", "klaar"] as StructuurStatus[]).map((k) => (
                <button key={k} disabled={bezig === p.id || s === k} onClick={() => void zet(p.id, k)} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-60">
                  {STATUS[k].naam}
                </button>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function Delaware() {
  // Beginwaarden uit wat de eigenaar meldde (10 miljoen aandelen, allemaal uitgegeven voor $100); de nominale waarde staat niet vast: controleer hem in de oprichtingsakte.
  const [geaut, setGeaut] = useState("10000000");
  const [uitg, setUitg] = useState("10000000");
  const [assets, setAssets] = useState("100");
  const [nom, setNom] = useState("0,00001");
  const [maanden, setMaanden] = useState("0");
  const u = berekenFranchise({ geautoriseerd: num(geaut), uitgegeven: num(uitg), grossAssets: num(assets), nominaal: num(nom) });
  const gunstig = u.gunstigste === "apvc" ? "de assumed par value capital-methode" : u.gunstigste === "autorisatie" ? "de authorized shares-methode" : u.gunstigste === "gelijk" ? "beide methodes (even duur)" : null;
  return (
    <div className="space-y-4">
      <Panel title="Gegevens per 31 december">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Geautoriseerde aandelen<input className={veld} inputMode="decimal" value={geaut} onChange={(e) => setGeaut(e.target.value)} /></label>
          <label className="text-sm">Uitgegeven aandelen<input className={veld} inputMode="decimal" value={uitg} onChange={(e) => setUitg(e.target.value)} /></label>
          <label className="text-sm">Totale bezittingen in dollars (total assets, Schedule L)<input className={veld} inputMode="decimal" value={assets} onChange={(e) => setAssets(e.target.value)} /></label>
          <label className="text-sm">Nominale waarde per aandeel in dollars (par value)<input className={veld} inputMode="decimal" value={nom} onChange={(e) => setNom(e.target.value)} /></label>
        </div>
        <p className="mt-2 text-xs">De beginwaarden volgen wat je opgaf (10 miljoen aandelen, alles uitgegeven voor $100). De nominale waarde staat in de oprichtingsakte: controleer hem.</p>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Authorized shares-methode" actions={<Pill tone={u.gunstigste === "autorisatie" ? "ok" : "neutral"}>{usd(u.autorisatieMethode.belasting)}</Pill>}>
          <ul className="list-disc space-y-1 pl-5 text-sm">{u.autorisatieMethode.uitleg.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-2 text-xs">Dit bedrag zet Delaware vaak op de rekening.</p>
        </Panel>
        <Panel title="Assumed par value capital-methode" actions={u.apvcMethode ? <Pill tone={u.gunstigste === "apvc" ? "ok" : "neutral"}>{usd(u.apvcMethode.belasting)}</Pill> : <Pill>Niet te berekenen</Pill>}>
          {u.apvcMethode ? <ul className="list-disc space-y-1 pl-5 text-sm">{u.apvcMethode.uitleg.map((t) => <li key={t}>{t}</li>)}</ul> : <p className="text-sm">{u.apvcNiet}</p>}
        </Panel>
      </div>
      <Panel title="Wat je betaalt">
        <p className="text-sm">
          {gunstig ? <>Het voordeligst is <strong>{gunstig}</strong>: {usd(u.belasting)} franchise tax{u.verschil && u.verschil > 0 ? <>, {usd(u.verschil)} minder dan het bedrag van de authorized shares-methode</> : null}. </> : <>Zonder de tweede methode geldt {usd(u.belasting)}. </>}
          Met de annual report fee van {usd(u.annualReportFee)} is dat <strong>{usd(u.totaal)}</strong>. Uiterlijk 1 maart.
        </p>
        <p className="mt-2 text-sm">Je moet op de aangifte voor de tweede methode zelf opgeven: de totale bezittingen en het aantal uitgegeven aandelen, per 31 december. Zonder die gegevens neemt Delaware de authorized shares-methode.</p>
        <label className="mt-3 block text-sm">Hoeveel maanden te laat? <input className={`${veld} mt-1 max-w-[8rem]`} inputMode="numeric" value={maanden} onChange={(e) => setMaanden(e.target.value)} /></label>
        {num(maanden) > 0 && <p className="mt-1 text-sm">Boete plus rente: {usd(teLaatKosten(u.belasting, num(maanden)))} ({usd(FRANCHISE.boeteTeLaat)} boete plus 1,5% per maand over belasting en boete).</p>}
      </Panel>
      <Notice tone="plan">
        Bedragen gelezen op {FRANCHISE_BRON.gelezen.split("-").reverse().join("-")} bij <a href={FRANCHISE_BRON.url} target="_blank" rel="noopener noreferrer" className="underline">Delaware Division of Corporations</a>. Delaware kan ze wijzigen: laat ze bevestigen voordat je betaalt. Een grote corporate filer heeft een hoger maximum ($250.000); dat geldt hier niet.
      </Notice>
    </div>
  );
}

function Vraag({ vragen, naVraag }: { vragen: { op: string; vraag: string; soort: string }[]; naVraag: () => Promise<void> }) {
  const [vraag, setVraag] = useState("");
  const [bezig, setBezig] = useState(false);
  const [antwoord, setAntwoord] = useState<VraagAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const stel = async () => {
    setBezig(true);
    setFout(null);
    try {
      const r = await api<{ antwoord: VraagAntwoord }>("/api/admin/accountant", { actie: "vraag", vraag });
      setAntwoord(r.antwoord);
      void naVraag();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  };
  return (
    <div className="space-y-4">
      <Panel title="Stel een vraag">
        <form onSubmit={(e) => { e.preventDefault(); void stel(); }} className="space-y-3">
          <label className="block text-sm" htmlFor="acc-vraag">Bijvoorbeeld: moet ik me bij de KvK inschrijven? Wat is Form 5472? Wanneer moet de 83(b) binnen zijn?</label>
          <textarea id="acc-vraag" className={veld} rows={3} maxLength={500} value={vraag} onChange={(e) => setVraag(e.target.value)} />
          {fout && <p role="alert" className="text-sm">{fout}</p>}
          <button type="submit" disabled={bezig || vraag.trim().length < 5} className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-60">{bezig ? "Even zoeken…" : "Vraag stellen"}</button>
        </form>
      </Panel>
      {antwoord && (
        <Panel title={antwoord.soort === "antwoord" ? "Antwoord" : "Dit weet ik niet zeker"} actions={<Pill tone={antwoord.soort === "antwoord" ? "ok" : "warn"}>{antwoord.door === "model" ? "Geschreven uit de bronnen" : "Uit de kennisbank"}</Pill>}>
          <p className="whitespace-pre-line text-sm">{antwoord.tekst}</p>
          {antwoord.vraagVoorMens && <textarea readOnly className={`${veld} mt-3`} rows={3} value={antwoord.vraagVoorMens} aria-label="Vraag voor een menselijk accountant" />}
          {antwoord.bronnen.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {antwoord.bronnen.map((b) => (
                <li key={b.naam + b.url}>
                  Bron: {b.url.startsWith("http") ? <a href={b.url} target="_blank" rel="noopener noreferrer" className="underline">{b.naam}</a> : b.naam}{" · "}
                  {b.zekerheid === "gelezen" ? "bron zelf gelezen" : "uit algemene kennis, laten bevestigen"}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      {vragen.length > 0 && (
        <Panel title="Laatste vragen">
          <ul className="space-y-1 text-sm">{vragen.slice(0, 8).map((v) => <li key={v.op}>{v.vraag} <Pill tone={v.soort === "antwoord" ? "ok" : "warn"}>{v.soort === "antwoord" ? "beantwoord" : "naar een mens"}</Pill></li>)}</ul>
        </Panel>
      )}
    </div>
  );
}

const ERNST: Record<Ernst, { naam: string; tone: Tone }> = {
  probleem: { naam: "Probleem", tone: "crit" },
  nakijken: { naam: "Nakijken", tone: "warn" },
  info: { naam: "Ter info", tone: "neutral" },
};

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
/** "2027-03-01" → "1 maart 2027", zonder tijdzone (het is al een Amsterdamse dag). */
const dagTekst = (dag: string) => `${Number(dag.slice(8, 10))} ${MAANDEN[Number(dag.slice(5, 7)) - 1] ?? ""} ${dag.slice(0, 4)}`;
const maandTekst = (dag: string) => `${MAANDEN[Number(dag.slice(5, 7)) - 1] ?? ""} ${dag.slice(0, 4)}`;

function Boekhouding() {
  const [data, setData] = useState<MaandcontroleUitslag | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        setData(await api<MaandcontroleUitslag>("/api/admin/accountant/maandcontrole"));
      } catch (e) {
        setFout(e instanceof Error ? e.message : "De boekhouding kon niet gelezen worden.");
      }
    })();
  }, []);

  if (fout) return <Notice tone="crit" role="alert">{fout}</Notice>;
  if (!data) return <Panel title="Maandcontrole"><p className="text-sm">De boekhouding wordt gelezen…</p></Panel>;

  return (
    <div className="space-y-4">
      {data.administraties.length === 0 ? (
        <Panel title="Maandcontrole">
          <Empty
            title="Nog geen echte administratie"
            body="Zodra de boekhouding een echte administratie voor zekerflex, Inc. heeft, kijkt de accountant hier elke maand wat er niet klopt: kosten zonder bonnetje, bonnetjes die nog niet geboekt zijn, mogelijk dubbele boekingen, btw zonder btw-code, datums in de toekomst, facturen die lang openstaan en uitschieters."
          />
        </Panel>
      ) : (
        data.administraties.map((a) => {
          const problemen = a.bevindingen.filter((b) => b.ernst === "probleem").length;
          return (
            <Panel
              key={a.id}
              title={`Maandcontrole ${a.naam}: ${maandTekst(a.van)}`}
              actions={<Pill tone={problemen ? "crit" : a.bevindingen.length ? "warn" : "ok"}>{a.bevindingen.length === 0 ? "Alles klopt" : `${a.bevindingen.length} ${a.bevindingen.length === 1 ? "punt" : "punten"}`}</Pill>}
            >
              {a.bevindingen.length === 0 ? (
                <p className="text-sm">{a.aantalBoekingen} {a.aantalBoekingen === 1 ? "boeking" : "boekingen"} bekeken; er viel niets op.</p>
              ) : (
                <ul className="space-y-4">
                  {a.bevindingen.map((b) => (
                    <li key={`${b.soort}-${b.boekstukken.join(",")}-${b.titel}`} className="text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={ERNST[b.ernst].tone}>{ERNST[b.ernst].naam}</Pill>
                        <strong>{b.titel}</strong>
                      </div>
                      <p className="mt-1">{b.uitleg}</p>
                      {b.boekstukken.length > 0 && <p className="mt-1 text-xs">Boekstukken: {b.boekstukken.join(", ")}</p>}
                      {b.actie && (
                        <a href={b.actie.href} className="mt-1 inline-block text-xs font-semibold underline">
                          {b.actie.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })
      )}

      <Panel title="Komende termijnen">
        {data.termijnen.length === 0 ? (
          <p className="text-sm">Geen termijnen in de komende maanden.</p>
        ) : (
          <ul className="space-y-3">
            {data.termijnen.map((t) => (
              <li key={t.sleutel} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={t.klaar ? "ok" : t.dagenTot <= 30 ? "warn" : "plan"}>
                    {t.klaar ? "Klaar" : t.dagenTot <= 0 ? "Vandaag" : `Nog ${t.dagenTot} ${t.dagenTot === 1 ? "dag" : "dagen"}`}
                  </Pill>
                  <strong>{t.titel}</strong>
                  <span>uiterlijk {dagTekst(t.dag)}</span>
                </div>
                <p className="mt-1">{t.wat}</p>
                {t.waarschuwing && <p className="mt-1 font-semibold">{t.waarschuwing}</p>}
                <p className="mt-1 text-xs">{t.bevestigDoor}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Jaar vandaag={data.vandaag} />
    </div>
  );
}

const geld = (cents: number, valuta: string) =>
  `${cents < 0 ? "-" : ""}${valuta === "EUR" ? "€" : valuta === "USD" ? "$" : `${valuta} `} ${(Math.abs(cents) / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface JaarData {
  jaar: number;
  administraties: { id: string; naam: string; concept: Jaarconcept; vragen: string[] }[];
}

function Jaar({ vandaag }: { vandaag: string }) {
  const ditJaar = Number(vandaag.slice(0, 4));
  const [jaar, setJaar] = useState(ditJaar);
  const [data, setData] = useState<JaarData | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    void (async () => {
      try {
        setData(await api<JaarData>(`/api/admin/accountant/jaar?jaar=${jaar}`));
        setFout(null);
      } catch (e) {
        setFout(e instanceof Error ? e.message : "De jaarcijfers konden niet gelezen worden.");
      }
    })();
  }, [jaar]);

  return (
    <Panel
      title="Jaarafsluiting (concept) en dossier voor een mens"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="accountant-jaar">Boekjaar</label>
          <select id="accountant-jaar" className="rounded-md border px-2 py-1 text-sm" value={jaar} onChange={(e) => setJaar(Number(e.target.value))}>
            {[ditJaar, ditJaar - 1].map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <a href={`/api/admin/accountant/dossier?jaar=${jaar}`} download className="rounded-md border px-3 py-1 text-sm font-semibold">
            Dossier downloaden
          </a>
        </div>
      }
    >
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {!data && !fout && <p className="text-sm">De jaarcijfers worden gelezen…</p>}
      {data && data.administraties.length === 0 && (
        <Empty
          title="Nog geen jaarcijfers"
          body="Er is nog geen echte administratie. Het dossier kun je toch al downloaden: daarin staan de structuurcheck, de termijnen, de open vragen en de bronnen."
        />
      )}
      {data?.administraties.map((a) => {
        const c = a.concept;
        return (
          <div key={a.id} className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{a.naam}</strong>
              <span>
                {c.van} t/m {c.tot}
              </span>
              <Pill tone={c.balans.sluit ? "ok" : "crit"}>{c.balans.sluit ? "Balans sluit" : `Balans sluit niet (${geld(c.balans.verschilCents, c.valuta)})`}</Pill>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              <li>Opbrengsten: <strong>{geld(c.wv.totaalOpbrengsten, c.valuta)}</strong></li>
              <li>Kosten: <strong>{geld(c.wv.totaalKosten, c.valuta)}</strong></li>
              <li>Resultaat: <strong>{geld(c.wv.resultaat, c.valuta)}</strong></li>
              <li>Bezittingen op {c.tot} (Schedule L total assets): <strong>{geld(c.us.totalAssetsCents, c.valuta)}</strong></li>
            </ul>
            {c.us.omrekenenNodig && <p className="text-xs">De bedragen staan in {c.valuta}. Voor Form 1120 en Delaware rekent de preparer om naar dollars.</p>}
            <div>
              <p className="font-semibold">Open vragen voor de accountant</p>
              <ol className="list-decimal space-y-1 pl-5">
                {a.vragen.map((v) => (
                  <li key={v}>{v}</li>
                ))}
              </ol>
            </div>
          </div>
        );
      })}
      <p className="mt-3 text-xs">
        Concept, geen jaarrekening en geen aangifte. Het dossier bevat de conceptbalans, de winst-en-verliesrekening, de cijfers voor Form 1120 en 5472, de open vragen, de structuurcheck, de termijnen en de bronnen. Een mens controleert, tekent en dient in.
      </p>
    </Panel>
  );
}
