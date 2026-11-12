"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, KpiStrip, Notice, Panel, Pill } from "@/components/admin/kit";
import { boekApi, jsonInit } from "@/lib/boekhouding/scherm-api";
import { BEVESTIG_ECHT_TEKST, bedragTekst, type AdministratieRij, type DeadlineRij, type OverzichtGegevens } from "@/lib/boekhouding/scherm-kern";

const dagenZin = (dagen: number) => (dagen < 0 ? "voorbij" : dagen === 0 ? "vandaag" : dagen === 1 ? "nog 1 dag" : `nog ${dagen} dagen`);

function AdministratieKaart({ a, bezig, onWis }: { a: AdministratieRij; bezig: boolean; onWis: (id: string) => void }) {
  const [zeker, setZeker] = useState(false);
  const test = a.soort === "TEST";
  return (
    <Panel
      title={a.naam}
      actions={<Pill tone={test ? "warn" : "ok"}>{test ? "Test" : "Echt"}</Pill>}
      subtitle={`${a.boekingen} ${a.boekingen === 1 ? "boeking" : "boekingen"} · valuta ${a.valuta}${a.actief ? "" : " · niet actief"}`}
    >
      {test && (
        <div className="mb-3">
          <Notice tone="warn">TESTADMINISTRATIE: hier staat niets echts in. Je kunt hem altijd wissen; een echte administratie nooit.</Notice>
        </div>
      )}
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt style={{ color: "var(--a-mute)" }}>Bonnen om na te kijken</dt>
          <dd className="font-medium">{a.bonnenEvenKijken}</dd>
        </div>
        <div>
          <dt style={{ color: "var(--a-mute)" }}>Klanten moeten nog betalen</dt>
          <dd className="font-medium">
            {bedragTekst(a.openstaandCents, a.valuta)} <span style={{ color: "var(--a-mute)" }}>({a.openstaandPosten} {a.openstaandPosten === 1 ? "factuur" : "facturen"})</span>
          </dd>
        </div>
        <div>
          <dt style={{ color: "var(--a-mute)" }}>Afgesloten maanden</dt>
          <dd className="font-medium">{a.vergrendeldeMaanden.length === 0 ? "nog geen" : a.vergrendeldeMaanden.join(", ")}</dd>
        </div>
      </dl>
      {test && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!zeker ? (
            <button type="button" className="a-btn" disabled={bezig} onClick={() => setZeker(true)}>
              Testgegevens wissen
            </button>
          ) : (
            <>
              <span className="text-sm">Alles in deze testadministratie wordt gewist. Zeker weten?</span>
              <button type="button" className="a-btn a-btn-primary" disabled={bezig} onClick={() => onWis(a.id)}>
                Ja, wissen
              </button>
              <button type="button" className="a-btn a-btn-ghost" disabled={bezig} onClick={() => setZeker(false)}>
                Nee, laat staan
              </button>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function DeadlineKaart({ d }: { d: DeadlineRij }) {
  return (
    <li className="a-panel px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-semibold">{d.titel}</p>
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          {d.datumTekst} · {dagenZin(d.dagenTot)}
        </p>
      </div>
      <p className="mt-1">{d.wat}</p>
      {d.waarschuwing && (
        <div className="mt-2">
          <Notice tone="warn">{d.waarschuwing}</Notice>
        </div>
      )}
      <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
        {d.bevestigDoor}
      </p>
    </li>
  );
}

function NieuweAdministratie({ bezig, onKlaar, onFout }: { bezig: boolean; onKlaar: (melding: string) => Promise<void>; onFout: (tekst: string) => void }) {
  const [testNaam, setTestNaam] = useState("Rooktest");
  const [echtNaam, setEchtNaam] = useState("");
  const [tenant, setTenant] = useState("");
  const [bevestig, setBevestig] = useState("");
  const [bezigLokaal, setBezigLokaal] = useState(false);

  const maak = async (body: Record<string, unknown>, melding: string) => {
    setBezigLokaal(true);
    try {
      await boekApi("/administraties", jsonInit("POST", body));
      await onKlaar(melding);
    } catch (e) {
      onFout(e instanceof Error ? e.message : "Aanmaken mislukt.");
    } finally {
      setBezigLokaal(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Testadministratie aanmaken" subtitle="Om veilig te oefenen. Er staat niets echts in en je kunt hem wissen.">
        <label className="a-label" htmlFor="test-naam">
          Naam van de test
          <input id="test-naam" className="a-input" value={testNaam} maxLength={70} onChange={(e) => setTestNaam(e.target.value)} />
        </label>
        <button
          type="button"
          className="a-btn a-btn-primary mt-3"
          disabled={bezig || bezigLokaal || !testNaam.trim()}
          onClick={() => void maak({ naam: testNaam, soort: "TEST" }, "De testadministratie is aangemaakt.")}
        >
          Testadministratie aanmaken
        </button>
      </Panel>
      <Panel title="Echte administratie aanmaken" subtitle="Dit kan niet meer gewist worden.">
        <p className="mb-3 text-sm">
          De accountant bevestigt eerst de valuta (euro of dollar) en hoe het boekjaar loopt. Maak pas een echte administratie aan als dat is afgesproken.
        </p>
        <div className="space-y-3">
          <label className="a-label" htmlFor="echt-naam">
            Naam van de administratie
            <input id="echt-naam" className="a-input" value={echtNaam} maxLength={80} onChange={(e) => setEchtNaam(e.target.value)} />
          </label>
          <label className="a-label" htmlFor="echt-tenant">
            Klant in het platform (id)
            <input id="echt-tenant" className="a-input" value={tenant} maxLength={64} onChange={(e) => setTenant(e.target.value)} />
            <span className="mt-1 block text-xs font-normal" style={{ color: "var(--a-mute)" }}>
              Het id van de eigen organisatie, te vinden bij Klanten en white-label.
            </span>
          </label>
          <label className="a-label" htmlFor="echt-bevestig">
            Typ {BEVESTIG_ECHT_TEKST} om te bevestigen
            <input id="echt-bevestig" className="a-input" value={bevestig} autoComplete="off" onChange={(e) => setBevestig(e.target.value)} />
          </label>
        </div>
        <button
          type="button"
          className="a-btn a-btn-primary mt-3"
          disabled={bezig || bezigLokaal || !echtNaam.trim() || !tenant.trim() || bevestig !== BEVESTIG_ECHT_TEKST}
          onClick={() => void maak({ naam: echtNaam, soort: "ECHT", platformTenantId: tenant, bevestig }, "De echte administratie is aangemaakt.")}
        >
          Echte administratie aanmaken
        </button>
      </Panel>
    </div>
  );
}

export function OverzichtTab() {
  const [data, setData] = useState<OverzichtGegevens | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    try {
      setData(await boekApi<OverzichtGegevens>("/overzicht"));
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  const wis = async (id: string) => {
    setBezig(true);
    try {
      await boekApi("/wis-test", jsonInit("POST", { administratieId: id }));
      setMelding("De testgegevens zijn gewist.");
      setFout(null);
      await laad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Wissen mislukt.");
    } finally {
      setBezig(false);
    }
  };

  const administraties = data?.administraties ?? [];
  const euro = administraties.filter((a) => a.valuta === "EUR");
  const boekingen = administraties.reduce((som, a) => som + a.boekingen, 0);
  const nakijken = administraties.reduce((som, a) => som + a.bonnenEvenKijken, 0);
  const openstaand = euro.reduce((som, a) => som + a.openstaandCents, 0);

  return (
    <div className="space-y-5">
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {melding && <Notice tone="ok">{melding}</Notice>}
      <KpiStrip
        items={[
          { label: "Boekingen", value: data ? String(boekingen) : "…", tone: "neutral" },
          { label: "Bonnen om na te kijken", value: data ? String(nakijken) : "…", tone: nakijken > 0 ? "warn" : "ok" },
          { label: "Klanten moeten nog betalen", value: data ? bedragTekst(openstaand) : "…", hint: "alleen administraties in euro", tone: "money" },
        ]}
      />
      <section aria-label="Administraties" className="space-y-4">
        {data && administraties.length === 0 && (
          <Panel title="Administraties">
            <Empty title="Er is nog geen administratie" body="Maak hieronder eerst een testadministratie aan om te oefenen." />
          </Panel>
        )}
        {administraties.map((a) => (
          <AdministratieKaart key={a.id} a={a} bezig={bezig} onWis={(id) => void wis(id)} />
        ))}
      </section>
      <NieuweAdministratie
        bezig={bezig}
        onFout={setFout}
        onKlaar={async (tekst) => {
          setMelding(tekst);
          setFout(null);
          await laad();
        }}
      />
      <Panel title="Wat je nog moet doen" subtitle="Vaste data voor aangiftes. Een accountant bevestigt elke datum.">
        {data && data.deadlines.length === 0 ? (
          <Empty title="Niets in de komende maanden" />
        ) : (
          <ul className="space-y-3">{(data?.deadlines ?? []).map((d) => <DeadlineKaart key={d.sleutel} d={d} />)}</ul>
        )}
      </Panel>
    </div>
  );
}
