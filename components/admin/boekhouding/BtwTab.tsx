"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Notice, Panel, Pill } from "@/components/admin/kit";
import { rubriekenMetHeleEuros, type BtwConceptRij } from "@/lib/boekhouding/btw/labels";
import { ERNST_TEKST, ERNST_TONE, jaarKeuzes, standaardKwartaal } from "@/lib/boekhouding/btw/scherm-kern";
import { API_BOEKHOUDING, boekApi, jsonInit } from "@/lib/boekhouding/scherm-api";
import { bedragTekst, dagTekst } from "@/lib/boekhouding/scherm-kern";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

interface AdminKeuze {
  id: string;
  naam: string;
  soort: "ECHT" | "TEST";
}

interface ConceptAntwoord {
  laatste: BtwConceptRij | null;
  versies: number;
  deadline: string | null;
}

const veldTekst = (n: number | null): string => (n === null ? "" : n.toLocaleString("nl-NL"));

export function BtwTab() {
  const [administraties, setAdministraties] = useState<AdminKeuze[]>([]);
  const [adminId, setAdminId] = useState("");
  const [start] = useState(() => standaardKwartaal(new Date()));
  const [jaren] = useState(() => jaarKeuzes(new Date()));
  const [jaar, setJaar] = useState(start.jaar);
  const [kwartaal, setKwartaal] = useState(start.kwartaal);
  const [data, setData] = useState<ConceptAntwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [reden, setReden] = useState("");
  const [dag, setDag] = useState("");
  const [referentie, setReferentie] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const a = await boekApi<{ administraties: AdminKeuze[] }>("/administraties");
        setAdministraties(a.administraties);
        setAdminId((huidig) => huidig || (a.administraties[0]?.id ?? ""));
      } catch (e) {
        setFout(e instanceof Error ? e.message : "Laden mislukt.");
      }
    })();
  }, []);

  const laad = useCallback(async () => {
    if (!adminId) return;
    try {
      const q = new URLSearchParams({ administratieId: adminId, jaar: String(jaar), kwartaal: String(kwartaal) });
      setData(await boekApi<ConceptAntwoord>(`/btw?${q.toString()}`));
      setFout(null);
    } catch (e) {
      setData(null);
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, [adminId, jaar, kwartaal]);
  useEffect(() => {
    setMelding(null);
    setReden("");
    void laad();
  }, [laad]);

  // De teruggegeven serverversie vervangt het concept in beeld.
  const neemOver = (concept: BtwConceptRij, tekst: string) => {
    setData((d) => ({ laatste: concept, versies: Math.max(d?.versies ?? 0, concept.versie), deadline: d?.deadline ?? concept.deadline }));
    setMelding(tekst);
    setFout(null);
  };

  const maakConcept = async () => {
    setBezig(true);
    try {
      const r = await boekApi<{ concept: BtwConceptRij }>("/btw", jsonInit("POST", { administratieId: adminId, jaar, kwartaal }));
      neemOver(r.concept, `Het concept (versie ${r.concept.versie}) is gemaakt. Er is niets verstuurd.`);
      setReden("");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Het concept maken is mislukt.");
    } finally {
      setBezig(false);
    }
  };

  const zetKlaar = async (id: string, overschrijfReden: string | null) => {
    setBezig(true);
    try {
      const r = await boekApi<{ concept: BtwConceptRij }>(`/btw/${encodeURIComponent(id)}`, jsonInit("PATCH", { actie: "klaar", ...(overschrijfReden ? { overschrijfReden } : {}) }));
      neemOver(r.concept, "Het concept staat klaar. ZekerFlex dient niets in: dat doe jij of je accountant, zie hieronder.");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  };

  const markeerIngediend = async (id: string) => {
    setBezig(true);
    try {
      const r = await boekApi<{ concept: BtwConceptRij }>(`/btw/${encodeURIComponent(id)}`, jsonInit("PATCH", { actie: "ingediend", ingediendOp: dag, referentie }));
      neemOver(r.concept, "Genoteerd: de aangifte is door jou ingediend.");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  };

  const c = data?.laatste ?? null;
  const saldoEuros = c ? (rubriekenMetHeleEuros(c.inhoud.rubrieken).find((r) => r.rubriek === "5c")?.btwHeleEuros ?? Math.trunc(c.saldoCents / 100)) : 0;
  const blokkades = c ? c.inhoud.meldingen.filter((m) => m.ernst === "blokkeert").length : 0;
  const gekozen = administraties.find((a) => a.id === adminId);

  return (
    <div className="space-y-5">
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {melding && <Notice tone="ok">{melding}</Notice>}

      <Panel title="Btw-aangifte per kwartaal" subtitle="Een concept uit de boekhouding. ZekerFlex dient nooit zelf in en stuurt niets naar de Belastingdienst.">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="a-label" htmlFor="btw-admin">
            Administratie
            <select id="btw-admin" className="a-input" value={adminId} onChange={(e) => setAdminId(e.target.value)}>
              {administraties.length === 0 && <option value="">Nog geen administratie</option>}
              {administraties.map((a) => (
                <option key={a.id} value={a.id}>{a.soort === "TEST" ? `${a.naam} (test)` : a.naam}</option>
              ))}
            </select>
          </label>
          <label className="a-label" htmlFor="btw-jaar">
            Jaar
            <select id="btw-jaar" className="a-input" value={jaar} onChange={(e) => setJaar(Number(e.target.value))}>
              {jaren.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </label>
          <label className="a-label" htmlFor="btw-kwartaal">
            Kwartaal
            <select id="btw-kwartaal" className="a-input" value={kwartaal} onChange={(e) => setKwartaal(Number(e.target.value))}>
              {[1, 2, 3, 4].map((k) => (
                <option key={k} value={k}>Kwartaal {k}</option>
              ))}
            </select>
          </label>
        </div>
        {gekozen?.soort === "TEST" && (
          <div className="mt-3">
            <Notice tone="warn">Dit is een testadministratie: niets hier is echt.</Notice>
          </div>
        )}
        <p className="mt-3 text-sm">
          {data?.deadline ? (
            <>Dit kwartaal inleveren vóór <strong>{dagTekst(data.deadline)}</strong> (laat de datum door een accountant bevestigen).</>
          ) : (
            "De uiterste inleverdatum van dit kwartaal is niet te bepalen; vraag het een accountant."
          )}
        </p>
        <button type="button" className="a-btn a-btn-primary mt-3" disabled={bezig || !adminId} onClick={() => void maakConcept()}>
          {bezig ? "Bezig…" : c ? "Nieuw concept maken" : "Concept maken"}
        </button>
        {c && (
          <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
            Een nieuw concept vervangt het huidige (versie {c.versie}) zolang dat nog niet is ingediend. Oude versies blijven bewaard.
          </p>
        )}
      </Panel>

      {data !== null && c === null && (
        <Panel title="Nog geen concept">
          <Empty title="Voor dit kwartaal is nog niets berekend" body="Kies Concept maken om de rubrieken uit de boekingen te laten uitrekenen." />
        </Panel>
      )}

      {c && (
        <>
          <Panel
            title={`Concept ${c.jaar} kwartaal ${c.kwartaal} (versie ${c.versie})`}
            subtitle={`Berekend op ${dagTekst(amsterdamDayKey(c.berekendOp))}. De bedragen komen uit de boekingen van ${dagTekst(c.inhoud.van)} t/m ${dagTekst(c.inhoud.tot)}.`}
            actions={<Pill tone={c.status === "INGEDIEND" ? "ok" : c.status === "GOEDGEKEURD" ? "plan" : "warn"}>{c.statusTekst}</Pill>}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[0.8125rem]">
                <caption className="sr-only">Rubrieken van de btw-aangifte</caption>
                <thead>
                  <tr style={{ color: "var(--a-mute)" }}>
                    <th scope="col" className="py-2 pr-3">Rubriek</th>
                    <th scope="col" className="py-2 pr-3 text-right">Omzet (hele euro&apos;s)</th>
                    <th scope="col" className="py-2 text-right">Btw (hele euro&apos;s)</th>
                  </tr>
                </thead>
                <tbody>
                  {rubriekenMetHeleEuros(c.inhoud.rubrieken).map((r) => (
                    <tr key={r.rubriek} className="border-t align-top" style={{ borderColor: "var(--a-border)" }}>
                      <th scope="row" className="py-2 pr-3 font-normal">
                        <span className="font-semibold">{r.rubriek}</span> {r.label}
                        <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{r.uitleg}</span>
                        {r.doorAccountantTeBevestigen && r.reden && (
                          <span className="block text-xs" style={{ color: "var(--a-mute)" }}>Door een accountant te bevestigen: {r.reden}</span>
                        )}
                      </th>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{r.grondslagEuro === null ? "" : veldTekst(r.grondslagEuro)}</td>
                      <td className="whitespace-nowrap py-2 text-right tabular-nums">
                        {bedragTekst(r.btwHeleEuros * 100)}
                        {r.btwCents !== r.btwHeleEuros * 100 && (
                          <span className="block text-xs" style={{ color: "var(--a-mute)" }}>exact: {bedragTekst(r.btwCents)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm">
              {c.saldoCents >= 0 ? (
                <>Volgens dit concept moet je <strong>{bedragTekst(saldoEuros * 100)}</strong> betalen (exact: {bedragTekst(c.saldoCents)}).</>
              ) : (
                <>Volgens dit concept krijg je <strong>{bedragTekst(Math.abs(saldoEuros) * 100)}</strong> terug (exact: {bedragTekst(Math.abs(c.saldoCents))}).</>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="a-btn" href={`${API_BOEKHOUDING}/btw/${encodeURIComponent(c.id)}/csv`}>
                Download als CSV
              </a>
            </div>
          </Panel>

          <Panel title="Wat je nog moet doen" subtitle="De controle van dit concept.">
            {c.inhoud.meldingen.length === 0 ? (
              <Empty title="Niets te doen" body="De controle vond geen afwijkingen." />
            ) : (
              <ul className="space-y-3">
                {c.inhoud.meldingen.map((m) => (
                  <li key={m.code} className="text-sm">
                    <Pill tone={ERNST_TONE[m.ernst]}>{ERNST_TEKST[m.ernst]}</Pill> <span>{m.tekst}</span>
                    {(m.verwijzing.boekingen.length > 0 || m.verwijzing.bonnen.length > 0) && (
                      <details className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
                        <summary className="cursor-pointer">Welke ({m.verwijzing.aantal})</summary>
                        {m.verwijzing.boekingen.length > 0 && <p className="break-words">Boekingen: {m.verwijzing.boekingen.join(", ")}</p>}
                        {m.verwijzing.bonnen.length > 0 && <p className="break-words">Bonnen: {m.verwijzing.bonnen.join(", ")}</p>}
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Dit is nog niet zeker" subtitle="Dit laat je door een accountant bevestigen voordat je indient.">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {c.inhoud.voorbehouden.map((v) => (
                <li key={v.onderwerp}>
                  <strong>{v.onderwerp}:</strong> {v.reden}
                </li>
              ))}
            </ul>
          </Panel>

          {c.status === "BEREKEND" && (
            <Panel title="Klaar om in te dienen?" subtitle="Hiermee noteer je alleen dat jij het concept hebt nagekeken. Er wordt niets verstuurd.">
              {blokkades > 0 ? (
                <div className="space-y-3">
                  <Notice tone="warn">Er {blokkades === 1 ? "staat nog 1 punt" : `staan nog ${blokkades} punten`} bij &quot;Wat je nog moet doen&quot; die eerst opgelost moeten worden. Beter: los ze op en maak een nieuw concept.</Notice>
                  <label className="a-label" htmlFor="btw-reden">
                    Toch doorgaan? Waarom (minstens 10 tekens, schrijf geen namen of persoonsgegevens)
                    <input id="btw-reden" className="a-input" value={reden} maxLength={500} onChange={(e) => setReden(e.target.value)} />
                  </label>
                  <button type="button" className="a-btn a-btn-primary" disabled={bezig || reden.trim().length < 10} onClick={() => void zetKlaar(c.id, reden.trim())}>
                    {bezig ? "Bezig…" : "Toch klaar zetten"}
                  </button>
                </div>
              ) : (
                <button type="button" className="a-btn a-btn-primary" disabled={bezig} onClick={() => void zetKlaar(c.id, null)}>
                  {bezig ? "Bezig…" : "Klaar om in te dienen"}
                </button>
              )}
            </Panel>
          )}

          {(c.status === "GOEDGEKEURD" || c.status === "INGEDIEND") && (
            <Panel title="Zo dien je het in">
              <div className="space-y-2 text-sm">
                <p>
                  <strong>ZekerFlex dient nooit zelf in.</strong> Er is geen koppeling met de Belastingdienst en er wordt niets voor je verstuurd.
                </p>
                <p>
                  Je dient de aangifte in via Mijn Belastingdienst Zakelijk (inloggen met eHerkenning of DigiD met een machtiging voor dit bedrijf), of je geeft het concept (de CSV hierboven) aan een accountant die het voor je indient. Neem de bedragen over uit de tabel hierboven.
                </p>
                <p>Betaal het bedrag zelf aan de Belastingdienst, vóór de uiterste datum. De bestuurder blijft verantwoordelijk voor de aangifte, ook als een accountant het indient.</p>
                <p>Heb je ook verkopen in rubriek 3b, dan hoort daar de opgaaf ICP bij. Die maakt dit concept niet.</p>
              </div>
            </Panel>
          )}

          {c.status === "GOEDGEKEURD" && (
            <Panel title="Heb je het ingediend?" subtitle="Noteer hier dat het gedaan is, met het ontvangstnummer van de Belastingdienst.">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="a-label" htmlFor="btw-dag">
                  Datum van indienen
                  <input id="btw-dag" type="date" className="a-input" value={dag} onChange={(e) => setDag(e.target.value)} />
                </label>
                <label className="a-label" htmlFor="btw-ref">
                  Referentie of ontvangstnummer
                  <input id="btw-ref" className="a-input" value={referentie} maxLength={100} onChange={(e) => setReferentie(e.target.value)} />
                </label>
              </div>
              <button type="button" className="a-btn a-btn-primary mt-3" disabled={bezig || !dag || referentie.trim().length < 3} onClick={() => void markeerIngediend(c.id)}>
                {bezig ? "Bezig…" : "Ik heb het ingediend"}
              </button>
            </Panel>
          )}

          {c.status === "INGEDIEND" && (
            <Notice tone="ok">
              Ingediend op {dagTekst(c.ingediendOp)} met referentie {c.indieningReferentie ?? "onbekend"}.
            </Notice>
          )}
        </>
      )}
    </div>
  );
}
