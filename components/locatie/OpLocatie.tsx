"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TABS, type Tab } from "@/lib/locatie/tabs";
import {
  BESLUIT_TEKST,
  KLUIS_SOORT_ICOON,
  KLUIS_SOORT_LABEL,
  LABEL_FORMAAT,
  LABEL_SOORTEN,
  MODULES,
  MODULE_DEFS,
  PRINT_STATUS_LABEL,
  SOORT_LABEL,
  STANDAARD_MINUTEN_VOORAF,
  toonKenteken,
  type Besluit,
  type KluisItemMeta,
  type KluisSoort,
  type LabelSoort,
  type LocatieStand,
  type ModuleSleutel,
  type PrintOpdracht,
  type Registratie,
  type ToegangSoort,
} from "@/lib/locatie/modules";
import { BluetoothPrint } from "@/components/locatie/BluetoothPrint";
import { Portofoon, type KanaalInfo } from "@/components/locatie/Portofoon";

// ---------------------------------------------------------------------------
// Werkgever → Op locatie: de vier modules aanzetten en inrichten.
//   Overzicht   aan/uit per module, wat je ervoor nodig hebt
//   Portofoon   het kanaal van een vestiging of klus (zelfde onderdeel als de werker)
//   Toegang     kentekens, het kastje per vestiging (token), logboek, handmatig openen, proef
//   Kluis       codes en inloggegevens per vestiging, logboek van wie wat bekeek
//   Printen     badge bij inchecken, wachtrij, printagent, los label printen
// Alles via /api/werkgever/locatie; de server geeft na elke handeling de hele stand terug.
// ---------------------------------------------------------------------------

// De tabbladen staan in lib/locatie/tabs.ts: de pagina (server) leest ?tab= en
// mag daarvoor niets uit dit clientbestand aanroepen.

interface Vestiging {
  id: string;
  naam: string;
  plaats: string;
  adres: string;
}
interface ToegangVestiging extends Vestiging {
  aan: boolean;
  openSeconden: number;
  meldPlanner: boolean;
  meldWerker: boolean;
  heeftToken: boolean;
  status: "geen-token" | "nooit-gezien" | "online" | "offline";
  laatstGezien: string | null;
  apparaat: string | null;
}
interface ToegangEvent {
  id: string;
  at: string;
  branchId: string;
  kenteken: string;
  besluit: Besluit;
  bron: "camera" | "handmatig" | "proef";
  camera?: string;
}
interface KluisLogRegel {
  at: string;
  userId: string;
  naam: string;
  itemId: string;
  titel: string;
  shiftId?: string;
  rol: "team" | "werker";
}
interface PrintInstellingen {
  badgeBijInchecken: boolean;
  badgeSoort: LabelSoort;
  branchIds: string[];
  voet: string;
}
export interface OpLocatieData {
  stand: LocatieStand;
  scope: { magBeheren: boolean; branchIds: string[] | null };
  vestigingen: Vestiging[];
  toegang: { vestigingen: ToegangVestiging[]; registraties: Registratie[]; log: ToegangEvent[] };
  kluis: { items: KluisItemMeta[]; log: KluisLogRegel[] };
  printen: { instellingen: PrintInstellingen; wachtrij: PrintOpdracht[]; agent: { naam: string; status: string; laatstGezien: string | null; printer: string | null; sinds: string } | null };
}
type Antwoord = OpLocatieData & { melding?: string; geheim?: string; token?: string; proef?: ToegangEvent | PrintOpdracht };

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** "5 nov, 09:05" in Nederlandse tijd; vast formaat, geen toLocale* (server en browser gelijk). */
function tijd(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")} ${MAANDEN[Number(v("month")) - 1] ?? ""}, ${v("hour")}:${v("minute")}`;
}

const VELD = "mt-1 block w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm text-ink";
const KNOP = "rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50";
const KNOP_LICHT = "rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-paper-soft disabled:opacity-50";

const MODULE_ICOON: Record<ModuleSleutel, string> = { portofoon: "📻", toegang: "🚧", kluis: "🔐", printen: "🏷️" };
const MODULE_TAB: Record<ModuleSleutel, Tab> = { portofoon: "portofoon", toegang: "toegang", kluis: "kluis", printen: "printen" };

function Schakelaar({ aan, onChange, disabled, label }: { aan: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aan}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!aan)}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${aan ? "bg-ok" : "bg-neutralx-300"}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${aan ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function Kaart({ title, sub, children, actions }: { title: string; sub?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-hair bg-white shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hair px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-neutralx-500">{sub}</p>}
        </div>
        {actions}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function Status({ status }: { status: ToegangVestiging["status"] | string }) {
  const map: Record<string, { tekst: string; kleur: string }> = {
    online: { tekst: "online", kleur: "bg-ok/15 text-ok" },
    offline: { tekst: "offline", kleur: "bg-crit/10 text-crit" },
    "nooit-gezien": { tekst: "nog niet gezien", kleur: "bg-warn/15 text-warn-ink" },
    "geen-token": { tekst: "geen token", kleur: "bg-paper-soft text-neutralx-500" },
    geen: { tekst: "niet gekoppeld", kleur: "bg-paper-soft text-neutralx-500" },
  };
  const m = map[status] ?? { tekst: status, kleur: "bg-paper-soft text-neutralx-500" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.kleur}`}>{m.tekst}</span>;
}

function TokenKader({ token, onSluit, uitleg }: { token: string; onSluit: () => void; uitleg: string }) {
  const [gekopieerd, setGekopieerd] = useState(false);
  return (
    <div role="alert" className="mt-3 rounded-xl border border-warn/40 bg-warn/5 p-4">
      <p className="text-sm font-semibold text-ink">Dit token zie je maar één keer</p>
      <p className="mt-1 text-xs text-neutralx-600">{uitleg}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="break-all rounded-lg bg-white px-3 py-2 text-xs text-ink ring-1 ring-hair">{token}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(token).then(() => setGekopieerd(true));
          }}
          className={KNOP_LICHT}
        >
          {gekopieerd ? "Gekopieerd" : "Kopiëren"}
        </button>
        <button type="button" onClick={onSluit} className="text-xs text-neutralx-500 underline">
          Sluiten
        </button>
      </div>
    </div>
  );
}

export function OpLocatie({ init, startTab = "overzicht", ik }: { init: OpLocatieData; startTab?: Tab; ik: { userId: string; naam: string } }) {
  const [data, setData] = useState<OpLocatieData>(init);
  const [tab, setTab] = useState<Tab>(startTab);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [token, setToken] = useState<{ voor: string; waarde: string } | null>(null);
  const [geheimen, setGeheimen] = useState<Record<string, string>>({});
  const [proef, setProef] = useState<ToegangEvent | null>(null);
  const [kanalen, setKanalen] = useState<KanaalInfo[] | null>(null);

  const roep = useCallback(async (body: Record<string, unknown>): Promise<Antwoord | null> => {
    setBezig(true);
    setMelding(null);
    const r = await fetch("/api/werkgever/locatie", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => ({}))) as Antwoord & { error?: { message?: string } }) : null;
    setBezig(false);
    if (!r?.ok || !d) {
      setMelding({ ok: false, tekst: d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw." });
      return null;
    }
    setData(d);
    if (d.melding) setMelding({ ok: true, tekst: d.melding });
    return d;
  }, []);

  useEffect(() => {
    if (tab !== "portofoon" || kanalen) return;
    fetch("/api/locatie/portofoon", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { kanalen?: KanaalInfo[] }) => setKanalen(d.kanalen ?? []))
      .catch(() => setKanalen([]));
  }, [tab, kanalen]);

  const aan = (s: ModuleSleutel) => Boolean(data.stand.modules[s]?.aan);
  const mag = data.scope.magBeheren;
  const vestigingNaam = (id: string | undefined) => (id ? (data.vestigingen.find((v) => v.id === id)?.naam ?? "vestiging") : "alle vestigingen");

  return (
    <div>
      <div role="tablist" aria-label="Onderdelen" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === t.key ? "bg-ink text-white" : "bg-white text-neutralx-600 ring-1 ring-hair hover:bg-paper-soft"}`}
          >
            {t.key !== "overzicht" && !aan(t.key) ? <span className="mr-1 text-neutralx-400" aria-hidden>○</span> : null}
            {t.label}
          </button>
        ))}
      </div>

      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${melding.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>
          {melding.tekst}
        </p>
      )}

      <div className="mt-4 space-y-5">
        {tab === "overzicht" && (
          <>
            {!mag && <p className="rounded-xl bg-paper-soft px-4 py-2.5 text-xs text-neutralx-600">Je bent vestigingsbeheerder: je kunt de modules gebruiken; aan- en uitzetten en instellen doet de beheerder van het bedrijf.</p>}
            <div className="grid gap-4 md:grid-cols-2">
              {MODULES.map((s) => {
                const def = MODULE_DEFS[s];
                const st = data.stand.modules[s];
                return (
                  <section key={s} className={`rounded-2xl border bg-white p-5 shadow-card ${st?.aan ? "border-ok/40" : "border-hair"}`}>
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl bg-paper-soft text-2xl" aria-hidden>
                        {MODULE_ICOON[s]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-display text-base font-bold text-ink">{def.naam}</h2>
                        <p className="mt-0.5 text-xs text-neutralx-500">{def.kort}</p>
                      </div>
                      <Schakelaar aan={Boolean(st?.aan)} disabled={!mag || bezig} label={`${def.naam} aan of uit`} onChange={(v) => void roep({ action: "module", sleutel: s, aan: v })} />
                    </div>
                    <p className="mt-3 text-sm text-neutralx-700">{def.uitleg}</p>
                    <ul className="mt-3 space-y-1 text-sm text-neutralx-700">
                      {def.punten.map((p) => (
                        <li key={p} className="flex gap-2">
                          <span className="text-brand-500" aria-hidden>✓</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                    <dl className="mt-3 grid gap-1 text-xs text-neutralx-600">
                      <div>
                        <dt className="inline font-semibold text-ink">Nodig: </dt>
                        <dd className="inline">{def.nodig}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-ink">Prijs: </dt>
                        <dd className="inline">{def.prijsTekst}. Zet aan en gebruik het; we nemen contact op over een passende prijs.</dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutralx-500">
                      <span>{st?.aan ? `Aan sinds ${tijd(st.sinds)} (${st.doorNaam})` : st ? `Uit sinds ${tijd(st.sinds)}` : "Nog niet aangezet"}</span>
                      <button type="button" onClick={() => setTab(MODULE_TAB[s])} className="font-semibold text-brand-600 hover:underline">
                        Inrichten ›
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}

        {tab === "portofoon" && (
          <Kaart title="Portofoon" sub="Kies het kanaal van een vestiging (iedereen die daar vandaag werkt) of van één klus. Houd de knop ingedrukt om te praten.">
            {!aan("portofoon") ? (
              <p className="text-sm text-neutralx-600">Zet de portofoon eerst aan op het tabblad Overzicht.</p>
            ) : kanalen === null ? (
              <p className="text-sm text-neutralx-500">Kanalen laden…</p>
            ) : (
              <Portofoon kanalen={kanalen} ik={ik} chatHref="/werkgever/berichten" />
            )}
          </Kaart>
        )}

        {tab === "toegang" && <ToegangTab data={data} mag={mag} bezig={bezig} roep={roep} token={token} setToken={setToken} proef={proef} setProef={setProef} vestigingNaam={vestigingNaam} />}
        {tab === "kluis" && <KluisTab data={data} mag={mag} bezig={bezig} roep={roep} geheimen={geheimen} setGeheimen={setGeheimen} vestigingNaam={vestigingNaam} />}
        {tab === "printen" && <PrintTab data={data} mag={mag} bezig={bezig} roep={roep} token={token} setToken={setToken} vestigingNaam={vestigingNaam} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════ Toegang ═══════════════════════════ */

function ToegangTab({
  data,
  mag,
  bezig,
  roep,
  token,
  setToken,
  proef,
  setProef,
  vestigingNaam,
}: {
  data: OpLocatieData;
  mag: boolean;
  bezig: boolean;
  roep: (b: Record<string, unknown>) => Promise<Antwoord | null>;
  token: { voor: string; waarde: string } | null;
  setToken: (t: { voor: string; waarde: string } | null) => void;
  proef: ToegangEvent | null;
  setProef: (e: ToegangEvent | null) => void;
  vestigingNaam: (id: string | undefined) => string;
}) {
  const [nieuw, setNieuw] = useState<{ kenteken: string; soort: ToegangSoort; naam: string; branchId: string; geldigVan: string; geldigTot: string; toelichting: string }>({
    kenteken: "",
    soort: "bezoeker",
    naam: "",
    branchId: "",
    geldigVan: "",
    geldigTot: "",
    toelichting: "",
  });
  const [proefKenteken, setProefKenteken] = useState("");
  const [proefBranch, setProefBranch] = useState(data.toegang.vestigingen[0]?.id ?? "");
  const aan = Boolean(data.stand.modules.toegang?.aan);

  return (
    <>
      {!aan && <p className="rounded-xl bg-warn/10 px-4 py-2.5 text-sm text-warn-ink">Toegang op kenteken staat uit: het kastje krijgt op elke vraag &quot;niet openen&quot;. Zet de module aan op het tabblad Overzicht.</p>}

      <Kaart title="Vestigingen en het kastje bij de slagboom" sub="Per vestiging een kastje (Raspberry Pi of mini-pc met de camera, zie deploy/toegang). Het token koppelt het kastje aan deze vestiging.">
        {data.toegang.vestigingen.length === 0 ? (
          <p className="text-sm text-neutralx-600">
            Nog geen vaste vestigingen. Maak er een onder <Link href="/werkgever/locaties" className="font-semibold text-brand-600 underline">Locaties</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-hair">
            {data.toegang.vestigingen.map((v) => (
              <li key={v.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{v.naam}</p>
                  <span className="text-xs text-neutralx-500">{v.plaats}</span>
                  <Status status={v.status} />
                  {v.laatstGezien && <span className="text-xs text-neutralx-400">gezien {tijd(v.laatstGezien)}{v.apparaat ? ` · ${v.apparaat}` : ""}</span>}
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button type="button" disabled={bezig || !v.heeftToken || !aan} onClick={() => void roep({ action: "toegang-open", branchId: v.id })} className={KNOP} title={!v.heeftToken ? "Maak eerst een token voor het kastje" : "Het kastje opent de slagboom"}>
                      🚧 Open slagboom
                    </button>
                    {mag && (
                      <button
                        type="button"
                        disabled={bezig}
                        onClick={async () => {
                          if (v.heeftToken && !window.confirm("Nieuw token maken? Het huidige kastje werkt dan niet meer tot je het nieuwe token invult.")) return;
                          const d = await roep({ action: "toegang-token", branchId: v.id });
                          if (d?.token) setToken({ voor: v.id, waarde: d.token });
                        }}
                        className={KNOP_LICHT}
                      >
                        {v.heeftToken ? "Nieuw token" : "Token voor het kastje"}
                      </button>
                    )}
                  </div>
                </div>
                {token?.voor === v.id && <TokenKader token={token.waarde} onSluit={() => setToken(null)} uitleg="Zet dit token in het kastje als TOEGANG_TOKEN (deploy/toegang/README.md). Het kastje meldt zich daarna hier als 'online'." />}
                {mag && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <Schakelaar aan={v.aan} disabled={bezig} label={`Toegang op ${v.naam} aan`} onChange={(x) => void roep({ action: "toegang-vestiging", branchId: v.id, aan: x })} />
                      Toegang aan
                    </label>
                    <label className="text-xs text-neutralx-600">
                      Slagboom open (seconden)
                      <input
                        type="number"
                        min={1}
                        max={60}
                        defaultValue={v.openSeconden}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (n !== v.openSeconden && n >= 1 && n <= 60) void roep({ action: "toegang-vestiging", branchId: v.id, openSeconden: n });
                        }}
                        className={VELD}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <Schakelaar aan={v.meldPlanner} disabled={bezig} label="Melding aan de planner" onChange={(x) => void roep({ action: "toegang-vestiging", branchId: v.id, meldPlanner: x })} />
                      Melding aan planner
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <Schakelaar aan={v.meldWerker} disabled={bezig} label="Welkomstbericht aan de werker" onChange={(x) => void roep({ action: "toegang-vestiging", branchId: v.id, meldWerker: x })} />
                      Welkom aan werker
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kaart>

      <Kaart title="Proef met een kenteken" sub="Doe alsof dit kenteken nu bij de slagboom staat. Niets gaat open en er gaat geen melding uit; je ziet alleen het besluit.">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await roep({ action: "toegang-proef", branchId: proefBranch, kenteken: proefKenteken });
            if (d?.proef && "besluit" in (d.proef as object)) setProef(d.proef as ToegangEvent);
          }}
        >
          <label className="text-xs text-neutralx-600">
            Vestiging
            <select value={proefBranch} onChange={(e) => setProefBranch(e.target.value)} className={VELD} required>
              {data.toegang.vestigingen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.naam}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutralx-600">
            Kenteken
            <input value={proefKenteken} onChange={(e) => setProefKenteken(e.target.value)} placeholder="AB-123-C" className={VELD} required />
          </label>
          <button type="submit" disabled={bezig || !proefBranch} className={KNOP_LICHT}>
            Proef
          </button>
        </form>
        {proef && (
          <p role="status" className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${proef.besluit.open ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>
            {toonKenteken(proef.kenteken)}: {BESLUIT_TEKST[proef.besluit.reden]}
            {proef.besluit.naam ? ` (${proef.besluit.naam})` : ""}
          </p>
        )}
      </Kaart>

      <Kaart
        title="Bekende kentekens"
        sub="Flexwerkers vullen hun eigen kenteken in via de app (Account → Mijn kenteken) en worden herkend zodra ze ingepland staan. Hier zet je eigen medewerkers, bezoekers en leveranciers."
      >
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await roep({
              action: "toegang-registratie",
              kenteken: nieuw.kenteken,
              soort: nieuw.soort,
              naam: nieuw.naam,
              ...(nieuw.branchId ? { branchId: nieuw.branchId } : {}),
              ...(nieuw.geldigVan ? { geldigVan: nieuw.geldigVan } : {}),
              ...(nieuw.geldigTot ? { geldigTot: nieuw.geldigTot } : {}),
              ...(nieuw.toelichting ? { toelichting: nieuw.toelichting } : {}),
            });
            if (d) setNieuw({ kenteken: "", soort: nieuw.soort, naam: "", branchId: nieuw.branchId, geldigVan: "", geldigTot: "", toelichting: "" });
          }}
        >
          <label className="text-xs text-neutralx-600">
            Kenteken
            <input value={nieuw.kenteken} onChange={(e) => setNieuw({ ...nieuw, kenteken: e.target.value })} placeholder="AB-123-C" className={VELD} required />
          </label>
          <label className="text-xs text-neutralx-600">
            Naam
            <input value={nieuw.naam} onChange={(e) => setNieuw({ ...nieuw, naam: e.target.value })} placeholder="Jan de Vries / Bakkerij Smit" className={VELD} required maxLength={80} />
          </label>
          <label className="text-xs text-neutralx-600">
            Soort
            <select value={nieuw.soort} onChange={(e) => setNieuw({ ...nieuw, soort: e.target.value as ToegangSoort })} className={VELD}>
              {mag && <option value="medewerker">{SOORT_LABEL.medewerker} (altijd open)</option>}
              <option value="bezoeker">{SOORT_LABEL.bezoeker}</option>
              <option value="leverancier">{SOORT_LABEL.leverancier}</option>
            </select>
          </label>
          <label className="text-xs text-neutralx-600">
            Vestiging
            <select value={nieuw.branchId} onChange={(e) => setNieuw({ ...nieuw, branchId: e.target.value })} className={VELD}>
              {!data.scope.branchIds && <option value="">Alle vestigingen</option>}
              {data.toegang.vestigingen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.naam}
                </option>
              ))}
            </select>
          </label>
          {nieuw.soort !== "medewerker" && (
            <>
              <label className="text-xs text-neutralx-600">
                Geldig van
                <input type="datetime-local" value={nieuw.geldigVan} onChange={(e) => setNieuw({ ...nieuw, geldigVan: e.target.value })} className={VELD} />
              </label>
              <label className="text-xs text-neutralx-600">
                Geldig tot
                <input type="datetime-local" value={nieuw.geldigTot} onChange={(e) => setNieuw({ ...nieuw, geldigTot: e.target.value })} className={VELD} />
              </label>
            </>
          )}
          <label className="text-xs text-neutralx-600 sm:col-span-2">
            Toelichting
            <input value={nieuw.toelichting} onChange={(e) => setNieuw({ ...nieuw, toelichting: e.target.value })} placeholder="bijv. levering vrijdag, melden bij magazijn" className={VELD} maxLength={300} />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={bezig} className={KNOP}>
              Kenteken toevoegen
            </button>
          </div>
        </form>
        {data.toegang.registraties.length > 0 && (
          <ul className="mt-4 divide-y divide-hair">
            {data.toegang.registraties.map((r) => (
              <li key={r.kenteken} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <code className="rounded bg-paper-soft px-2 py-0.5 font-semibold text-ink">{toonKenteken(r.kenteken)}</code>
                <span className="text-ink">{r.naam}</span>
                <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-600">{SOORT_LABEL[r.soort]}</span>
                <span className="text-xs text-neutralx-500">{vestigingNaam(r.branchId)}</span>
                {(r.geldigVan || r.geldigTot) && (
                  <span className="text-xs text-neutralx-500">
                    {r.geldigVan ? tijd(r.geldigVan) : "…"} – {r.geldigTot ? tijd(r.geldigTot) : "…"}
                  </span>
                )}
                {r.toelichting && <span className="text-xs text-neutralx-400">{r.toelichting}</span>}
                {mag && (
                  <button type="button" disabled={bezig} onClick={() => void roep({ action: "toegang-registratie-weg", kenteken: r.kenteken })} className="ml-auto text-xs text-neutralx-400 hover:text-crit">
                    Verwijderen
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kaart>

      <Kaart title="Logboek" sub="Elke aankomst bij de slagboom met het besluit; de laatste 150.">
        {data.toegang.log.length === 0 ? (
          <p className="text-sm text-neutralx-500">Nog geen aankomsten.</p>
        ) : (
          <ul className="divide-y divide-hair text-sm">
            {data.toegang.log.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-24 flex-shrink-0 text-xs text-neutralx-500">{tijd(e.at)}</span>
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${e.besluit.open ? "bg-ok" : "bg-crit"}`} aria-label={e.besluit.open ? "open" : "niet open"} />
                {e.kenteken && <code className="rounded bg-paper-soft px-2 py-0.5 text-xs font-semibold text-ink">{toonKenteken(e.kenteken)}</code>}
                <span className="text-ink">{e.besluit.naam ?? "Onbekend"}</span>
                <span className="text-xs text-neutralx-500">{BESLUIT_TEKST[e.besluit.reden]}</span>
                <span className="ml-auto text-xs text-neutralx-400">
                  {vestigingNaam(e.branchId)}
                  {e.bron === "proef" ? " · proef" : e.bron === "handmatig" ? " · handmatig" : e.camera ? ` · ${e.camera}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Kaart>
    </>
  );
}

/* ═══════════════════════════ Kluis ═══════════════════════════ */

const LEEG_ITEM = { id: "", titel: "", soort: "wifi" as KluisSoort, branchId: "", gebruikersnaam: "", geheim: "", notitie: "", minutenVooraf: STANDAARD_MINUTEN_VOORAF, vervangNaDienst: false };

function KluisTab({
  data,
  mag,
  bezig,
  roep,
  geheimen,
  setGeheimen,
  vestigingNaam,
}: {
  data: OpLocatieData;
  mag: boolean;
  bezig: boolean;
  roep: (b: Record<string, unknown>) => Promise<Antwoord | null>;
  geheimen: Record<string, string>;
  setGeheimen: (g: Record<string, string>) => void;
  vestigingNaam: (id: string | undefined) => string;
}) {
  const [vorm, setVorm] = useState(LEEG_ITEM);
  const [open, setOpen] = useState(false);
  const aan = Boolean(data.stand.modules.kluis?.aan);

  const bewerk = (i: KluisItemMeta) => {
    setVorm({ id: i.id, titel: i.titel, soort: i.soort, branchId: i.branchId ?? "", gebruikersnaam: i.gebruikersnaam ?? "", geheim: "", notitie: i.notitie ?? "", minutenVooraf: i.minutenVooraf, vervangNaDienst: i.vervangNaDienst });
    setOpen(true);
  };

  return (
    <>
      {!aan && <p className="rounded-xl bg-warn/10 px-4 py-2.5 text-sm text-warn-ink">De sleutelkluis staat uit: werkers zien nu niets. Zet de module aan op het tabblad Overzicht. Je kunt hier al wel items klaarzetten.</p>}

      <Kaart
        title="Codes en inloggegevens"
        sub="Een flexwerker ziet een item vanaf het ingestelde aantal minuten vóór zijn dienst op die vestiging tot het einde ervan. Je eigen team ziet alles. Elke keer bekijken staat in het logboek."
        actions={
          mag ? (
            <button
              type="button"
              onClick={() => {
                setVorm(LEEG_ITEM);
                setOpen(true);
              }}
              className={KNOP}
            >
              + Nieuw item
            </button>
          ) : undefined
        }
      >
        {open && mag && (
          <form
            className="mb-4 grid gap-3 rounded-xl border border-hair bg-paper-soft p-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = await roep({
                action: "kluis-zet",
                ...(vorm.id ? { id: vorm.id } : {}),
                titel: vorm.titel,
                soort: vorm.soort,
                ...(vorm.branchId ? { branchId: vorm.branchId } : {}),
                ...(vorm.gebruikersnaam ? { gebruikersnaam: vorm.gebruikersnaam } : {}),
                ...(vorm.geheim ? { geheim: vorm.geheim } : {}),
                ...(vorm.notitie ? { notitie: vorm.notitie } : {}),
                minutenVooraf: vorm.minutenVooraf,
                vervangNaDienst: vorm.vervangNaDienst,
              });
              if (d) {
                setOpen(false);
                setVorm(LEEG_ITEM);
              }
            }}
          >
            <label className="text-xs text-neutralx-600">
              Titel
              <input value={vorm.titel} onChange={(e) => setVorm({ ...vorm, titel: e.target.value })} placeholder="Wifi personeel" className={VELD} required maxLength={80} />
            </label>
            <label className="text-xs text-neutralx-600">
              Soort
              <select value={vorm.soort} onChange={(e) => setVorm({ ...vorm, soort: e.target.value as KluisSoort })} className={VELD}>
                {(Object.keys(KLUIS_SOORT_LABEL) as KluisSoort[]).map((k) => (
                  <option key={k} value={k}>
                    {KLUIS_SOORT_ICOON[k]} {KLUIS_SOORT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutralx-600">
              Vestiging
              <select value={vorm.branchId} onChange={(e) => setVorm({ ...vorm, branchId: e.target.value })} className={VELD}>
                <option value="">Hele bedrijf</option>
                {data.vestigingen.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.naam}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-neutralx-600">
              Gebruikersnaam (niet geheim)
              <input value={vorm.gebruikersnaam} onChange={(e) => setVorm({ ...vorm, gebruikersnaam: e.target.value })} placeholder="bijv. kassa1" className={VELD} maxLength={120} />
            </label>
            <label className="text-xs text-neutralx-600 sm:col-span-2">
              {vorm.id ? "Nieuw geheim (leeg laten = ongewijzigd)" : "Het geheim (code, wachtwoord of inlog)"}
              <input type="password" autoComplete="new-password" value={vorm.geheim} onChange={(e) => setVorm({ ...vorm, geheim: e.target.value })} className={VELD} required={!vorm.id} maxLength={2000} />
            </label>
            <label className="text-xs text-neutralx-600 sm:col-span-2">
              Notitie voor de werker (niet geheim)
              <input value={vorm.notitie} onChange={(e) => setVorm({ ...vorm, notitie: e.target.value })} placeholder="bijv. het kastje hangt links van de achterdeur" className={VELD} maxLength={500} />
            </label>
            <label className="text-xs text-neutralx-600">
              Zichtbaar vanaf (minuten vóór de dienst)
              <input type="number" min={0} max={1440} value={vorm.minutenVooraf} onChange={(e) => setVorm({ ...vorm, minutenVooraf: Number(e.target.value) })} className={VELD} />
            </label>
            <label className="flex items-center gap-2 pt-5 text-sm text-ink">
              <input type="checkbox" checked={vorm.vervangNaDienst} onChange={(e) => setVorm({ ...vorm, vervangNaDienst: e.target.checked })} />
              Seintje om te vervangen na elke dienst
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={bezig} className={KNOP}>
                {vorm.id ? "Opslaan" : "Toevoegen"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className={KNOP_LICHT}>
                Annuleren
              </button>
            </div>
          </form>
        )}
        {data.kluis.items.length === 0 ? (
          <p className="text-sm text-neutralx-500">Nog geen items. Begin met het wifi-wachtwoord of de alarmcode.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {data.kluis.items.map((i) => (
              <li key={i.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    {KLUIS_SOORT_ICOON[i.soort]}
                  </span>
                  <p className="font-semibold text-ink">{i.titel}</p>
                  <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-600">{KLUIS_SOORT_LABEL[i.soort]}</span>
                  <span className="text-xs text-neutralx-500">{vestigingNaam(i.branchId)}</span>
                  <span className="text-xs text-neutralx-400">zichtbaar {i.minutenVooraf} min vooraf</span>
                  {i.vervangenAanbevolenSinds && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn-ink">Vervangen aangeraden (dienst afgelopen {tijd(i.vervangenAanbevolenSinds)})</span>}
                  <div className="ml-auto flex items-center gap-2">
                    {geheimen[i.id] !== undefined ? (
                      <>
                        <code className="rounded bg-paper-soft px-2 py-1 text-sm text-ink">{geheimen[i.id]}</code>
                        <button type="button" onClick={() => void navigator.clipboard?.writeText(geheimen[i.id] ?? "")} className="text-xs text-brand-600 hover:underline">
                          Kopiëren
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const kopie = { ...geheimen };
                            delete kopie[i.id];
                            setGeheimen(kopie);
                          }}
                          className="text-xs text-neutralx-500 hover:underline"
                        >
                          Verberg
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={bezig}
                        onClick={async () => {
                          const d = await roep({ action: "kluis-onthul", id: i.id });
                          if (d?.geheim !== undefined) setGeheimen({ ...geheimen, [i.id]: d.geheim });
                        }}
                        className={KNOP_LICHT}
                      >
                        Toon
                      </button>
                    )}
                    {mag && (
                      <>
                        <button type="button" onClick={() => bewerk(i)} className="text-xs text-brand-600 hover:underline">
                          Bewerken
                        </button>
                        <button
                          type="button"
                          disabled={bezig}
                          onClick={() => {
                            if (window.confirm(`"${i.titel}" verwijderen?`)) void roep({ action: "kluis-weg", id: i.id });
                          }}
                          className="text-xs text-neutralx-400 hover:text-crit"
                        >
                          Verwijderen
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {(i.gebruikersnaam || i.notitie) && (
                  <p className="mt-1 text-xs text-neutralx-500">
                    {i.gebruikersnaam ? `Gebruikersnaam: ${i.gebruikersnaam}` : ""}
                    {i.gebruikersnaam && i.notitie ? " · " : ""}
                    {i.notitie}
                  </p>
                )}
                <p className="mt-0.5 text-[11px] text-neutralx-400">
                  Gewijzigd {tijd(i.gewijzigd)} door {i.gewijzigdDoor}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Kaart>

      {mag && (
        <Kaart title="Logboek" sub="Wie bekeek welk geheim; de laatste 150.">
          {data.kluis.log.length === 0 ? (
            <p className="text-sm text-neutralx-500">Nog niets bekeken.</p>
          ) : (
            <ul className="divide-y divide-hair text-sm">
              {data.kluis.log.map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="w-24 flex-shrink-0 text-xs text-neutralx-500">{tijd(r.at)}</span>
                  <span className="text-ink">{r.naam}</span>
                  <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-600">{r.rol === "team" ? "team" : "flexwerker"}</span>
                  <span className="text-neutralx-600">bekeek &quot;{r.titel}&quot;</span>
                  {r.shiftId && (
                    <Link href={`/werkgever/diensten/${r.shiftId}`} className="ml-auto text-xs text-brand-600 hover:underline">
                      klus ›
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Kaart>
      )}
    </>
  );
}

/* ═══════════════════════════ Printen ═══════════════════════════ */

function PrintTab({
  data,
  mag,
  bezig,
  roep,
  token,
  setToken,
  vestigingNaam,
}: {
  data: OpLocatieData;
  mag: boolean;
  bezig: boolean;
  roep: (b: Record<string, unknown>) => Promise<Antwoord | null>;
  token: { voor: string; waarde: string } | null;
  setToken: (t: { voor: string; waarde: string } | null) => void;
  vestigingNaam: (id: string | undefined) => string;
}) {
  const inst = data.printen.instellingen;
  const [nieuw, setNieuw] = useState<{ soort: LabelSoort; kop: string; regels: string; voet: string; qr: string; branchId: string }>({ soort: "badge", kop: "", regels: "", voet: inst.voet, qr: "", branchId: "" });
  const [agentNaam, setAgentNaam] = useState("Printer receptie");
  const [bt, setBt] = useState<string | null>(null);
  const aan = Boolean(data.stand.modules.printen?.aan);

  return (
    <>
      {!aan && <p className="rounded-xl bg-warn/10 px-4 py-2.5 text-sm text-warn-ink">Badges en labels staat uit: er komt niets in de wachtrij bij het inchecken en de printagent krijgt een lege lijst. Zet de module aan op het tabblad Overzicht.</p>}

      <Kaart title="Badge bij het inchecken" sub="Checkt een flexwerker in op locatie, dan komt er direct een label in de wachtrij: naam, klus, bedrijf, tijd en een controlecode.">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <Schakelaar aan={inst.badgeBijInchecken} disabled={!mag || bezig} label="Badge bij inchecken" onChange={(v) => void roep({ action: "print-instellingen", badgeBijInchecken: v })} />
            Automatisch bij inchecken
          </label>
          <label className="text-xs text-neutralx-600">
            Sjabloon
            <select value={inst.badgeSoort} disabled={!mag} onChange={(e) => void roep({ action: "print-instellingen", badgeSoort: e.target.value })} className={VELD}>
              {LABEL_SOORTEN.map((s) => (
                <option key={s} value={s}>
                  {LABEL_FORMAAT[s].naam}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutralx-600">
            Onderaan elke badge
            <input defaultValue={inst.voet} disabled={!mag} maxLength={60} placeholder="bijv. Melden bij de receptie" onBlur={(e) => e.target.value !== inst.voet && void roep({ action: "print-instellingen", voet: e.target.value })} className={VELD} />
          </label>
        </div>
        {mag && data.vestigingen.length > 1 && (
          <fieldset className="mt-3">
            <legend className="text-xs text-neutralx-600">Alleen op deze vestigingen (niets aangevinkt = overal)</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {data.vestigingen.map((v) => {
                const checked = inst.branchIds.includes(v.id);
                return (
                  <label key={v.id} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 ${checked ? "bg-brand-50 text-brand-700 ring-brand-300" : "bg-white text-neutralx-600 ring-hair"}`}>
                    <input type="checkbox" checked={checked} disabled={bezig} onChange={(e) => void roep({ action: "print-instellingen", branchIds: e.target.checked ? [...inst.branchIds, v.id] : inst.branchIds.filter((x) => x !== v.id) })} />
                    {v.naam}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </Kaart>

      <Kaart title="Printagent op een computer op locatie" sub="Een klein programma (deploy/printen) haalt de wachtrij op en print via het printsysteem van de computer (CUPS op Linux en Mac, de gewone printer op Windows). Zonder agent print je vanuit de browser.">
        <div className="flex flex-wrap items-center gap-2">
          {data.printen.agent ? (
            <>
              <span className="font-semibold text-ink">{data.printen.agent.naam}</span>
              <Status status={data.printen.agent.status} />
              {data.printen.agent.laatstGezien && <span className="text-xs text-neutralx-400">gezien {tijd(data.printen.agent.laatstGezien)}{data.printen.agent.printer ? ` · ${data.printen.agent.printer}` : ""}</span>}
            </>
          ) : (
            <span className="text-sm text-neutralx-500">Nog geen printagent gekoppeld.</span>
          )}
          {mag && (
            <form
              className="ml-auto flex flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (data.printen.agent && !window.confirm("Nieuw token maken? De huidige agent werkt dan niet meer tot je het nieuwe token invult.")) return;
                const d = await roep({ action: "print-agent-token", naam: agentNaam });
                if (d?.token) setToken({ voor: "agent", waarde: d.token });
              }}
            >
              <input value={agentNaam} onChange={(e) => setAgentNaam(e.target.value)} maxLength={60} className="rounded-lg border border-hairstrong px-3 py-2 text-sm" aria-label="Naam van de printagent" />
              <button type="submit" disabled={bezig} className={KNOP_LICHT}>
                {data.printen.agent ? "Nieuw token" : "Token voor de agent"}
              </button>
              {data.printen.agent && (
                <button type="button" disabled={bezig} onClick={() => void roep({ action: "print-agent-weg" })} className="text-xs text-neutralx-400 hover:text-crit">
                  Loskoppelen
                </button>
              )}
            </form>
          )}
        </div>
        {token?.voor === "agent" && <TokenKader token={token.waarde} onSluit={() => setToken(null)} uitleg="Zet dit token in de printagent als PRINT_TOKEN (deploy/printen/README.md). De agent meldt zich daarna hier als 'online'." />}
      </Kaart>

      <Kaart title="Los label printen" sub="Een badge, naamsticker, verzendlabel of incheckbon met de hand. Komt in de wachtrij; print via de afdrukpagina, Bluetooth of de agent.">
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await roep({
              action: "print-nieuw",
              soort: nieuw.soort,
              kop: nieuw.kop,
              regels: nieuw.regels.split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 8),
              ...(nieuw.voet ? { voet: nieuw.voet } : {}),
              ...(nieuw.qr ? { qr: nieuw.qr } : {}),
              ...(nieuw.branchId ? { branchId: nieuw.branchId } : {}),
            });
            if (d) setNieuw({ ...nieuw, kop: "", regels: "", qr: "" });
          }}
        >
          <label className="text-xs text-neutralx-600">
            Soort
            <select value={nieuw.soort} onChange={(e) => setNieuw({ ...nieuw, soort: e.target.value as LabelSoort })} className={VELD}>
              {LABEL_SOORTEN.map((s) => (
                <option key={s} value={s}>
                  {LABEL_FORMAAT[s].naam} ({LABEL_FORMAAT[s].breedte}{LABEL_FORMAAT[s].hoogte ? ` × ${LABEL_FORMAAT[s].hoogte}` : ""} mm)
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutralx-600">
            Grote regel (naam of ontvanger)
            <input value={nieuw.kop} onChange={(e) => setNieuw({ ...nieuw, kop: e.target.value })} className={VELD} required maxLength={60} />
          </label>
          <label className="text-xs text-neutralx-600">
            Vestiging
            <select value={nieuw.branchId} onChange={(e) => setNieuw({ ...nieuw, branchId: e.target.value })} className={VELD}>
              <option value="">—</option>
              {data.vestigingen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.naam}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutralx-600 sm:col-span-2">
            Regels daaronder (één per regel)
            <textarea value={nieuw.regels} onChange={(e) => setNieuw({ ...nieuw, regels: e.target.value })} rows={3} className={VELD} placeholder={"Bezoeker\nMagazijn 2"} />
          </label>
          <label className="text-xs text-neutralx-600">
            QR-code (tekst of link)
            <input value={nieuw.qr} onChange={(e) => setNieuw({ ...nieuw, qr: e.target.value })} className={VELD} maxLength={300} />
          </label>
          <label className="text-xs text-neutralx-600">
            Voet
            <input value={nieuw.voet} onChange={(e) => setNieuw({ ...nieuw, voet: e.target.value })} className={VELD} maxLength={60} />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={bezig} className={KNOP}>
              In de wachtrij
            </button>
          </div>
        </form>
      </Kaart>

      <Kaart title="Wachtrij en logboek" sub={`${data.printen.wachtrij.filter((o) => o.status === "wacht").length} wacht · de laatste 100 opdrachten`}>
        {data.printen.wachtrij.length === 0 ? (
          <p className="text-sm text-neutralx-500">Nog geen printopdrachten.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {data.printen.wachtrij.map((o) => (
              <li key={o.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-24 flex-shrink-0 text-xs text-neutralx-500">{tijd(o.aangemaakt)}</span>
                  <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-600">{LABEL_FORMAAT[o.inhoud.soort].naam}</span>
                  <span className="font-semibold text-ink">{o.inhoud.kop}</span>
                  <span className="text-xs text-neutralx-500">{o.inhoud.regels.join(" · ")}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.status === "geprint" ? "bg-ok/15 text-ok" : o.status === "wacht" ? "bg-warn/15 text-warn-ink" : o.status === "mislukt" ? "bg-crit/10 text-crit" : "bg-paper-soft text-neutralx-500"}`}>
                    {PRINT_STATUS_LABEL[o.status]}
                    {o.printer ? ` · ${o.printer}` : ""}
                  </span>
                  <span className="text-xs text-neutralx-400">
                    {o.bron === "inchecken" ? "bij inchecken" : o.doorNaam}
                    {o.branchId ? ` · ${vestigingNaam(o.branchId)}` : ""}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <a href={`/werkgever/op-locatie/print/${o.id}`} target="_blank" rel="noopener" className="text-xs font-semibold text-brand-600 hover:underline">
                      🖨 Afdrukpagina
                    </a>
                    <button type="button" onClick={() => setBt(bt === o.id ? null : o.id)} className="text-xs font-semibold text-brand-600 hover:underline">
                      📶 Bluetooth
                    </button>
                    {o.status === "wacht" && (
                      <>
                        <button type="button" disabled={bezig} onClick={() => void roep({ action: "print-status", id: o.id, status: "geprint" })} className="text-xs text-neutralx-500 hover:underline">
                          Markeer geprint
                        </button>
                        <button type="button" disabled={bezig} onClick={() => void roep({ action: "print-status", id: o.id, status: "ingetrokken" })} className="text-xs text-neutralx-400 hover:text-crit">
                          Intrekken
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {o.fout && <p role="alert" className="mt-1 text-xs text-crit">{o.fout}</p>}
                {bt === o.id && <BluetoothPrint inhoud={o.inhoud} className="mt-2" onKlaar={(printer) => void roep({ action: "print-status", id: o.id, status: "geprint" }).then(() => void printer)} />}
              </li>
            ))}
          </ul>
        )}
      </Kaart>
    </>
  );
}
