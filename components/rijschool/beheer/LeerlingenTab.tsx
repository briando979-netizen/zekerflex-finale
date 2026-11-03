"use client";

import { useMemo, useState } from "react";
import type { BeheerWeergave, LeerlingRij } from "@/lib/rijschool/weergave";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import { LesFormulier, nieuwConcept } from "@/components/rijschool/beheer/AgendaTab";
import { bedragVeld, centVan, foutVan } from "@/components/rijschool/api";
import { Melding, Schakelaar, Veld, Voortgangsbalk } from "@/components/rijschool/ui";
import { LEERLING_STATUS_LABEL } from "@/lib/rijschool/format";
import { tegoedTekst } from "@/lib/rijschool/tegoed";
import { amsterdamDayKey } from "@/lib/time/amsterdam";

// Leerlingen van de rijschool: zoeken, toevoegen en bewerken, een account
// klaarzetten (uitnodiging per mail), betalingen en tegoed, en meteen een les
// inplannen.

type Status = "AANMELDING" | "ACTIEF" | "GESLAAGD" | "GESTOPT";

const LEEG: Omit<LeerlingRij, "id" | "saldoMin" | "procent" | "heeftWachtwoord" | "uitnodigingOpen" | "laatstIngelogd" | "aangemaakt"> = {
  naam: "",
  email: "",
  telefoon: "",
  adres: "",
  geboortedatum: "",
  automaat: false,
  status: "ACTIEF",
  instructeurId: null,
  theorieGehaald: false,
  examenDatum: "",
  notitie: "",
};

export function LeerlingenTab({ data, doe, focus, onFocus }: { data: BeheerWeergave; doe: Doe; focus: string | null; onFocus: (id: string | null) => void }) {
  const [zoek, setZoek] = useState("");
  const [filter, setFilter] = useState<Status | "ALLE">("ALLE");
  const [nieuw, setNieuw] = useState(false);

  const lijst = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return data.leerlingen.filter((l) => (filter === "ALLE" ? l.status !== "GESTOPT" : l.status === filter) && (!z || `${l.naam} ${l.email} ${l.telefoon}`.toLowerCase().includes(z)));
  }, [data.leerlingen, zoek, filter]);

  const gekozen = focus ? data.leerlingen.find((l) => l.id === focus) : undefined;
  const lesMin = data.rijschool.lesMinuten;

  if (nieuw || gekozen) {
    return (
      <LeerlingDetail
        key={gekozen?.id ?? "nieuw"}
        data={data}
        doe={doe}
        leerling={gekozen ?? null}
        onTerug={() => {
          setNieuw(false);
          onFocus(null);
        }}
        onAangemaakt={(id) => {
          setNieuw(false);
          onFocus(id);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Veld label="Zoeken">
          <input className="field-input sm:w-72" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Naam, e-mail of telefoon" />
        </Veld>
        <Veld label="Status">
          <select className="field-input" value={filter} onChange={(e) => setFilter(e.target.value as Status | "ALLE")}>
            <option value="ALLE">Alle lopende</option>
            {(Object.keys(LEERLING_STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {LEERLING_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Veld>
        <button type="button" className="btn-primary ml-auto" onClick={() => setNieuw(true)}>
          Nieuwe leerling
        </button>
      </div>

      {lijst.length === 0 ? (
        <p className="card p-5 text-sm text-neutralx-600">Geen leerlingen gevonden.</p>
      ) : (
        <ul className="card divide-y divide-hair">
          {lijst.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => onFocus(l.id)} className="grid w-full gap-2 p-4 text-left hover:bg-paper-soft sm:grid-cols-[1fr_10rem_10rem] sm:items-center">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{l.naam}</span>
                  <span className="block truncate text-xs text-neutralx-500">
                    {LEERLING_STATUS_LABEL[l.status]} · {l.heeftWachtwoord ? "app in gebruik" : l.uitnodigingOpen ? "uitgenodigd" : "nog geen account"}
                  </span>
                </span>
                <span className="text-sm">
                  <span className="block text-xs text-neutralx-500">Voortgang</span>
                  <Voortgangsbalk procent={l.procent} kleur={data.rijschool.kleur} label={`Voortgang ${l.naam}`} />
                </span>
                <span className={`text-sm font-medium ${l.saldoMin < 0 ? "text-crit" : "text-ink"}`}>{tegoedTekst(l.saldoMin, lesMin)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LeerlingDetail({
  data,
  doe,
  leerling,
  onTerug,
  onAangemaakt,
}: {
  data: BeheerWeergave;
  doe: Doe;
  leerling: LeerlingRij | null;
  onTerug: () => void;
  onAangemaakt: (id: string) => void;
}) {
  const [v, setV] = useState(leerling ? { ...LEEG, ...leerling } : LEEG);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [plannen, setPlannen] = useState(false);

  const zet = <K extends keyof typeof v>(k: K, w: (typeof v)[K]) => setV({ ...v, [k]: w });

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    setOk(null);
    try {
      const r = await doe({
        actie: "leerling",
        id: leerling?.id ?? null,
        data: {
          naam: v.naam,
          email: v.email,
          telefoon: v.telefoon,
          adres: v.adres,
          geboortedatum: v.geboortedatum,
          automaat: v.automaat,
          status: v.status as Status,
          instructeurId: v.instructeurId,
          theorieGehaald: v.theorieGehaald,
          examenDatum: v.examenDatum,
          notitie: v.notitie,
        },
      });
      if (!leerling && typeof r.nieuweLeerlingId === "string") onAangemaakt(r.nieuweLeerlingId);
      else setOk("Opgeslagen.");
    } catch (err) {
      setFout(foutVan(err));
    } finally {
      setBezig(false);
    }
  }

  async function nodigUit() {
    if (!leerling) return;
    setFout(null);
    setOk(null);
    try {
      const r = await doe({ actie: "uitnodigen", soort: "leerling", id: leerling.id });
      setOk(r.verstuurd ? `Uitnodiging gestuurd naar ${leerling.email}.` : "De uitnodiging is klaargezet, maar de mail kon niet worden verstuurd. Probeer het later opnieuw.");
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" className="text-sm font-semibold text-brand-600 hover:underline" onClick={onTerug}>
        ← Alle leerlingen
      </button>
      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={bewaar} className="card grid gap-4 p-5 sm:grid-cols-2 lg:col-span-2">
          <h2 className="font-display text-lg font-bold text-ink sm:col-span-2">{leerling ? leerling.naam : "Nieuwe leerling"}</h2>
          <Veld label="Naam">
            <input className="field-input" value={v.naam} onChange={(e) => zet("naam", e.target.value)} required minLength={2} maxLength={100} />
          </Veld>
          <Veld label="E-mail">
            <input className="field-input" type="email" value={v.email} onChange={(e) => zet("email", e.target.value)} required maxLength={200} />
          </Veld>
          <Veld label="Telefoon">
            <input className="field-input" type="tel" value={v.telefoon} onChange={(e) => zet("telefoon", e.target.value)} maxLength={30} />
          </Veld>
          <Veld label="Ophaaladres">
            <input className="field-input" value={v.adres} onChange={(e) => zet("adres", e.target.value)} maxLength={160} />
          </Veld>
          <Veld label="Geboortedatum">
            <input className="field-input" type="date" value={v.geboortedatum} onChange={(e) => zet("geboortedatum", e.target.value)} />
          </Veld>
          <Veld label="Status">
            <select className="field-input" value={v.status} onChange={(e) => zet("status", e.target.value)}>
              {(Object.keys(LEERLING_STATUS_LABEL) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {LEERLING_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Veld>
          <Veld label="Vaste instructeur">
            <select className="field-input" value={v.instructeurId ?? ""} onChange={(e) => zet("instructeurId", e.target.value || null)}>
              <option value="">Nog niet gekozen</option>
              {data.instructeurs.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.naam}
                </option>
              ))}
            </select>
          </Veld>
          <Veld label="Datum praktijkexamen">
            <input className="field-input" type="date" value={v.examenDatum} onChange={(e) => zet("examenDatum", e.target.value)} />
          </Veld>
          <Schakelaar label="Rijdt automaat" aan={v.automaat} onChange={(a) => zet("automaat", a)} />
          <Schakelaar label="Theorie-examen gehaald" aan={v.theorieGehaald} onChange={(a) => zet("theorieGehaald", a)} />
          <div className="sm:col-span-2">
            <Veld label="Notitie (alleen voor de rijschool)">
              <textarea className="field-input min-h-[5rem]" value={v.notitie} onChange={(e) => zet("notitie", e.target.value)} maxLength={2000} />
            </Veld>
          </div>
          <div className="sm:col-span-2">
            <Melding fout={fout} ok={ok} />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={bezig}>
              {bezig ? "Bezig…" : leerling ? "Opslaan" : "Leerling toevoegen"}
            </button>
            {leerling && (
              <>
                <button type="button" className="btn-ghost" onClick={nodigUit}>
                  {leerling.heeftWachtwoord ? "Nieuwe inloglink sturen" : leerling.uitnodigingOpen ? "Uitnodiging opnieuw sturen" : "Account klaarzetten en uitnodigen"}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setPlannen(true)}>
                  Les inplannen
                </button>
              </>
            )}
          </div>
        </form>

        {leerling && (
          <div className="space-y-4">
            <section className="card p-5">
              <h3 className="font-semibold text-ink">Voortgang en tegoed</h3>
              <div className="mt-3">
                <Voortgangsbalk procent={leerling.procent} kleur={data.rijschool.kleur} label="Voortgang" />
                <p className="mt-1 text-xs text-neutralx-500">{leerling.procent}% van examenniveau op alle onderdelen</p>
              </div>
              <p className={`mt-3 text-lg font-bold ${leerling.saldoMin < 0 ? "text-crit" : "text-ink"}`}>{tegoedTekst(leerling.saldoMin, data.rijschool.lesMinuten)}</p>
              {leerling.laatstIngelogd && <p className="text-xs text-neutralx-500">Laatst in de app: {amsterdamDayKey(leerling.laatstIngelogd)}</p>}
            </section>
            <BetalingFormulier data={data} doe={doe} leerlingId={leerling.id} />
            <CorrectieFormulier doe={doe} leerlingId={leerling.id} />
          </div>
        )}
      </div>

      {plannen && leerling && (
        <LesFormulier
          data={data}
          doe={doe}
          concept={nieuwConcept(data, amsterdamDayKey(new Date()), leerling.id)}
          onAnnuleer={() => setPlannen(false)}
          onKlaar={() => {
            setPlannen(false);
            setOk("Les ingepland.");
          }}
        />
      )}
    </div>
  );
}

function BetalingFormulier({ data, doe, leerlingId }: { data: BeheerWeergave; doe: Doe; leerlingId: string }) {
  const [productId, setProductId] = useState("");
  const [bedrag, setBedrag] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [methode, setMethode] = useState<"PIN" | "CONTANT" | "OVERBOEKING">("PIN");
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function kies(id: string) {
    setProductId(id);
    const p = data.producten.find((x) => x.id === id);
    if (p) {
      setBedrag(bedragVeld(p.prijsCent));
      setOmschrijving(p.naam);
    }
  }

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setOk(null);
    const cent = centVan(bedrag);
    if (cent === null) return setFout("Vul een bedrag in, bijvoorbeeld 62,50.");
    try {
      await doe({ actie: "betaling", data: { leerlingId, productId: productId || null, bedragCent: cent, methode, omschrijving } });
      setOk("Betaling geregistreerd.");
      setProductId("");
      setBedrag("");
      setOmschrijving("");
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  return (
    <form onSubmit={bewaar} className="card space-y-3 p-5">
      <h3 className="font-semibold text-ink">Betaling registreren</h3>
      <Veld label="Pakket">
        <select className="field-input" value={productId} onChange={(e) => kies(e.target.value)}>
          <option value="">Geen pakket (los bedrag)</option>
          {data.producten.map((p) => (
            <option key={p.id} value={p.id}>
              {p.naam}
              {p.lessen > 0 ? ` (+${p.lessen} lessen)` : ""}
            </option>
          ))}
        </select>
      </Veld>
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Bedrag (€)">
          <input className="field-input" inputMode="decimal" value={bedrag} onChange={(e) => setBedrag(e.target.value)} required />
        </Veld>
        <Veld label="Betaald met">
          <select className="field-input" value={methode} onChange={(e) => setMethode(e.target.value as typeof methode)}>
            <option value="PIN">Pin</option>
            <option value="CONTANT">Contant</option>
            <option value="OVERBOEKING">Overboeking</option>
          </select>
        </Veld>
      </div>
      <Veld label="Omschrijving">
        <input className="field-input" value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} required minLength={2} maxLength={160} />
      </Veld>
      <Melding fout={fout} ok={ok} />
      <button type="submit" className="btn-primary">
        Registreren
      </button>
      <p className="text-xs text-neutralx-500">Een pakket met lessen zet het tegoed meteen bij.</p>
    </form>
  );
}

function CorrectieFormulier({ doe, leerlingId }: { doe: Doe; leerlingId: string }) {
  const [minuten, setMinuten] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setOk(null);
    const m = Number(minuten);
    if (!Number.isInteger(m) || m === 0) return setFout("Vul een aantal minuten in, bijvoorbeeld 60 of -60.");
    try {
      await doe({ actie: "correctie", data: { leerlingId, minuten: m, omschrijving } });
      setOk("Tegoed aangepast.");
      setMinuten("");
      setOmschrijving("");
    } catch (err) {
      setFout(foutVan(err));
    }
  }

  return (
    <form onSubmit={bewaar} className="card space-y-3 p-5">
      <h3 className="font-semibold text-ink">Tegoed corrigeren</h3>
      <div className="grid grid-cols-2 gap-3">
        <Veld label="Minuten (+ of −)">
          <input className="field-input" inputMode="numeric" value={minuten} onChange={(e) => setMinuten(e.target.value)} required />
        </Veld>
        <Veld label="Reden">
          <input className="field-input" value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} required minLength={2} maxLength={160} />
        </Veld>
      </div>
      <Melding fout={fout} ok={ok} />
      <button type="submit" className="btn-ghost">
        Aanpassen
      </button>
    </form>
  );
}
