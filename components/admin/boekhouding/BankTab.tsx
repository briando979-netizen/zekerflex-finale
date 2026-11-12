"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Empty, Notice, Panel, Pill } from "@/components/admin/kit";
import type { BankOverzicht, KandidaatRij, TransactieRij } from "@/lib/boekhouding/bank/scherm-kern";
import { STATUS_TEKST, voorstelZekerheidTekst } from "@/lib/boekhouding/bank/scherm-kern";
import type { ImportUitkomst } from "@/lib/boekhouding/bank/types";
import { API_BOEKHOUDING, boekApi, jsonInit } from "@/lib/boekhouding/scherm-api";
import { bedragTekst, dagTekst } from "@/lib/boekhouding/scherm-kern";

// ---------------------------------------------------------------------------
// Beheer → Boekhouding → Bank: bankrekening toevoegen, een afschrift inlezen (CAMT.053 of csv), de lijst "even kijken"
// en wat je nog moet doen. Het eigen IBAN en dat van tegenpartijen staan hier gemaskeerd (laatste vier tekens).
// Geen open banking: je leest zelf een afschrift in. Alleen types uit puur-bestanden worden geïmporteerd (import type).
// ---------------------------------------------------------------------------

interface AdminKeuze {
  id: string;
  naam: string;
  soort: "ECHT" | "TEST";
}

interface UploadAntwoord {
  uitkomst: ImportUitkomst;
  overzicht: BankOverzicht | null;
}

const TODO_TONE = { blokkeert: "crit", "let-op": "warn", info: "neutral" } as const;

function TransactieKaart({
  t,
  categorieen,
  onKlaar,
}: {
  t: TransactieRij;
  categorieen: BankOverzicht["categorieen"];
  onKlaar: (rij: TransactieRij, melding: string) => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [categorie, setCategorie] = useState(categorieen.find((c) => c.nummer === "4900")?.nummer ?? categorieen[0]?.nummer ?? "");
  const [reden, setReden] = useState("");
  const [negeren, setNegeren] = useState(false);
  const afschrijving = t.bedragCents < 0;

  const stuur = async (body: unknown, melding: string) => {
    setBezig(true);
    try {
      const r = await boekApi<{ transactie: TransactieRij }>(`/bank/transacties/${encodeURIComponent(t.id)}`, jsonInit("PATCH", body));
      setFout(null);
      onKlaar(r.transactie, melding);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  };

  const koppel = (k: KandidaatRij) => stuur(k.soort === "factuur" ? { actie: "koppel", factuurId: k.id } : { actie: "koppel", bonId: k.id }, "De transactie is gekoppeld.");

  return (
    <li>
      <Panel
        title={`${t.tegenNaam ?? "Tegenpartij onbekend"} · ${bedragTekst(t.bedragCents, t.valuta)}`}
        subtitle={`${dagTekst(t.boekdag)}${t.tegenIbanGemaskeerd ? ` · ${t.tegenIbanGemaskeerd}` : ""}`}
        actions={<Pill tone={t.status === "TWIJFEL" ? "warn" : "neutral"}>{STATUS_TEKST[t.status]}</Pill>}
      >
        {t.omschrijving && <p className="break-words text-sm">{t.omschrijving}</p>}
        {t.reden && (
          <div className="mt-3">
            <Notice tone="warn">Waarom jij moet kijken: {t.reden}</Notice>
          </div>
        )}
        {t.kandidaten.length > 0 && (
          <ul className="mt-3 space-y-2">
            {t.kandidaten.map((k) => (
              <li key={`${k.soort}-${k.id ?? "stripe"}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{k.titel}</span>
                  <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                    {voorstelZekerheidTekst(k.zekerheid)}: {k.reden}
                  </span>
                </span>
                {k.id !== null && (
                  <button type="button" className="a-btn a-btn-primary" disabled={bezig} onClick={() => void koppel(k)}>
                    Koppelen
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {fout && (
          <div className="mt-3">
            <Notice tone="crit" role="alert">{fout}</Notice>
          </div>
        )}
        <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "var(--a-border)" }}>
          {afschrijving && categorieen.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="a-label" htmlFor={`cat-${t.id}`}>
                Boeken als kosten op
                <select id={`cat-${t.id}`} className="a-input" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                  {categorieen.map((c) => (
                    <option key={c.nummer} value={c.nummer}>{c.nummer} {c.naam}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="a-btn" disabled={bezig || !categorie} onClick={() => void stuur({ actie: "koppel", rekeningNummer: categorie }, "De transactie is als kosten geboekt (zonder btw).")}>
                Boeken als kosten
              </button>
            </div>
          )}
          {!negeren ? (
            <button type="button" className="a-btn" disabled={bezig} onClick={() => setNegeren(true)}>
              Negeren
            </button>
          ) : (
            <div className="space-y-2">
              <label className="a-label" htmlFor={`neg-${t.id}`}>
                Waarom negeer je deze transactie? (minstens 3 tekens, schrijf geen IBAN of e-mailadres)
                <input id={`neg-${t.id}`} className="a-input" value={reden} maxLength={500} onChange={(e) => setReden(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="a-btn a-btn-primary" disabled={bezig || reden.trim().length < 3} onClick={() => void stuur({ actie: "negeer", reden: reden.trim() }, "De transactie is genegeerd.")}>
                  Negeren bevestigen
                </button>
                <button type="button" className="a-btn" disabled={bezig} onClick={() => setNegeren(false)}>
                  Annuleren
                </button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </li>
  );
}

export function BankTab() {
  const [administraties, setAdministraties] = useState<AdminKeuze[]>([]);
  const [adminId, setAdminId] = useState("");
  const [data, setData] = useState<BankOverzicht | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [uitkomst, setUitkomst] = useState<ImportUitkomst | null>(null);

  const [naam, setNaam] = useState("");
  const [iban, setIban] = useState("");
  const [rekeningId, setRekeningId] = useState("");
  const bestandRef = useRef<HTMLInputElement>(null);

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
      const o = await boekApi<BankOverzicht>(`/bank?administratieId=${encodeURIComponent(adminId)}`);
      setData(o);
      setRekeningId((huidig) => (o.rekeningen.some((r) => r.id === huidig) ? huidig : (o.rekeningen.find((r) => r.actief)?.id ?? "")));
      setFout(null);
    } catch (e) {
      setData(null);
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, [adminId]);
  useEffect(() => {
    setMelding(null);
    setUitkomst(null);
    void laad();
  }, [laad]);

  const voegToe = async () => {
    setBezig(true);
    try {
      await boekApi("/bank/rekeningen", jsonInit("POST", { administratieId: adminId, naam, iban }));
      setNaam("");
      setIban("");
      setMelding("De bankrekening is toegevoegd.");
      setFout(null);
      await laad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Toevoegen mislukt.");
    } finally {
      setBezig(false);
    }
  };

  const leesIn = async () => {
    const bestand = bestandRef.current?.files?.[0];
    if (!bestand) {
      setFout("Kies eerst een bestand om in te lezen.");
      return;
    }
    setBezig(true);
    setUitkomst(null);
    try {
      const form = new FormData();
      form.set("bankRekeningId", rekeningId);
      form.set("bestand", bestand);
      const res = await fetch(`${API_BOEKHOUDING}/bank/upload`, { method: "POST", body: form, cache: "no-store" });
      const antwoord = (await res.json().catch(() => ({}))) as Partial<UploadAntwoord> & { error?: { message?: string }; message?: string };
      if (!res.ok || !antwoord.uitkomst) throw new Error(antwoord.error?.message ?? antwoord.message ?? "Inlezen mislukt. Probeer het opnieuw.");
      setUitkomst(antwoord.uitkomst);
      if (antwoord.overzicht) setData(antwoord.overzicht);
      setFout(null);
      if (bestandRef.current) bestandRef.current.value = "";
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Inlezen mislukt.");
    } finally {
      setBezig(false);
    }
  };

  const zoekOpnieuw = async () => {
    setBezig(true);
    try {
      const r = await boekApi<{ verwerkt: { geboekt: number; gekoppeld: number; evenKijken: number }; overzicht: BankOverzicht }>("/bank", jsonInit("POST", { administratieId: adminId }));
      setData(r.overzicht);
      setMelding(`Opnieuw gezocht: ${r.verwerkt.geboekt} vanzelf geboekt, ${r.verwerkt.gekoppeld} gekoppeld, ${r.verwerkt.evenKijken} blijven even kijken.`);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opnieuw zoeken mislukt.");
    } finally {
      setBezig(false);
    }
  };

  // De teruggegeven serverversie vervangt de rij; is de transactie klaar, dan verdwijnt hij uit de lijst en worden de tellingen opnieuw geladen.
  const neemOver = (rij: TransactieRij, tekst: string) => {
    setData((d) => (d ? { ...d, transacties: d.transacties.flatMap((x) => (x.id !== rij.id ? [x] : rij.status === "TWIJFEL" || rij.status === "NIEUW" ? [rij] : [])) } : d));
    setMelding(tekst);
    setFout(null);
    void laad();
  };

  const gekozen = administraties.find((a) => a.id === adminId);
  const actieveRekeningen = data?.rekeningen.filter((r) => r.actief) ?? [];

  return (
    <div className="space-y-5">
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {melding && <Notice tone="ok">{melding}</Notice>}

      <Panel title="Bank" subtitle="Lees een bankafschrift in en koppel de transacties aan facturen en bonnen. Er is geen koppeling met de bank: jij haalt het afschrift zelf op en leest het hier in.">
        <label className="a-label" htmlFor="bank-admin">
          Administratie
          <select id="bank-admin" className="a-input" value={adminId} onChange={(e) => setAdminId(e.target.value)}>
            {administraties.length === 0 && <option value="">Nog geen administratie</option>}
            {administraties.map((a) => (
              <option key={a.id} value={a.id}>{a.soort === "TEST" ? `${a.naam} (test)` : a.naam}</option>
            ))}
          </select>
        </label>
        {gekozen?.soort === "TEST" && (
          <div className="mt-3">
            <Notice tone="warn">Dit is een testadministratie: niets hier is echt.</Notice>
          </div>
        )}
      </Panel>

      {data && (
        <Panel title="Wat je nog moet doen">
          {data.todo.length === 0 ? (
            <Empty title="Niets te doen" body="Er zijn nog geen banktransacties ingelezen." />
          ) : (
            <ul className="space-y-2">
              {data.todo.map((x) => (
                <li key={x.tekst} className="text-sm">
                  <Pill tone={TODO_TONE[x.ernst]}>{x.ernst === "blokkeert" ? "Eerst dit" : x.ernst === "let-op" ? "Let op" : "Weten"}</Pill> <span>{x.tekst}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Panel title="Bankrekeningen" subtitle="Het IBAN staat hier gemaskeerd: alleen de laatste vier tekens zijn te zien.">
        {data && data.rekeningen.length > 0 && (
          <ul className="mb-4 space-y-2 text-sm">
            {data.rekeningen.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.naam}</span> · {r.ibanGemaskeerd} · rekening {r.grootboekNummer} · {r.aantalAfschriften} {r.aantalAfschriften === 1 ? "afschrift" : "afschriften"}
                {r.laatsteBoekdag ? ` · laatste transactie ${dagTekst(r.laatsteBoekdag)}` : ""}
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="a-label" htmlFor="bank-naam">
            Naam van de rekening
            <input id="bank-naam" className="a-input" value={naam} maxLength={80} onChange={(e) => setNaam(e.target.value)} placeholder="Zakelijke rekening" />
          </label>
          <label className="a-label" htmlFor="bank-iban">
            IBAN
            <input id="bank-iban" className="a-input" value={iban} maxLength={42} autoComplete="off" onChange={(e) => setIban(e.target.value)} />
          </label>
        </div>
        <button type="button" className="a-btn a-btn-primary mt-3" disabled={bezig || !adminId || !naam.trim() || iban.trim().length < 10} onClick={() => void voegToe()}>
          {bezig ? "Bezig…" : "Bankrekening toevoegen"}
        </button>
      </Panel>

      <Panel title="Afschrift inlezen" subtitle="CAMT.053 (xml) of een csv van ING, Rabobank of ABN AMRO (of een csv met minstens de kolommen Datum en Bedrag). Hooguit 5 MB.">
        {actieveRekeningen.length === 0 ? (
          <Empty title="Voeg eerst een bankrekening toe" body="Daarna kun je hier een afschrift inlezen." />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="a-label" htmlFor="bank-rekening">
                Bankrekening
                <select id="bank-rekening" className="a-input" value={rekeningId} onChange={(e) => setRekeningId(e.target.value)}>
                  {actieveRekeningen.map((r) => (
                    <option key={r.id} value={r.id}>{r.naam} ({r.ibanGemaskeerd})</option>
                  ))}
                </select>
              </label>
              <label className="a-label" htmlFor="bank-bestand">
                Bestand
                <input id="bank-bestand" ref={bestandRef} type="file" accept=".xml,.csv,.txt,.tab,text/csv,text/xml,application/xml,text/plain" className="a-input" />
              </label>
            </div>
            <button type="button" className="a-btn a-btn-primary" disabled={bezig || !rekeningId} onClick={() => void leesIn()}>
              {bezig ? "Bezig…" : "Afschrift inlezen"}
            </button>
            <Notice tone="neutral">
              Let op: de csv-formaten van de banken zijn gelezen naar de gangbare exportindeling, maar nog niet met een echt bestand van jouw bank bevestigd. Herkent het scherm een bestand niet, dan zegt het dat eerlijk; exporteer dan CAMT.053 (xml), dat is het meest betrouwbaar.
            </Notice>
          </div>
        )}
        {uitkomst && (
          <div className="mt-4 space-y-2 text-sm" aria-live="polite">
            <Notice tone={uitkomst.alIngelezen ? "warn" : "ok"}>
              {uitkomst.alIngelezen
                ? `Dit bestand was al ingelezen (${uitkomst.herkend}). Er is niets dubbel gemaakt.`
                : `Ingelezen als ${uitkomst.herkend}: ${uitkomst.totaal} transacties, waarvan ${uitkomst.nieuw} nieuw en ${uitkomst.alBekend} al bekend.`}
            </Notice>
            {uitkomst.verwerkt && (
              <p>
                Koppelen: {uitkomst.verwerkt.geboekt} vanzelf geboekt, {uitkomst.verwerkt.gekoppeld} gekoppeld, {uitkomst.verwerkt.evenKijken} wachten op jou.
              </p>
            )}
            {uitkomst.waarschuwingen.map((w) => (
              <Notice key={w} tone="warn" role="alert">{w}</Notice>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Even kijken"
        subtitle="Transacties waar het systeem niet zeker van is. Er wordt alleen vanzelf geboekt bij een exact factuurnummer, een exact bedrag en precies één kandidaat."
        actions={
          <button type="button" className="a-btn" disabled={bezig || !adminId} onClick={() => void zoekOpnieuw()}>
            Opnieuw zoeken
          </button>
        }
      >
        {data && data.transacties.length === 0 && <Empty title="Niets om na te kijken" body="Alle ingelezen transacties zijn verwerkt, of er is nog geen afschrift ingelezen." />}
        {data && data.transacties.length > 0 && (
          <>
            {data.afgekapt && <Notice tone="warn">Je ziet de nieuwste {data.transacties.length} transacties; verwerk er een paar en de rest verschijnt.</Notice>}
            <ul className="mt-3 space-y-4">
              {data.transacties.map((t) => (
                <TransactieKaart key={t.id} t={t} categorieen={data.categorieen} onKlaar={neemOver} />
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
