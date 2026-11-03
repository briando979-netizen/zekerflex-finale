"use client";

import { useMemo, useState, type FormEvent } from "react";
import { BEHEER_API, KAART, KNOP, KNOP_LICHT, Melding, VELD, VELD_BASIS, dagNaam, useBeheerData, vraag } from "@/components/voorstel/beheer/api";
import { BASE } from "@/lib/voorstel/schwarzwald";
import { AANWEZIG_LABEL, aanmeldFout, balieStand, type Aanwezig } from "@/lib/voorstel/aanwezig-regels";

// Reserveringen: overzicht per dag met zoeken en filters, bevestigen,
// annuleren, verwijderen, zelf inboeken (telefoon/balie), gasten aanmelden
// bij de balie (vanaf de dag zelf) en Excel-export.

export type Status = "nieuw" | "bevestigd" | "geannuleerd";
export interface BeheerBoeking {
  id: string;
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
  naam: string;
  email: string;
  telefoon: string;
  opmerking: string;
  status: Status;
  door?: "online" | "beheer";
  /** "JJJJ-MM-DD HH:MM" waarvandaan de gast hem zelf verzette */
  verzetVan?: string;
  /** aantal personen voordat de gast het zelf wijzigde */
  aantalVan?: number;
  aanwezig?: Aanwezig;
  prijs: number | null;
}

/** "verzet door de gast, was wo 4 nov 14:00" */
export const verzetTekst = (van: string) =>
  `verzet door de gast, was ${dagNaam(van.slice(0, 10), { weekday: "short", day: "numeric", month: "short" })} ${van.slice(11)}`;

const PIL: Record<Status, string> = {
  nieuw: "bg-schw-sun text-schw-night",
  bevestigd: "bg-[#DCFCE7] text-[#15803D]",
  geannuleerd: "bg-schw-sand text-schw-mute line-through",
};
const AANWEZIG_PIL: Record<Aanwezig, string> = {
  ja: "bg-[#DCFCE7] text-[#15803D]",
  nee: "bg-[#FEE2E2] text-[#B91C1C]",
};

function NieuweReservering({ namen, klaar }: { namen: Record<string, string>; klaar: () => void }) {
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  async function verstuur(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBezig(true);
    setFout("");
    try {
      await vraag(BEHEER_API, { method: "POST", body: { ...f, personen: Number(f.personen) } });
      klaar();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Opslaan mislukt.");
    } finally {
      setBezig(false);
    }
  }
  return (
    <form onSubmit={(e) => void verstuur(e)} className={`${KAART} mt-4 grid gap-3 sm:grid-cols-4`}>
      <label className="text-sm font-semibold sm:col-span-2">
        Activiteit
        <select name="activiteit" required className={`${VELD} mt-1`}>
          {Object.entries(namen).map(([slug, naam]) => (
            <option key={slug} value={slug}>{naam}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold">
        Datum
        <input name="datum" type="date" required className={`${VELD} mt-1`} />
      </label>
      <label className="text-sm font-semibold">
        Begintijd (heel uur)
        <input name="tijd" type="time" step={3600} required className={`${VELD} mt-1`} />
      </label>
      <label className="text-sm font-semibold">
        Personen
        <input name="personen" type="number" min={1} max={500} required className={`${VELD} mt-1`} />
      </label>
      <label className="text-sm font-semibold">
        Naam
        <input name="naam" required className={`${VELD} mt-1`} />
      </label>
      <label className="text-sm font-semibold">
        E-mail
        <input name="email" type="email" required className={`${VELD} mt-1`} />
      </label>
      <label className="text-sm font-semibold">
        Telefoon
        <input name="telefoon" type="tel" required className={`${VELD} mt-1`} />
      </label>
      <label className="text-sm font-semibold sm:col-span-3">
        Opmerking
        <input name="opmerking" className={`${VELD} mt-1`} />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={bezig} className={`${KNOP} w-full`}>
          {bezig ? "Bezig…" : "Inboeken"}
        </button>
      </div>
      <div className="sm:col-span-4">
        <Melding fout={fout} />
      </div>
    </form>
  );
}

export function Reserveringen({ namen, vandaag }: { namen: Record<string, string>; vandaag: string }) {
  const { data, setData, fout, setFout, laad } = useBeheerData<{ boekingen: BeheerBoeking[] }>(BEHEER_API);
  const [alles, setAlles] = useState(false);
  const [status, setStatus] = useState<"" | Status>("");
  const [activiteit, setActiviteit] = useState("");
  const [zoek, setZoek] = useState("");
  const [nieuw, setNieuw] = useState(false);
  const [bezig, setBezig] = useState("");

  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (data?.boekingen ?? []).filter(
      (b) =>
        (alles || b.datum >= vandaag) &&
        (!status || b.status === status) &&
        (!activiteit || b.activiteit === activiteit) &&
        (!q || `${b.naam} ${b.email} ${b.telefoon} ${b.id}`.toLowerCase().includes(q)),
    );
  }, [data, alles, status, activiteit, zoek, vandaag]);
  const perDag = useMemo(() => {
    const m = new Map<string, BeheerBoeking[]>();
    for (const b of lijst) m.set(b.datum, [...(m.get(b.datum) ?? []), b]);
    return [...m.entries()].map(([datum, items]) => ({ datum, items, stand: balieStand(items) }));
  }, [lijst]);

  // status of aanmelding wijzigen; de server geeft de boeking terug zoals hij nu is
  // (annuleren wist bv. ook de aanmelding), dus die nemen we over
  async function wijzig(b: BeheerBoeking, body: { status: Status } | { aanwezig: Aanwezig | null }) {
    setBezig(b.id);
    try {
      const { boeking } = await vraag<{ boeking: Omit<BeheerBoeking, "prijs"> }>(BEHEER_API, { method: "PATCH", body: { datum: b.datum, id: b.id, ...body } });
      setData((d) => (d ? { boekingen: d.boekingen.map((x) => (x.id === b.id && x.datum === b.datum ? { ...boeking, prijs: x.prijs } : x)) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBezig("");
    }
  }
  const zet = (b: BeheerBoeking, status: Status) => wijzig(b, { status });
  const meld = (b: BeheerBoeking, aanwezig: Aanwezig | null) => wijzig(b, { aanwezig });

  async function verwijder(b: BeheerBoeking) {
    if (!window.confirm(`Reservering ${b.id} van ${b.naam} definitief verwijderen?`)) return;
    try {
      await vraag(BEHEER_API, { method: "DELETE", body: { datum: b.datum, id: b.id } });
      setData((d) => (d ? { boekingen: d.boekingen.filter((x) => !(x.id === b.id && x.datum === b.datum)) } : d));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen mislukt.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, e-mail, telefoon of nummer" aria-label="Zoeken" className={`${VELD} max-w-xs`} />
        <select value={activiteit} onChange={(e) => setActiviteit(e.target.value)} aria-label="Activiteit" className={`${VELD_BASIS} w-auto`}>
          <option value="">Alle activiteiten</option>
          {Object.entries(namen).map(([slug, naam]) => (
            <option key={slug} value={slug}>{naam}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as "" | Status)} aria-label="Status" className={`${VELD_BASIS} w-auto`}>
          <option value="">Alle statussen</option>
          <option value="nieuw">Nieuw</option>
          <option value="bevestigd">Bevestigd</option>
          <option value="geannuleerd">Geannuleerd</option>
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={alles} onChange={(e) => setAlles(e.target.checked)} className="h-4 w-4 accent-[#FF5F1F]" />
          Ook voorbij
        </label>
        <div className="ml-auto flex gap-2">
          <a href={`${BEHEER_API}?formaat=csv`} className={KNOP_LICHT}>Export (Excel)</a>
          <button type="button" onClick={() => void laad()} className={KNOP_LICHT}>Vernieuwen</button>
          <button type="button" onClick={() => setNieuw((v) => !v)} aria-expanded={nieuw} className={KNOP}>
            {nieuw ? "Sluiten" : "+ Reservering"}
          </button>
        </div>
      </div>
      {nieuw && (
        <NieuweReservering
          namen={namen}
          klaar={() => {
            setNieuw(false);
            void laad();
          }}
        />
      )}
      <div className="mt-4">
        <Melding fout={fout} />
      </div>
      {data && perDag.length === 0 && <p className="mt-8 text-schw-mute">Geen reserveringen gevonden.</p>}
      <div className="mt-6 space-y-8">
        {perDag.map(({ datum, items, stand }) => (
          <section key={datum}>
            <h3 className="font-display text-xl font-bold first-letter:uppercase">
              {dagNaam(datum)}
              <span className="ml-3 text-sm font-semibold text-schw-mute">
                {stand.verwacht} gasten
                {datum <= vandaag && stand.verwacht > 0 && (
                  <>
                    {" "}
                    · {stand.binnen} binnen{stand.nietGekomen > 0 && <> · {stand.nietGekomen} niet gekomen</>}
                  </>
                )}
              </span>
              <a href={`${BASE}/beheer/dag/${datum}`} target="_blank" rel="noopener" className="ml-3 text-sm font-semibold underline">
                Dagplanning printen
              </a>
            </h3>
            <ul className="mt-3 space-y-2">
              {items.map((b) => (
                <li key={b.id} className="grid gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:grid-cols-[5rem_1fr_auto] sm:items-center">
                  <p className="font-display text-2xl font-bold">{b.tijd}</p>
                  <div className="min-w-0">
                    <p className="font-bold">
                      {namen[b.activiteit] ?? b.activiteit} · {b.personen} personen
                      <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${PIL[b.status]}`}>{b.status}</span>
                      {b.aanwezig && <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${AANWEZIG_PIL[b.aanwezig]}`}>{AANWEZIG_LABEL[b.aanwezig]}</span>}
                      {b.door === "beheer" && <span className="ml-2 rounded-full bg-schw-sand px-2.5 py-0.5 text-xs font-bold">ingeboekt</span>}
                    </p>
                    <p className="truncate text-sm text-schw-mute">
                      {b.naam} · <a href={`tel:${b.telefoon}`} className="underline">{b.telefoon}</a> · <a href={`mailto:${b.email}`} className="underline">{b.email}</a> · nr. {b.id}
                      {b.prijs !== null && <> · € {b.prijs.toLocaleString("nl-NL")}</>}
                    </p>
                    {b.opmerking && <p className="mt-1 text-sm">&ldquo;{b.opmerking}&rdquo;</p>}
                    {b.verzetVan && <p className="mt-1 text-sm font-semibold text-schw-rust">{verzetTekst(b.verzetVan)}</p>}
                    {b.aantalVan !== undefined && <p className="mt-1 text-sm font-semibold text-schw-rust">aantal gewijzigd door de gast, was {b.aantalVan}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!aanmeldFout(b, vandaag) &&
                      (b.aanwezig ? (
                        <button type="button" disabled={bezig === b.id} onClick={() => void meld(b, null)} aria-label={`Ongedaan maken: ${b.naam} ${AANWEZIG_LABEL[b.aanwezig]}`} className={KNOP_LICHT}>
                          Ongedaan maken
                        </button>
                      ) : (
                        <>
                          <button type="button" disabled={bezig === b.id} onClick={() => void meld(b, "ja")} aria-label={`Aangekomen: ${b.naam}`} className={KNOP}>
                            Aangekomen
                          </button>
                          <button type="button" disabled={bezig === b.id} onClick={() => void meld(b, "nee")} aria-label={`Niet gekomen: ${b.naam}`} className={KNOP_LICHT}>
                            Niet gekomen
                          </button>
                        </>
                      ))}
                    {b.status !== "bevestigd" && !b.aanwezig && (
                      <button type="button" disabled={bezig === b.id} onClick={() => void zet(b, "bevestigd")} className={KNOP}>
                        Bevestig
                      </button>
                    )}
                    {b.status !== "geannuleerd" && b.aanwezig !== "ja" && (
                      <button type="button" disabled={bezig === b.id} onClick={() => void zet(b, "geannuleerd")} className={KNOP_LICHT}>
                        Annuleer
                      </button>
                    )}
                    <button type="button" onClick={() => void verwijder(b)} aria-label={`Reservering ${b.id} verwijderen`} className={`${KNOP_LICHT} text-[#B91C1C]`}>
                      Verwijder
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
