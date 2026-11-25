"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { respondToOfferAction, zetReserveAction, type OfferResponse } from "@/app/werkgever/diensten/[shiftId]/actions";
import { CandidateCardButton } from "@/components/app/CandidateCardButton";
import { LaatsteChecksVenster } from "@/components/werkgever/LaatsteChecksVenster";
import { Dialoog } from "@/components/werkgever/Dialoog";
import { Tooltip } from "@/components/werkgever/Tooltip";
import { RegioVenster } from "@/components/werkgever/RegioVenster";
import {
  Driehoek,
  Envelop,
  Hart,
  Info,
  Kalender,
  KalenderLeeg,
  KalenderVink,
  Klok,
  KruisRond,
  Pijl,
  Sorteer,
  Ster,
  Tekstballon,
  Trechter,
  Wekker,
  Wissel,
} from "@/components/werkgever/iconen";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useToast } from "@/components/ui/Toast";
import { fmt } from "@/lib/i18n/dictionaries";
import { BEDRIJF_NOG_NIET_GECONTROLEERD } from "@/lib/company/gecontroleerd";
import { berichtenAdres } from "@/lib/chat/berichten-adres";
import { filterReacties, filtersActief, KLUSSEN_KEUZES, LEGE_FILTERS, OPKOMST_KEUZES, STERREN_KEUZES, type ReactieFilters } from "@/lib/werkgever/reactie-filters";
import { kostenIndicatie, selectieStand, sorteerReacties, tegenbod, verlooptOver, volgendeSortering, type SorteerKolom, type SorteerRichting } from "@/lib/werkgever/reactie-tabel";

// ---------------------------------------------------------------------------
// De open reacties op een klus van het bedrijf (app/werkgever/diensten/[shiftId]) als tabel, in de opzet van YoungOnes
// (23 nov 2026): uitleg over tegenbieden, Filters en Reset, de chip "Jouw dienst", sorteerbare kolommen, per rij een vakje,
// foto (met een hartje bij een favoriet), naam (opent de profielkaart), de motivatie als tooltip, de link naar de actieve
// regio's, de beoordeling, de prestaties van 6 maanden, de uren bij dit bedrijf, de tijden, het tarief (een tegenbod valt op)
// en wanneer de reactie vervalt. Onder de tabel: hoeveel er gekozen zijn en de knoppen Accepteren, Toevoegen aan de
// reservebank en Weigeren voor de hele selectie.
// Onder 1280 px is elke reactie een kaart (label links, waarde rechts) en blijven de knoppen onderaan in beeld.
// De knoppen roepen per reactie de bestaande server-acties aan (respondToOfferAction, zetReserveAction): dezelfde controles
// als bij één reactie, ook de poort voor een bedrijf dat nog niet is gecontroleerd ("Nog een paar laatste checks").
// Filteren en sorteren gebeuren in de browser; de lijst komt van de server (lib/dashboard/employer-shift.ts) en wordt na
// elke actie opnieuw opgehaald. Alle cijfers komen uit lib/employer/prestaties-kern.ts: niets is verzonnen.
// ---------------------------------------------------------------------------

export interface ReactieRij {
  id: string;
  userId: string;
  /** voornaam en eerste letter van de achternaam (lib/werkgever/naam.ts) */
  naam: string;
  avatarUrl: string | null;
  proposedRateCents: number;
  listedRateCents: number;
  note: string;
  busyElsewhere: boolean;
  /** % compleet over 6 maanden; null = nieuw op ZekerFlex */
  attendancePct: number | null;
  /** % zelf aanwezig over 6 maanden; null = nieuw op ZekerFlex */
  zelfPct: number | null;
  shiftsCompleted: number;
  reviewAverage: number;
  reviewCount: number;
  favoriet: boolean;
  gematcht: number;
  nietVoltooid: number;
  vervanging: number;
  /** uren die de werker in 12 maanden zelf bij dit bedrijf werkte */
  urenBijBedrijf: number;
  /** plaatsen waar de werker in 12 maanden via ZekerFlex werkte */
  regios: { naam: string; lat: number; lng: number }[];
  kvk: boolean;
  zelfdeSector: boolean;
  zelfdeFunctie: boolean;
  /** die dag al bij dit bedrijf ingepland op een andere klus */
  gematchtDieDag: boolean;
  /** de regel boven Afwijzen / Accepteren in de profielkaart (reactieRegel op de pagina) */
  regel: string;
}

export interface DienstVoorTabel {
  /** "di 8 dec, 09:00 - 15:00", door de server in Nederlandse tijd gemaakt */
  chip: string;
  /** "09:00 - 15:00" */
  tijden: string;
  startsAt: string;
  /** betaalde uren van de klus (zonder pauze) */
  uren: number;
  /** platformkosten per gewerkt uur in centen (0 voor een kosteloos bedrijf) */
  feePerUurCents: number;
}

const RASTER =
  "xl:grid xl:grid-cols-[2.75rem_minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_7.5rem] xl:items-center xl:gap-x-4";
const CHIP = "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium";
const CHIP_AAN = "border-brand-500 bg-brand-50 text-brand-700";
const CHIP_UIT = "border-hairstrong bg-white text-ink hover:bg-paper-soft";
const ICOON_KNOP = "grid h-11 w-11 place-items-center rounded-lg xl:h-9 xl:w-9";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/** Eén regel van een kaart onder 1280 px (label links, waarde rechts); vanaf 1280 px gewoon de cel van de tabel. */
function Cel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 xl:block xl:py-0">
      <span className="text-xs font-semibold text-neutralx-500 xl:hidden">{label}</span>
      <div className="min-w-0 text-right text-sm text-ink xl:text-left">{children}</div>
    </div>
  );
}

export function ReactieLijst({
  shiftId,
  shiftTitle,
  reacties,
  bankBewerkbaar,
  plekkenVrij,
  dienst,
  klusPlek,
  nu,
  gekozen = [],
}: {
  shiftId: string;
  shiftTitle: string;
  reacties: ReactieRij[];
  /** het bedrijf zelf mag reacties op de reservebank zetten */
  bankBewerkbaar: boolean;
  /** hoeveel plekken er nog open zijn: meer kun je er niet tegelijk accepteren */
  plekkenVrij: number;
  dienst: DienstVoorTabel;
  /** de plek van de klus, voor de speld in "Actieve regio's" */
  klusPlek: { lat: number; lng: number } | null;
  /** het moment waarop de server de pagina maakte (ms): de aftelling rekent daarmee, zodat server en browser hetzelfde tonen */
  nu: number;
  /** de reacties die het bedrijf koos terwijl het nog niet was gecontroleerd (bewaard, lib/company/gecontroleerd.ts): een label erbij */
  gekozen?: readonly string[];
}) {
  const { locale, t } = useI18n();
  const d = t.shiftDetail;
  const k = t.klusPagina;
  const nl = locale === "nl";
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const id = useId();
  const euro = (c: number) => `€ ${nl ? (c / 100).toFixed(2).replace(".", ",") : (c / 100).toFixed(2)}`;
  const getal = (n: number, decimalen = 1) => (nl ? n.toFixed(decimalen).replace(".", ",") : n.toFixed(decimalen));

  const [weergave, setWeergave] = useState<"lijst" | "kaart">("lijst");
  useEffect(() => {
    try {
      const opgeslagen = localStorage.getItem("zf-reactie-weergave");
      if (opgeslagen === "kaart" || opgeslagen === "lijst") setWeergave(opgeslagen);
    } catch {}
  }, []);
  const wisselWeergave = (w: "lijst" | "kaart") => {
    setWeergave(w);
    try { localStorage.setItem("zf-reactie-weergave", w); } catch {}
  };

  const [f, setF] = useState<ReactieFilters>(LEGE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortering, setSortering] = useState<{ kolom: SorteerKolom; richting: SorteerRichting } | null>(null);
  const [selectie, setSelectie] = useState<ReadonlySet<string>>(new Set());
  const [venster, setVenster] = useState<null | "accept" | "weiger" | "reserve-uitleg">(null);
  const [reserves, setReserves] = useState<string[]>([]);
  const [bezig, setBezig] = useState<null | "accepted" | "declined" | "reserve">(null);
  const [fouten, setFouten] = useState<string[]>([]);
  // "Nog een paar laatste checks": de reacties die het bedrijf wilde accepteren toen de poort dichtging
  const [checks, setChecks] = useState<string[] | null>(null);
  const [regioVoor, setRegioVoor] = useState<string | null>(null);

  const actief = filtersActief(f);
  const zet = (p: Partial<ReactieFilters>) => setF((v) => ({ ...v, ...p }));
  const { zichtbaar: gefilterd, verborgen } = filterReacties(reacties, f);
  const rijen: ReactieRij[] = sortering
    ? sorteerReacties(
        gefilterd.map((r) => ({ ...r, compleetPct: r.attendancePct })),
        sortering.kolom,
        sortering.richting,
      )
    : gefilterd;
  // alleen wat in beeld staat kan gekozen zijn: een rij die door een filter verdwijnt, doet niet meer mee
  const gekozenRijen = rijen.filter((r) => selectie.has(r.id));
  const stand = selectieStand(gekozenRijen.length, plekkenVrij, bankBewerkbaar);
  const allesGekozen = rijen.length > 0 && gekozenRijen.length === rijen.length;
  const hogerInSelectie = gekozenRijen.some((r) => tegenbod(r.proposedRateCents, r.listedRateCents) === "hoger");
  // de laatste plek(ken) worden gevuld en er blijven reacties over: vraag wie op de reservebank mag (hoogstens 3)
  const overige = reacties.filter((r) => !gekozenRijen.some((g) => g.id === r.id));
  const vraagReserves = bankBewerkbaar && gekozenRijen.length === plekkenVrij && overige.length > 0;
  const laatstePlek = plekkenVrij === 1 && reacties.length > 1;
  const naamVan = (offerId: string) => reacties.find((r) => r.id === offerId)?.naam ?? "";
  const regioRij = regioVoor ? reacties.find((r) => r.id === regioVoor) : undefined;

  const wissel = (offerId: string) =>
    setSelectie((v) => {
      const n = new Set(v);
      if (n.has(offerId)) n.delete(offerId);
      else n.add(offerId);
      return n;
    });

  const voerUit = async (soort: "accepted" | "declined" | "reserve", ids: string[], metReserves: string[] = []) => {
    if (bezig || ids.length === 0) return;
    setBezig(soort);
    setFouten([]);
    const mis: OfferResponse = { ok: false, message: k.mislukt };
    const mislukt: { id: string; tekst: string }[] = [];
    let gelukt = 0;
    let poort = false;
    // een reserve die niet lukt houdt het accepteren niet tegen; de pagina toont daarna de echte stand
    for (const offerId of metReserves) await zetReserveAction(offerId, true).catch(() => undefined);
    for (const offerId of ids) {
      const r: OfferResponse = soort === "reserve" ? await zetReserveAction(offerId, true).catch(() => mis) : await respondToOfferAction(offerId, soort).catch(() => mis);
      if (r.ok) gelukt += 1;
      else if (r.code === BEDRIJF_NOG_NIET_GECONTROLEERD) {
        // het bedrijf is nog niet gecontroleerd: niets wordt ingepland, het venster vraagt de bedrijfsgegevens en bewaart de keuze
        poort = true;
        break;
      } else mislukt.push({ id: offerId, tekst: `${naamVan(offerId)}: ${r.message}` });
    }
    setBezig(null);
    setVenster(null);
    setReserves([]);
    if (poort) {
      setChecks(ids);
      return;
    }
    if (gelukt > 0) {
      const tekst = fmt(soort === "accepted" ? k.klaarAccept : soort === "reserve" ? k.klaarReserve : k.klaarWeiger, { n: gelukt });
      if (soort === "declined") toast.info(tekst);
      else toast.success(tekst);
    }
    setFouten(mislukt.map((m) => m.tekst));
    setSelectie(new Set(mislukt.map((m) => m.id)));
    router.refresh();
  };

  const kopKnop = (kolom: SorteerKolom, label: string) => (
    <button
      type="button"
      onClick={() => setSortering((s) => volgendeSortering(s, kolom))}
      aria-label={fmt(k.sorteerOp, { kolom: label })}
      aria-pressed={sortering?.kolom === kolom}
      className="inline-flex min-h-9 items-center gap-1.5 text-left text-xs font-semibold text-neutralx-500 hover:text-ink"
    >
      {label}
      <Sorteer richting={sortering?.kolom === kolom ? sortering.richting : undefined} />
    </button>
  );
  const toggleChip = (aan: boolean, label: string, onKlik: () => void) => (
    <button type="button" aria-pressed={aan} onClick={onKlik} className={`${CHIP} ${aan ? CHIP_AAN : CHIP_UIT}`}>
      {label}
    </button>
  );
  const keuzeChip = (label: string, waarde: number, keuzes: readonly number[], toon: (n: number) => string, onKies: (n: number) => void) => (
    <label className={`${CHIP} ${waarde > 0 ? CHIP_AAN : CHIP_UIT}`}>
      <span>{label}:</span>
      <select value={waarde} onChange={(e) => onKies(Number(e.target.value))} className="rounded-md border border-hair bg-white px-1.5 py-1 text-xs font-semibold text-ink">
        {keuzes.map((n) => (
          <option key={n} value={n}>
            {n === 0 ? k.alle : toon(n)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-4">
        <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen} className="btn-ghost min-h-11 gap-2 rounded-lg text-sm">
          <Trechter maat={18} />
          {k.filters}
          {actief ? ` (${actief})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setF(LEGE_FILTERS)}
          disabled={actief === 0}
          className="min-h-11 px-2 text-sm font-medium text-brand-600 hover:underline disabled:text-neutralx-400 disabled:no-underline"
        >
          {k.reset}
        </button>
        {verborgen > 0 && <span className="text-xs text-neutralx-500">{verborgen === 1 ? d.filterVerborgenEen : fmt(d.filterVerborgen, { n: verborgen })}</span>}
        <span className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-hair bg-paper-soft px-3 text-sm text-ink ml-auto">
          <Klok maat={16} />
          <span>
            <span className="font-semibold">{k.jouwDienst}</span> {dienst.chip}
          </span>
        </span>
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap gap-2 border-t border-hair bg-paper-soft px-5 py-4">
          {toggleChip(f.favoriet, k.filterFavoriet, () => zet({ favoriet: !f.favoriet }))}
          {keuzeChip(k.filterOpkomst, f.minOpkomst, OPKOMST_KEUZES, (n) => `${n}%`, (n) => zet({ minOpkomst: n }))}
          {keuzeChip(k.filterZelf, f.minZelf, OPKOMST_KEUZES, (n) => `${n}%`, (n) => zet({ minZelf: n }))}
          {keuzeChip(k.filterSterren, f.minSterren, STERREN_KEUZES, (n) => getal(n, Number.isInteger(n) ? 0 : 1), (n) => zet({ minSterren: n }))}
          {keuzeChip(k.filterKlussen, f.minKlussen, KLUSSEN_KEUZES, (n) => String(n), (n) => zet({ minKlussen: n }))}
          {toggleChip(f.zelfdeSector, k.filterSector, () => zet({ zelfdeSector: !f.zelfdeSector }))}
          {toggleChip(f.zelfdeFunctie, k.filterFunctie, () => zet({ zelfdeFunctie: !f.zelfdeFunctie }))}
          {toggleChip(f.kvk, k.filterKvk, () => zet({ kvk: !f.kvk }))}
          {toggleChip(f.geenTegenbod, k.filterTegenbod, () => zet({ geenTegenbod: !f.geenTegenbod }))}
        </div>
      )}

      {/* de kopregel: vanaf 1280 px de kolommen met sorteerknoppen, daaronder "alles selecteren" met een keuzelijst om te sorteren */}
      <div className={`flex items-center gap-3 border-y border-hair px-5 py-2 ${RASTER}`}>
        <label className="inline-flex min-h-11 items-center gap-3 text-xs font-semibold text-neutralx-500">
          <input
            type="checkbox"
            checked={allesGekozen}
            onChange={() => setSelectie(allesGekozen ? new Set() : new Set(rijen.map((r) => r.id)))}
            disabled={rijen.length === 0}
            className="h-5 w-5 accent-brand-600"
          />
          <span className="xl:sr-only">{k.kolAlles}</span>
        </label>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-neutralx-500 xl:hidden">
          <span>{k.sorteerLabel}</span>
          <select
            value={sortering?.kolom ?? ""}
            onChange={(e) => setSortering(e.target.value ? volgendeSortering(null, e.target.value as SorteerKolom) : null)}
            className="min-h-11 rounded-lg border border-hair bg-white px-2 text-sm font-medium text-ink"
          >
            <option value="">{k.sorteerStandaard}</option>
            <option value="naam">{k.kolFreelancer}</option>
            <option value="beoordeling">{k.kolBeoordeling}</option>
            <option value="opkomst">{k.kolOpkomst}</option>
            <option value="uren">{k.kolUren}</option>
            <option value="tarief">{k.kolTarief}</option>
          </select>
        </label>
        <div className="hidden xl:block">{kopKnop("naam", k.kolFreelancer)}</div>
        <div className="hidden xl:block">{kopKnop("beoordeling", k.kolBeoordeling)}</div>
        <div className="hidden xl:block">{kopKnop("opkomst", k.kolOpkomst)}</div>
        <div className="relative hidden items-center gap-1 xl:flex">
          {kopKnop("uren", k.kolUren)}
          <Tooltip inhoud={k.urenTip} label={k.urenTipLabel} kant="midden" className="grid h-7 w-7 place-items-center rounded-full text-brand-600 hover:bg-paper-soft">
            <Info />
          </Tooltip>
        </div>
        <div className="hidden text-xs font-semibold text-neutralx-500 xl:block">{k.kolBeschikbaar}</div>
        <div className="hidden xl:block">{kopKnop("tarief", k.kolTarief)}</div>
        <div className="hidden xl:block" />
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-hair bg-white xl:hidden" role="group" aria-label="Weergave kiezen">
          <button
            type="button"
            onClick={() => wisselWeergave("lijst")}
            aria-pressed={weergave === "lijst"}
            className={`grid h-9 w-9 place-items-center transition-colors ${weergave === "lijst" ? "bg-brand-50 text-brand-700" : "text-neutralx-500 hover:bg-paper-soft"}`}
            title="Lijstweergave"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            <span className="sr-only">Lijstweergave</span>
          </button>
          <button
            type="button"
            onClick={() => wisselWeergave("kaart")}
            aria-pressed={weergave === "kaart"}
            className={`grid h-9 w-9 place-items-center border-l border-hair transition-colors ${weergave === "kaart" ? "bg-brand-50 text-brand-700" : "text-neutralx-500 hover:bg-paper-soft"}`}
            title="Kaartweergave"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="sr-only">Kaartweergave</span>
          </button>
        </div>
        <div className="hidden items-center gap-2 xl:flex" role="group" aria-label="Weergave kiezen">
          <button
            type="button"
            onClick={() => wisselWeergave("lijst")}
            aria-pressed={weergave === "lijst"}
            className={`grid h-9 w-9 place-items-center rounded-l-lg border border-hair transition-colors ${weergave === "lijst" ? "bg-brand-50 text-brand-700" : "bg-white text-neutralx-500 hover:bg-paper-soft"}`}
            title="Lijstweergave"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            <span className="sr-only">Lijstweergave</span>
          </button>
          <button
            type="button"
            onClick={() => wisselWeergave("kaart")}
            aria-pressed={weergave === "kaart"}
            className={`grid h-9 w-9 place-items-center rounded-r-lg border border-l-0 border-hair transition-colors ${weergave === "kaart" ? "bg-brand-50 text-brand-700" : "bg-white text-neutralx-500 hover:bg-paper-soft"}`}
            title="Kaartweergave"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="sr-only">Kaartweergave</span>
          </button>
        </div>
      </div>

      {rijen.length === 0 ? (
        <p className="px-5 py-8 text-sm text-neutralx-600">{k.filterNiets}</p>
      ) : weergave === "kaart" ? (
        <ul className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {rijen.map((o) => {
            const aan = selectie.has(o.id);
            const bod = tegenbod(o.proposedRateCents, o.listedRateCents);
            const beslissing = { offerId: o.id, regel: o.regel };
            return (
              <li key={o.id} className={`relative flex flex-col rounded-xl border p-4 transition-colors ${aan ? "border-brand-400 bg-brand-50/40" : "border-hair bg-white"}`}>
                <div className="mb-3 flex items-start gap-3">
                  <label className="flex-shrink-0">
                    <input type="checkbox" checked={aan} onChange={() => wissel(o.id)} className="h-5 w-5 accent-brand-600" />
                    <span className="sr-only">{fmt(k.selecteer, { naam: o.naam })}</span>
                  </label>
                  <CandidateCardButton userId={o.userId} shiftId={shiftId} name={o.naam} beslissing={beslissing}>
                    <span className="relative block h-14 w-14 flex-shrink-0">
                      {o.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white">{initials(o.naam)}</span>
                      )}
                      {o.favoriet && (
                        <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-hair bg-white text-money-ink">
                          <Hart maat={12} vol />
                        </span>
                      )}
                    </span>
                  </CandidateCardButton>
                  <div className="min-w-0 flex-1">
                    <CandidateCardButton userId={o.userId} shiftId={shiftId} name={o.naam} beslissing={beslissing}>
                      <span className="font-semibold text-ink group-hover:underline">{o.naam}</span>
                    </CandidateCardButton>
                    {o.regios.length > 0 && (
                      <button type="button" onClick={() => setRegioVoor(o.id)} className="mt-0.5 inline-flex items-center gap-1 text-left text-xs text-neutralx-500 hover:text-ink hover:underline">
                        {o.regios.length === 1 ? k.regioLinkEen : fmt(k.regioLink, { n: o.regios.length })}
                        <Pijl maat={10} />
                      </button>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutralx-500">
                      {o.reviewCount > 0 && (
                        <span className="text-money-bright font-medium">
                          <Ster /> <span className="text-ink">{getal(o.reviewAverage)} ({o.reviewCount})</span>
                        </span>
                      )}
                      {o.attendancePct !== null && (
                        <span>{k.kolOpkomst} <span className="font-semibold text-ink">{fmt(k.compleet, { n: o.attendancePct })}</span></span>
                      )}
                    </div>
                  </div>
                </div>
                {o.note && (
                  <p className="mb-3 rounded-lg bg-paper-soft px-3 py-2 text-xs italic text-neutralx-600">&ldquo;{o.note}&rdquo;</p>
                )}
                {bod && (
                  <p className={`mb-2 text-xs font-semibold ${bod === "hoger" ? "text-warn" : "text-ok"}`}>
                    {fmt(bod === "hoger" ? k.tegenbodHoger : k.tegenbodLager, { lijst: euro(o.listedRateCents) })} ({euro(o.proposedRateCents)}/u)
                  </p>
                )}
                <div className="mt-auto flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => { wissel(o.id); if (!selectie.has(o.id)) setVenster("accept"); }}
                    disabled={bezig !== null}
                    className="flex-1 rounded-lg bg-ok px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
                  >
                    {k.accepteren}
                  </button>
                  {bankBewerkbaar && (
                    <button
                      type="button"
                      onClick={() => void voerUit("reserve", [o.id])}
                      disabled={bezig !== null}
                      className="rounded-lg border border-brand-400 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-40"
                      title={k.naarReserve}
                    >
                      {k.naarReserve}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { wissel(o.id); if (!selectie.has(o.id)) setVenster("weiger"); }}
                    disabled={bezig !== null}
                    className="rounded-lg border border-crit/40 px-3 py-2 text-sm font-semibold text-crit hover:bg-crit/10 disabled:opacity-40"
                  >
                    {k.weigeren}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="divide-y divide-hair">
          {rijen.map((o) => {
            const beslissing = { offerId: o.id, regel: o.regel };
            // bij de laatste plek: de andere open reacties als mogelijke reserves (hoogstens 3 kiezen)
            const reserveKeuze = laatstePlek && bankBewerkbaar ? reacties.filter((x) => x.id !== o.id).map((x) => ({ offerId: x.id, naam: x.naam })) : [];
            const aan = selectie.has(o.id);
            const bod = tegenbod(o.proposedRateCents, o.listedRateCents);
            const bodTekst = bod ? fmt(bod === "hoger" ? k.tegenbodHoger : k.tegenbodLager, { lijst: euro(o.listedRateCents) }) : "";
            const verloop = verlooptOver(dienst.startsAt, nu);
            const verloopTekst = !verloop
              ? ""
              : verloop.dagen > 1
                ? fmt(k.verloopt, { d: verloop.dagen, u: verloop.uren })
                : verloop.dagen === 1
                  ? fmt(k.verlooptDag, { u: verloop.uren })
                  : verloop.uren >= 1
                    ? fmt(k.verlooptUren, { u: verloop.uren })
                    : k.verlooptKort;
            const dagTekst = o.busyElsewhere ? k.eldersBezet : o.gematchtDieDag ? k.alGematcht : k.nogNietGematcht;
            return (
              <li key={o.id} className={`relative px-5 py-4 transition-colors hover:bg-paper-soft ${aan ? "bg-brand-50/40" : ""} ${RASTER}`}>
                <div className="flex items-start gap-3 xl:contents">
                  <label className="grid h-11 w-11 flex-shrink-0 place-items-center xl:h-auto xl:w-auto xl:justify-items-start">
                    <input type="checkbox" checked={aan} onChange={() => wissel(o.id)} className="h-5 w-5 accent-brand-600" />
                    <span className="sr-only">{fmt(k.selecteer, { naam: o.naam })}</span>
                  </label>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <CandidateCardButton userId={o.userId} shiftId={shiftId} name={o.naam} beslissing={beslissing} reserveKeuze={reserveKeuze}>
                      <span className="relative block h-[50px] w-[50px] flex-shrink-0">
                        {o.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.avatarUrl} alt="" className="h-[50px] w-[50px] rounded-full object-cover" />
                        ) : (
                          <span className="grid h-[50px] w-[50px] place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white">{initials(o.naam)}</span>
                        )}
                        {o.favoriet && (
                          <span className="absolute -left-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-hair bg-white text-money-ink">
                            <Hart maat={12} vol />
                            <span className="sr-only">{k.favoriet}</span>
                          </span>
                        )}
                      </span>
                    </CandidateCardButton>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <CandidateCardButton userId={o.userId} shiftId={shiftId} name={o.naam} beslissing={beslissing} reserveKeuze={reserveKeuze}>
                          <span className="break-words text-sm font-medium text-ink group-hover:underline">{o.naam}</span>
                        </CandidateCardButton>
                        {o.note && (
                          <Tooltip
                            opRij
                            label={fmt(k.motivatieVan, { naam: o.naam })}
                            className="grid h-11 w-11 place-items-center xl:h-8 xl:w-8"
                            inhoud={
                              <>
                                <span className="block font-semibold">{k.motivatieKop}</span>
                                <span className="mt-1 block whitespace-pre-line break-words">{o.note}</span>
                              </>
                            }
                          >
                            <span className="grid h-7 w-7 place-items-center rounded-md bg-paper-soft text-brand-600">
                              <Tekstballon maat={16} />
                            </span>
                          </Tooltip>
                        )}
                        {gekozen.includes(o.id) && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{d.jouwKeuze}</span>}
                      </div>
                      {o.regios.length > 0 && (
                        <button type="button" onClick={() => setRegioVoor(o.id)} className="inline-flex min-h-11 items-center gap-1 text-left text-xs text-neutralx-500 hover:text-ink hover:underline xl:min-h-0">
                          {o.regios.length === 1 ? k.regioLinkEen : fmt(k.regioLink, { n: o.regios.length })}
                          <Pijl maat={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <Cel label={k.kolBeoordeling}>
                  {o.reviewCount > 0 ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5 xl:justify-start">
                      <span className="text-money-bright">
                        <Ster />
                      </span>
                      <span className="num font-medium">{getal(o.reviewAverage)}</span>
                      <span className="text-neutralx-500">· {o.reviewCount === 1 ? k.reviewsEen : fmt(k.reviewsN, { n: o.reviewCount })}</span>
                    </span>
                  ) : (
                    <span className="text-neutralx-500">{k.geenReviews}</span>
                  )}
                </Cel>

                <Cel label={k.kolOpkomst}>
                  <Tooltip
                    opRij
                    breed
                    className="text-right xl:text-left"
                    inhoud={
                      <>
                        <span className="block font-semibold">{k.prestatiesKop}</span>
                        <span className="mt-3 grid gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-hair">
                          {(
                            [
                              [<Kalender key="i" maat={24} />, o.gematcht, k.gematcht],
                              [<KruisRond key="i" maat={24} />, o.nietVoltooid, k.nietVoltooid],
                              [<Wissel key="i" maat={24} />, o.vervanging, k.vervanging],
                            ] as const
                          ).map(([icoon, n, label]) => (
                            <span key={label} className="flex items-center gap-3 sm:px-4 sm:first:pl-0">
                              <span className="text-neutralx-500">{icoon}</span>
                              <span>
                                <span className="num block font-display text-xl font-bold leading-none">{n}</span>
                                <span className="mt-1 block text-sm">{label}</span>
                              </span>
                            </span>
                          ))}
                        </span>
                        <span className="mt-3 block text-xs text-neutralx-500">{k.prestatiesUitleg}</span>
                      </>
                    }
                  >
                    {o.attendancePct !== null ? (
                      <>
                        <span className="num block font-semibold underline decoration-dotted underline-offset-4">{fmt(k.compleet, { n: o.attendancePct })}</span>
                        {o.zelfPct !== null && <span className="num hidden text-neutralx-500 xl:block">{fmt(k.zelfAanwezig, { n: o.zelfPct })}</span>}
                      </>
                    ) : (
                      <span className="block font-medium text-neutralx-600 underline decoration-dotted underline-offset-4">{k.nieuw}</span>
                    )}
                  </Tooltip>
                </Cel>

                <Cel label={k.kolUren}>
                  <span className="num">{getal(o.urenBijBedrijf, Number.isInteger(o.urenBijBedrijf) ? 0 : 1)}</span>
                </Cel>

                <Cel label={k.kolBeschikbaar}>
                  <span className="num">{dienst.tijden}</span>
                </Cel>

                <Cel label={k.kolTarief}>
                  {bod ? (
                    <Tooltip opRij kant="rechts" inhoud={bodTekst} className="num inline-flex items-center gap-1.5 rounded-md bg-paper-soft px-2 py-1.5 font-bold text-ink">
                      {euro(o.proposedRateCents)}
                      <span className={bod === "hoger" ? "text-warn" : "text-ok"}>
                        <Driehoek omlaag={bod === "lager"} />
                      </span>
                      <span className="sr-only">{bodTekst}</span>
                    </Tooltip>
                  ) : (
                    <span className="num font-semibold">{euro(o.proposedRateCents)}</span>
                  )}
                </Cel>

                <div className="mt-1 flex items-center gap-1 xl:mt-0 xl:justify-end">
                  <Tooltip
                    opRij
                    kant="rechts"
                    inhoud={dagTekst}
                    label={fmt(k.dagLabel, { naam: o.naam })}
                    className={`${ICOON_KNOP} ${o.busyElsewhere ? "text-warn" : o.gematchtDieDag ? "text-plan-ink" : "text-neutralx-400"}`}
                  >
                    {o.busyElsewhere ? <Kalender maat={22} /> : o.gematchtDieDag ? <KalenderVink maat={22} /> : <KalenderLeeg maat={22} />}
                  </Tooltip>
                  {verloopTekst && (
                    <Tooltip opRij kant="rechts" inhoud={verloopTekst} label={fmt(k.verlooptLabel, { naam: o.naam })} className={`${ICOON_KNOP} text-warn`}>
                      <Wekker maat={22} />
                    </Tooltip>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push(berichtenAdres(pathname, { met: o.userId, context: `shift:${shiftId}`, onderwerp: shiftTitle }))}
                    aria-label={fmt(k.bericht, { naam: o.naam })}
                    className={`${ICOON_KNOP} text-neutralx-600 hover:bg-white hover:text-ink`}
                  >
                    <Envelop maat={22} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* onder de tabel: hoeveel er gekozen zijn en de drie knoppen; onder 1280 px blijft deze balk onderaan in beeld */}
      <div className="sticky bottom-0 z-10 rounded-b-xl border-t border-hair bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 xl:static">
        <p aria-live="polite" className="text-sm text-ink">
          {gekozenRijen.length === 1 ? k.geselecteerdEen : fmt(k.geselecteerd, { n: gekozenRijen.length })}
        </p>
        {stand.teVeel > 0 && (
          <p role="alert" className="mt-1 text-sm font-semibold text-crit">
            {stand.teVeel === 1 ? k.teVeelEen : fmt(k.teVeel, { n: stand.teVeel })}
          </p>
        )}
        {hogerInSelectie && (
          <p role="status" className="mt-1 text-sm font-semibold text-ink">
            {k.hogerTarief}
          </p>
        )}
        {fouten.length > 0 && (
          <div role="alert" className="mt-2 rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
            <p className="font-semibold">{k.deelsMislukt}</p>
            <ul className="mt-1 list-disc pl-5">
              {fouten.map((tekst) => (
                <li key={tekst}>{tekst}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setVenster("accept")} disabled={!stand.magAccepteren || bezig !== null} className="btn-primary min-h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
            {k.accepteren}
          </button>
          {bankBewerkbaar && (
            <button
              type="button"
              onClick={() => void voerUit("reserve", gekozenRijen.map((r) => r.id))}
              disabled={!stand.magReserve || bezig !== null}
              className="btn min-h-11 flex-1 border border-brand-400 bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
            >
              {bezig === "reserve" ? k.bezig : k.naarReserve}
            </button>
          )}
          <button type="button" onClick={() => setVenster("weiger")} disabled={!stand.magWeigeren || bezig !== null} className="btn-ghost min-h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none">
            {k.weigeren}
          </button>
        </div>
        {bankBewerkbaar && (
          <button type="button" onClick={() => setVenster("reserve-uitleg")} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:underline">
            {k.reserveLink}
          </button>
        )}
      </div>

      <Dialoog
        open={venster === "accept"}
        id={`${id}-accept`}
        titel={gekozenRijen.length === 1 ? k.acceptTitelEen : k.acceptTitel}
        uitleg={fmt(k.acceptUitleg, { klus: shiftTitle, wanneer: dienst.chip })}
        onSluit={() => (bezig ? undefined : setVenster(null))}
        acties={
          <>
            <button type="button" onClick={() => setVenster(null)} disabled={bezig !== null} className="btn-ghost min-h-11 disabled:opacity-40">
              {k.annuleren}
            </button>
            <button type="button" onClick={() => void voerUit("accepted", gekozenRijen.map((r) => r.id), vraagReserves ? reserves : [])} disabled={bezig !== null} className="btn-primary min-h-11 disabled:opacity-40">
              {bezig === "accepted" ? k.bezig : k.accepteren}
            </button>
          </>
        }
      >
        <ul className="mt-4 divide-y divide-hair rounded-lg border border-hair text-sm">
          {gekozenRijen.map((r) => (
            <li key={r.id} className="px-3 py-2.5">
              <p className="font-semibold text-ink">{fmt(k.acceptRegel, { naam: r.naam, bedrag: euro(r.proposedRateCents) })}</p>
              {r.proposedRateCents !== r.listedRateCents && (
                <p className="mt-0.5 text-xs text-neutralx-600">{fmt(k.acceptTegenbod, { naam: r.naam, bod: euro(r.proposedRateCents), lijst: euro(r.listedRateCents) })}</p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink">
          <span className="font-semibold">
            {fmt(k.indicatie, { bedrag: euro(gekozenRijen.reduce((som, r) => som + kostenIndicatie(r.proposedRateCents, dienst.uren, dienst.feePerUurCents), 0)) })}
          </span>{" "}
          <span className="text-neutralx-500">({k.indicatieUitleg})</span>
        </p>
        {vraagReserves && (
          <div className="mt-4">
            <p className="font-semibold text-ink">{t.kandidaatKaart.reservesKop}</p>
            <p className="mt-1 text-xs text-neutralx-600">{k.reservesUitleg}</p>
            <ul className="mt-2 space-y-1.5">
              {overige.map((r) => {
                const op = reserves.includes(r.id);
                const vol = !op && reserves.length >= 3;
                return (
                  <li key={r.id}>
                    <label className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${op ? "border-brand-400 bg-brand-50" : "border-hair"} ${vol ? "opacity-50" : ""}`}>
                      <input
                        type="checkbox"
                        checked={op}
                        disabled={vol}
                        onChange={(e) => setReserves((v) => (e.target.checked ? [...v, r.id].slice(0, 3) : v.filter((x) => x !== r.id)))}
                        className="h-5 w-5 accent-brand-600"
                      />
                      <span>{r.naam}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Dialoog>

      <Dialoog
        open={venster === "weiger"}
        id={`${id}-weiger`}
        titel={k.weigerTitel}
        uitleg={gekozenRijen.length === 1 ? k.weigerTekstEen : fmt(k.weigerTekst, { n: gekozenRijen.length })}
        onSluit={() => (bezig ? undefined : setVenster(null))}
        acties={
          <>
            <button type="button" onClick={() => setVenster(null)} disabled={bezig !== null} className="btn-ghost min-h-11 disabled:opacity-40">
              {k.annuleren}
            </button>
            <button type="button" onClick={() => void voerUit("declined", gekozenRijen.map((r) => r.id))} disabled={bezig !== null} className="btn min-h-11 bg-crit text-white hover:brightness-110 disabled:opacity-40">
              {bezig === "declined" ? k.bezig : k.weigeren}
            </button>
          </>
        }
      />

      <Dialoog
        open={venster === "reserve-uitleg"}
        id={`${id}-reserve`}
        titel={k.reserveTitel}
        uitleg={k.reserveIntro}
        onSluit={() => setVenster(null)}
        acties={
          <button type="button" onClick={() => setVenster(null)} className="btn-ghost min-h-11">
            {k.sluiten}
          </button>
        }
      >
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink">
          <li>{k.reservePunt1}</li>
          <li>{k.reservePunt2}</li>
          <li>{k.reservePunt3}</li>
          <li>{k.reservePunt4}</li>
        </ol>
      </Dialoog>

      {regioRij && <RegioVenster open naam={regioRij.naam} regios={regioRij.regios} klus={klusPlek} onSluit={() => setRegioVoor(null)} />}

      {checks && (
        <LaatsteChecksVenster
          naam={checks.map(naamVan).filter(Boolean).join(", ")}
          keuzes={checks.map((offerId) => ({ offerId, shiftId }))}
          onSluit={() => setChecks(null)}
          onGecontroleerd={() => {
            // het bedrijf is meteen gecontroleerd: de keuze gaat nu alsnog door
            const ids = checks;
            setChecks(null);
            void voerUit("accepted", ids);
          }}
        />
      )}
    </div>
  );
}
