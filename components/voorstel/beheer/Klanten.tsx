"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AANVRAAG_STATUS, BEHEER_API, KAART, KLANT_STATUS, KNOP, KNOP_LICHT, Melding, Pil, VELD, dagNaam, euro, useBeheerData, vraag, type AanvraagStatus, type KlantStatus } from "@/components/voorstel/beheer/api";
import { AANWEZIG_LABEL, type Aanwezig } from "@/lib/voorstel/aanwezig-regels";

// CRM: klantenlijst met zoeken en filters, en per klant een dossier met
// klantkaart, tijdlijn (notities, taken, berichten), reserveringen en aanvragen.

const URL_KL = `${BEHEER_API}/klanten`;

interface Regel {
  email: string;
  naam: string;
  telefoon: string;
  bedrijf: string;
  soort: "particulier" | "zakelijk";
  status: KlantStatus;
  tags: string[];
  wensen: string;
  account: boolean;
  reserveringen: number;
  gasten: number;
  omzet: number;
  aanvragen: number;
  nietGekomen: number;
  openTaken: number;
  wachtOpAntwoord: boolean;
  laatsteContact: string;
}
interface Item {
  id: string;
  soort: "notitie" | "taak" | "bericht-klant" | "bericht-team";
  tekst: string;
  door: string;
  datum: string;
  vervalt?: string;
  klaar?: boolean;
}
interface Dossier {
  regel: Regel;
  kaart: { naam: string; telefoon: string; bedrijf: string; soort: "particulier" | "zakelijk"; status: KlantStatus | ""; tags: string[]; wensen: string; notitie: string };
  account: { email: string; aangemaakt: string; laatstIngelogd?: string; google?: boolean } | null;
  reserveringen: { id: string; datum: string; tijd: string; activiteit: string; personen: number; status: string; prijs: number | null; opmerking: string; aanwezig?: Aanwezig }[];
  aanvragen: { id: string; programma: string; gelegenheid: string; personen: number; datum: string; status: AanvraagStatus; bedrag: number | null; bericht: string; aangemaakt: string }[];
  tijdlijn: Item[];
}

const ITEM: Record<Item["soort"], [string, string]> = {
  notitie: ["Notitie", "bg-schw-sand text-schw-night"],
  taak: ["Taak", "bg-[#E0E7FF] text-[#3730A3]"],
  "bericht-klant": ["Bericht van klant", "bg-schw-sun text-schw-night"],
  "bericht-team": ["Bericht aan klant", "bg-[#DCFCE7] text-[#15803D]"],
};

function DossierPaneel({ email, namen, vandaag, terug }: { email: string; namen: Record<string, string>; vandaag: string; terug: () => void }) {
  const [d, setD] = useState<Dossier | null>(null);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [soort, setSoort] = useState<"notitie" | "taak" | "bericht-team">("notitie");
  const [tekst, setTekst] = useState("");
  const [vervalt, setVervalt] = useState("");
  const [versie, setVersie] = useState(0);

  const laad = async () => {
    try {
      setD(await vraag<Dossier>(`${URL_KL}?email=${encodeURIComponent(email)}`));
      setVersie((v) => v + 1);
      setFout("");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  };
  useEffect(() => {
    setD(null);
    setOk("");
    void laad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  async function bewaarKaart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await vraag(URL_KL, {
        method: "PATCH",
        body: { email, naam: f.naam, telefoon: f.telefoon, bedrijf: f.bedrijf, soort: f.soort, status: f.status, tags: (f.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean), wensen: f.wensen, notitie: f.notitie },
      });
      setOk("Klantkaart opgeslagen.");
      void laad();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Opslaan mislukt.");
    }
  }

  async function voegToe(e: FormEvent) {
    e.preventDefault();
    try {
      await vraag(URL_KL, { method: "POST", body: { actie: "toevoegen", email, soort, tekst, ...(soort === "taak" && vervalt ? { vervalt } : {}) } });
      setTekst("");
      setVervalt("");
      setOk(soort === "bericht-team" ? "Bericht verstuurd: de klant ziet het onder Mijn account." : "Toegevoegd.");
      void laad();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Toevoegen mislukt.");
    }
  }

  async function itemActie(body: Record<string, unknown>) {
    try {
      await vraag(URL_KL, { method: "POST", body: { ...body, email } });
      void laad();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Opslaan mislukt.");
    }
  }

  if (!d) return <Melding fout={fout} />;
  const r = d.regel;

  return (
    <div className="space-y-4">
      <div className={KAART}>
        <button type="button" onClick={terug} className="text-sm font-semibold text-schw-mute lg:hidden">
          ← Terug naar de lijst
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl font-bold">{r.naam || r.email}</h3>
            <p className="text-sm text-schw-mute">
              {r.bedrijf && <>{r.bedrijf} · </>}
              {r.email}
              {r.telefoon && <> · {r.telefoon}</>}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pil label={KLANT_STATUS[r.status][0]} kleur={KLANT_STATUS[r.status][1]} />
              <Pil label={r.soort === "zakelijk" ? "Zakelijk" : "Particulier"} kleur="bg-schw-sand text-schw-night" />
              {d.account && <Pil label={d.account.google ? "Account (Google)" : "Account"} kleur="bg-white text-schw-night ring-1 ring-schw-night/15" />}
              {r.nietGekomen > 0 && <Pil label={`${r.nietGekomen}× niet gekomen`} kleur="bg-[#FEE2E2] text-[#B91C1C]" />}
              {r.tags.map((t) => (
                <Pil key={t} label={`#${t}`} kleur="bg-schw-cream text-schw-mute" />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {r.telefoon && <a href={`tel:${r.telefoon}`} className={KNOP_LICHT}>Bellen</a>}
            <a href={`mailto:${r.email}`} className={KNOP_LICHT}>Mailen</a>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Reserveringen", r.reserveringen],
              ["Gasten", r.gasten],
              ["Omzetindicatie", euro(r.omzet)],
              ["Aanvragen", r.aanvragen],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-schw-cream p-3">
              <p className="text-xs text-schw-mute">{k}</p>
              <p className="font-display text-xl font-bold">{v}</p>
            </div>
          ))}
        </div>
      </div>

      <Melding fout={fout} ok={ok} />

      <div className="grid gap-4 xl:grid-cols-2">
        <form key={`kaart-${versie}`} onSubmit={(e) => void bewaarKaart(e)} className={`${KAART} space-y-3`}>
          <h4 className="font-display text-lg font-bold">Klantkaart</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Naam
              <input name="naam" defaultValue={d.kaart.naam || r.naam} className={`${VELD} mt-1`} />
            </label>
            <label className="text-sm font-semibold">
              Telefoon
              <input name="telefoon" defaultValue={d.kaart.telefoon || r.telefoon} className={`${VELD} mt-1`} />
            </label>
            <label className="text-sm font-semibold">
              Bedrijf
              <input name="bedrijf" defaultValue={d.kaart.bedrijf} className={`${VELD} mt-1`} />
            </label>
            <label className="text-sm font-semibold">
              Soort
              <select name="soort" defaultValue={d.kaart.soort} className={`${VELD} mt-1`}>
                <option value="particulier">Particulier</option>
                <option value="zakelijk">Zakelijk</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Status
              <select name="status" defaultValue={d.kaart.status} className={`${VELD} mt-1`}>
                <option value="">Automatisch ({KLANT_STATUS[r.status][0].toLowerCase()})</option>
                <option value="lead">Lead</option>
                <option value="klant">Klant</option>
                <option value="vaste-klant">Vaste klant</option>
                <option value="inactief">Inactief</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Labels (met komma&apos;s)
              <input name="tags" defaultValue={d.kaart.tags.join(", ")} placeholder="jubileum, vip" className={`${VELD} mt-1`} />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Wensen (dieet, allergieën, voorkeuren; de klant ziet en bewerkt dit ook)
            <textarea name="wensen" rows={2} defaultValue={d.kaart.wensen} className={`${VELD} mt-1`} />
          </label>
          <label className="block text-sm font-semibold">
            Interne notitie (alleen voor het team)
            <textarea name="notitie" rows={3} defaultValue={d.kaart.notitie} className={`${VELD} mt-1`} />
          </label>
          <button type="submit" className={KNOP}>
            Klantkaart opslaan
          </button>
        </form>

        <section className={KAART}>
          <h4 className="font-display text-lg font-bold">Tijdlijn</h4>
          <form onSubmit={(e) => void voegToe(e)} className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Soort">
              {(
                [
                  ["notitie", "Notitie"],
                  ["taak", "Taak"],
                  ["bericht-team", "Bericht aan klant"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={soort === k}
                  onClick={() => setSoort(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${soort === k ? "bg-schw-night text-schw-cream" : "bg-schw-cream"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              required
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              aria-label="Tekst"
              placeholder={soort === "bericht-team" ? "Bericht dat de klant onder Mijn account leest…" : soort === "taak" ? "Bijvoorbeeld: offerte nabellen" : "Wat moet het team weten?"}
              className={VELD}
            />
            <div className="flex flex-wrap items-center gap-2">
              {soort === "taak" && <input type="date" value={vervalt} onChange={(e) => setVervalt(e.target.value)} aria-label="Uiterlijk op" className={`${VELD} w-auto`} />}
              <button type="submit" className={KNOP}>
                {soort === "bericht-team" ? "Versturen" : "Toevoegen"}
              </button>
            </div>
          </form>
          <ol className="mt-5 max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {d.tijdlijn.length === 0 && <li className="text-sm text-schw-mute">Nog niets.</li>}
            {d.tijdlijn.map((i) => (
              <li key={i.id} className={`rounded-xl p-3 text-sm ${i.soort === "taak" && i.klaar ? "bg-schw-cream opacity-60" : "bg-schw-cream"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {i.soort === "taak" && (
                    <input
                      type="checkbox"
                      checked={!!i.klaar}
                      aria-label={`Taak ${i.klaar ? "heropenen" : "afronden"}`}
                      onChange={() => void itemActie({ actie: "taak", id: i.id, klaar: !i.klaar })}
                      className="h-4 w-4 accent-[#FF5F1F]"
                    />
                  )}
                  <Pil label={ITEM[i.soort][0]} kleur={ITEM[i.soort][1]} />
                  <span className="text-xs text-schw-mute">
                    {i.door} · {dagNaam(i.datum.slice(0, 10), { day: "numeric", month: "short" })}
                    {i.vervalt && <> · uiterlijk {dagNaam(i.vervalt, { day: "numeric", month: "short" })}</>}
                    {i.vervalt && !i.klaar && i.vervalt < vandaag && <strong className="text-[#B91C1C]"> · te laat</strong>}
                  </span>
                  {(i.soort === "notitie" || i.soort === "taak") && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Verwijderen?")) void itemActie({ actie: "verwijderen", id: i.id });
                      }}
                      className="ml-auto text-xs font-semibold text-[#B91C1C]"
                    >
                      Verwijder
                    </button>
                  )}
                </div>
                <p className={`mt-1 whitespace-pre-line ${i.soort === "taak" && i.klaar ? "line-through" : ""}`}>{i.tekst}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={KAART}>
          <h4 className="font-display text-lg font-bold">Reserveringen</h4>
          {d.reserveringen.length === 0 && <p className="mt-2 text-sm text-schw-mute">Geen reserveringen.</p>}
          <ul className="mt-3 divide-y divide-schw-night/5 text-sm">
            {d.reserveringen.map((b) => (
              <li key={`${b.datum}-${b.id}`} className="py-2">
                <p className={b.status === "geannuleerd" ? "line-through opacity-60" : ""}>
                  <strong className="first-letter:uppercase">{dagNaam(b.datum, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</strong> {b.tijd} ·{" "}
                  {namen[b.activiteit] ?? b.activiteit} · {b.personen} pers. · {b.status}
                  {b.aanwezig && <> · {AANWEZIG_LABEL[b.aanwezig]}</>}
                  {b.prijs !== null && <> · {euro(b.prijs)}</>}
                </p>
                {b.opmerking && <p className="text-schw-mute">&ldquo;{b.opmerking}&rdquo;</p>}
              </li>
            ))}
          </ul>
        </section>
        <section className={KAART}>
          <h4 className="font-display text-lg font-bold">Aanvragen</h4>
          {d.aanvragen.length === 0 && <p className="mt-2 text-sm text-schw-mute">Geen aanvragen.</p>}
          <ul className="mt-3 space-y-2 text-sm">
            {d.aanvragen.map((a) => (
              <li key={a.id} className="rounded-xl bg-schw-cream p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    {a.programma || a.gelegenheid || "Op maat"} · {a.personen} pers.
                  </strong>
                  <Pil label={AANVRAAG_STATUS[a.status][0]} kleur={AANVRAAG_STATUS[a.status][1]} />
                </div>
                <p className="text-schw-mute">
                  {a.datum ? dagNaam(a.datum, { day: "numeric", month: "long", year: "numeric" }) : "datum open"}
                  {a.bedrag !== null && <> · offerte {euro(a.bedrag)}</>}
                </p>
                {a.bericht && <p className="mt-1">&ldquo;{a.bericht}&rdquo;</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function Klanten({ namen, vandaag, start }: { namen: Record<string, string>; vandaag: string; start: string }) {
  const { data, fout } = useBeheerData<{ klanten: Regel[] }>(URL_KL);
  const [zoek, setZoek] = useState("");
  const [status, setStatus] = useState<"" | KlantStatus>("");
  const [soort, setSoort] = useState<"" | "particulier" | "zakelijk">("");
  const [extra, setExtra] = useState<"" | "antwoord" | "taken">("");
  const [sorteer, setSorteer] = useState<"contact" | "omzet" | "naam">("contact");
  const [gekozen, setGekozen] = useState(start);
  const paneel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void setGekozen(start);
  }, [start]);

  const lijst = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    const l = (data?.klanten ?? []).filter(
      (k) =>
        (!q || `${k.naam} ${k.email} ${k.telefoon} ${k.bedrijf} ${k.tags.join(" ")}`.toLowerCase().includes(q)) &&
        (!status || k.status === status) &&
        (!soort || k.soort === soort) &&
        (extra !== "antwoord" || k.wachtOpAntwoord) &&
        (extra !== "taken" || k.openTaken > 0),
    );
    return [...l].sort((a, b) => (sorteer === "omzet" ? b.omzet - a.omzet : sorteer === "naam" ? (a.naam || a.email).localeCompare(b.naam || b.email) : b.laatsteContact.localeCompare(a.laatsteContact)));
  }, [data, zoek, status, soort, extra, sorteer]);

  const kies = (email: string) => {
    setGekozen(email);
    window.setTimeout(() => paneel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
      <div className={gekozen ? "hidden lg:block" : ""}>
        <div className="space-y-2">
          <input type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, e-mail, bedrijf of label" aria-label="Zoek klanten" className={VELD} />
          <div className="grid grid-cols-2 gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as "" | KlantStatus)} aria-label="Status" className={VELD}>
              <option value="">Alle statussen</option>
              <option value="lead">Leads</option>
              <option value="klant">Klanten</option>
              <option value="vaste-klant">Vaste klanten</option>
              <option value="inactief">Inactief</option>
            </select>
            <select value={soort} onChange={(e) => setSoort(e.target.value as "" | "particulier" | "zakelijk")} aria-label="Soort" className={VELD}>
              <option value="">Particulier en zakelijk</option>
              <option value="particulier">Particulier</option>
              <option value="zakelijk">Zakelijk</option>
            </select>
            <select value={extra} onChange={(e) => setExtra(e.target.value as "" | "antwoord" | "taken")} aria-label="Extra filter" className={VELD}>
              <option value="">Alles</option>
              <option value="antwoord">Wacht op antwoord</option>
              <option value="taken">Met open taken</option>
            </select>
            <select value={sorteer} onChange={(e) => setSorteer(e.target.value as "contact" | "omzet" | "naam")} aria-label="Sorteren" className={VELD}>
              <option value="contact">Laatste contact</option>
              <option value="omzet">Hoogste omzet</option>
              <option value="naam">Naam</option>
            </select>
          </div>
          <p className="text-sm text-schw-mute">{data ? `${lijst.length} van ${data.klanten.length} klanten` : "Laden…"}</p>
        </div>
        <Melding fout={fout} />
        <ul className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {lijst.map((k) => (
            <li key={k.email}>
              <button
                type="button"
                onClick={() => kies(k.email)}
                aria-current={gekozen === k.email}
                className={`w-full rounded-2xl p-4 text-left transition-colors ${gekozen === k.email ? "bg-schw-night text-schw-cream" : "bg-white shadow-[0_1px_2px_rgba(10,18,14,0.06)] hover:ring-2 hover:ring-schw-orange"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold">{k.naam || k.email}</p>
                  <Pil label={KLANT_STATUS[k.status][0]} kleur={KLANT_STATUS[k.status][1]} />
                </div>
                <p className={`truncate text-sm ${gekozen === k.email ? "text-schw-cream/70" : "text-schw-mute"}`}>{k.bedrijf || k.email}</p>
                <p className={`mt-1 text-xs ${gekozen === k.email ? "text-schw-cream/70" : "text-schw-mute"}`}>
                  {k.reserveringen} res. · {k.gasten} gasten · {euro(k.omzet)}
                  {k.wachtOpAntwoord && <strong className={`ml-2 ${gekozen === k.email ? "text-schw-orange" : "text-schw-rust"}`}>● wacht op antwoord</strong>}
                  {k.openTaken > 0 && <span className="ml-2">· {k.openTaken} taak/taken</span>}
                  {k.nietGekomen > 0 && <span className="ml-2">· {k.nietGekomen}× niet gekomen</span>}
                </p>
              </button>
            </li>
          ))}
          {data && lijst.length === 0 && <li className="text-sm text-schw-mute">Geen klanten gevonden.</li>}
        </ul>
      </div>
      <div ref={paneel} className="scroll-mt-24">
        {gekozen ? (
          <DossierPaneel email={gekozen} namen={namen} vandaag={vandaag} terug={() => setGekozen("")} />
        ) : (
          <div className={`${KAART} hidden text-schw-mute lg:block`}>Kies een klant om het dossier te openen.</div>
        )}
      </div>
    </div>
  );
}
