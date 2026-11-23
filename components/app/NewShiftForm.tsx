"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { createShiftAction, type NewShiftState } from "@/app/werkgever/diensten/nieuw/actions";
import { updateShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";
import type { ShiftTemplate } from "@/lib/shifts/create";
import { shiftCategory } from "@/lib/shifts/category";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { extraDayOptions } from "@/lib/shifts/extra-days";
import { ANNULEER_TERMIJNEN, annuleerTermijnLabel, annuleerUrenOf, STANDAARD_ANNULEER_UREN } from "@/lib/shifts/annuleertermijn";
import { AddressAutocomplete, type PickedAddress } from "@/components/app/AddressAutocomplete";
import { FairPayMeter } from "@/components/app/FairPayMeter";
import { kostenUitUren, toShiftFormValues } from "@/lib/klusconcept/concept";
import { useKlusConcept } from "@/components/werkgever/useKlusConcept";
import { SNEL_EN, SNEL_NL, type SnelTeksten } from "@/components/werkgever/snel-teksten";
import type { SnelVoorinvulling } from "@/components/werkgever/SnelPlaatsen";
import { SjabloonGalerij } from "@/components/app/SjabloonGalerij";
import { BrancheEtiket, KlusBeeldVlak } from "@/components/app/KlusBeeldVlak";
import { KostenLijst } from "@/components/app/KostenLijst";
import { kostenBedragen } from "@/lib/klusconcept/kosten-tekst";
import { bedragTekst, centsUitTarief, geldTekst, tariefInvoer, tariefWeergave, urenTekst, type WeergaveTaal } from "@/lib/klusconcept/weergave";
import { useAutoHoogte } from "@/components/app/useAutoHoogte";
import { SJABLOON_EN, SJABLOON_NL } from "@/lib/shifts/sjabloon-kiezer-teksten";
import { useI18n, useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { ZEKERFLEX_UITZENDER } from "@/lib/uitzend/model";

const initial: NewShiftState = { error: null };

interface OwnTemplate {
  id: string;
  label: string;
  hourlyRateCents: number;
  breakMinutes: number;
  description: string | null;
  dresscode: string | null;
  annuleerUren?: number;
}

function Submit({ days, blocked }: { days: number; blocked?: boolean }) {
  const { pending } = useFormStatus();
  const n = useT().newShiftForm;
  return (
    <button type="submit" disabled={pending || blocked} className="btn-primary min-h-[44px] w-full disabled:opacity-50">
      {pending
        ? n.bezigUitzetten
        : days > 1
          ? fmt(n.zetUit, { n: days })
          : n.uitzetten}
    </button>
  );
}

/** An existing klus opened for editing: same form, saved with updateShiftAction. */
export interface ShiftEdit {
  shiftId: string;
  /** "Vestiging — Plaats": the location stays as it was placed */
  locatie: string;
  assignedCount: number;
  initial: {
    title: string;
    description: string;
    dresscode: string;
    extraInfo: string;
    /** datetime-local values in Dutch time ("2026-11-05T09:00") */
    startsAt: string;
    endsAt: string;
    breakMinutes: number;
    hourlyRateCents: number;
    positions: number;
  };
}

export function NewShiftForm({
  branches,
  templates,
  minRateCents = 1620,
  pools = [],
  beeld = { logoUrl: null, useLogo: false, canChange: false },
  edit,
  kostenplaatsen = [],
  leesConcept = true,
  voorinvulling,
}: {
  branches: { id: string; name: string; city: string }[];
  templates: ShiftTemplate[];
  minRateCents?: number;
  pools?: { id: string; name: string; memberCount: number }[];
  /** kostenplaatsen/PO-nummers van het bedrijf (OrgProfileExtra.costCentres); leeg = geen keuze */
  kostenplaatsen?: string[];
  /** the organisation's logo and whether its klussen show it instead of the branch photo */
  beeld?: { logoUrl: string | null; useLogo: boolean; canChange: boolean };
  /** set: edit this klus instead of placing a new one */
  edit?: ShiftEdit;
  /** false: another form on the page takes the klus drafted on /klus-plaatsen (SnelPlaatsen), so this one starts empty */
  leesConcept?: boolean;
  /** "Klus dupliceren": een bestaande klus als vertrekpunt, alleen de datum is nieuw (de tijden staan in de melding) */
  voorinvulling?: SnelVoorinvulling;
}) {
  const router = useRouter();
  const { locale, t: dict } = useI18n();
  const n = dict.newShiftForm;
  const loc = locale === "nl" ? "nl-NL" : "en-GB";
  // geld, uren en het tariefveld in de taal van de pagina (lib/klusconcept/weergave.ts): Nederlands komma, Engels punt
  const taal: WeergaveTaal = locale === "en" ? "en" : "nl";
  const WD = n.weekdagen.split(",");
  const init = edit?.initial;
  const kopie = edit ? undefined : voorinvulling;
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const minRateEuro = minRateCents / 100;
  const [state, formAction] = useFormState(createShiftAction, initial);
  const [useLogo, setUseLogo] = useState(beeld.useLogo && Boolean(beeld.logoUrl));
  const [beeldBezig, setBeeldBezig] = useState(false);
  const [beeldFout, setBeeldFout] = useState<string | null>(null);
  const galerij = useMemo(
    () => templates.map((t) => ({ key: t.key, label: t.label, rateCents: Math.max(t.hourlyRateCents, minRateCents), branche: t.branche })),
    [templates, minRateCents],
  );
  const [tpl, setTpl] = useState("");
  // "Of vul het zelf in" onder de functiekiezer brengt je naar dit veld
  const titelRef = useRef<HTMLInputElement>(null);
  // de tekstvakken van stap 1 groeien met hun tekst (useAutoHoogte), zodat een lange omschrijving of een voorbeeld niet wordt afgekapt
  const omschrijvingRef = useRef<HTMLTextAreaElement>(null);
  const kledingRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(init?.title ?? kopie?.titel ?? "");
  const [description, setDescription] = useState(init?.description ?? kopie?.omschrijving ?? "");
  const [dresscode, setDresscode] = useState(init?.dresscode ?? kopie?.dresscode ?? "");
  // het veld voor extra informatie is weg (10 nov, eigenaar: nergens meer bij de klus); een bestaande waarde blijft bij bewerken bewaard
  const [extraInfo] = useState(init?.extraInfo ?? "");
  const [writing, setWriting] = useState(false);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [forecast, setForecast] = useState<{
    marketRateCents: number;
    fillChance: number;
    suggestedRateCents: number;
    suggestedFillChance: number;
    reasons: string[];
    sample: number;
  } | null>(null);
  const [rateEuro, setRateEuro] = useState(((init?.hourlyRateCents ?? (kopie ? Math.max(minRateCents, kopie.tariefCents) : minRateCents)) / 100).toFixed(2));
  const [breakMin, setBreakMin] = useState(String(init?.breakMinutes ?? 30));
  const [positions, setPositions] = useState(String(init?.positions ?? kopie?.personen ?? 1));
  // annuleringstermijn (lib/shifts/annuleertermijn.ts): alleen bij plaatsen, niet bij bewerken
  const [annuleerUren, setAnnuleerUren] = useState(String(annuleerUrenOf(kopie?.annuleerUren ?? STANDAARD_ANNULEER_UREN)));
  const [startsAt, setStartsAt] = useState(init?.startsAt ?? "");
  const [endsAt, setEndsAt] = useState(init?.endsAt ?? "");
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [poolId, setPoolId] = useState("");
  const [oneOff, setOneOff] = useState(false);
  const [adHocAddress, setAdHocAddress] = useState<PickedAddress | null>(null);
  const [adHocPostalCode, setAdHocPostalCode] = useState("");
  const [adHocCity, setAdHocCity] = useState("");
  const [ownTemplates, setOwnTemplates] = useState<OwnTemplate[]>([]);
  const [fromWebsite, setFromWebsite] = useState(false);

  // Klus plaatsen in twee stappen: 1 "Klus omschrijven" (functie, titel, omschrijving, kleding, annuleringstermijn) en
  // 2 "Klus inplannen" (locatie, tijden, plekken, tarief en de overige opties). Beide stappen blijven in het formulier
  // staan (de verborgen velden doen mee); bij bewerken is het één scherm, zoals altijd.
  const metStappen = !edit;
  const [stap, setStap] = useState<1 | 2>(1);
  const [stapFout, setStapFout] = useState<string | null>(null);
  const [voorbeeldOpen, setVoorbeeldOpen] = useState(false);
  const stapKop = useRef<HTMLHeadingElement>(null);
  const stapGezien = useRef(false);
  const toon1 = !metStappen || stap === 1;
  const toon2 = !metStappen || stap === 2;
  useAutoHoogte(omschrijvingRef, description, toon1);
  useAutoHoogte(kledingRef, dresscode, toon1);

  // A klus drafted on /klus-plaatsen before sign-up (this browser, or the copy kept at sign-up): fill it in once.
  // Never over an existing klus that is being edited, and not when "Snel een klus plaatsen" takes it (leesConcept).
  const editing = Boolean(edit);
  const concept = useKlusConcept({ aan: !editing && leesConcept, wis: true });
  useEffect(() => {
    if (!concept) return;
    const v = toShiftFormValues(concept);
    setTitle(v.title);
    setDescription(v.description);
    setRateEuro(v.rateEuro);
    setBreakMin(v.breakMin);
    setPositions(v.positions);
    setStartsAt(v.startsAt);
    setEndsAt(v.endsAt);
    setFromWebsite(true);
    // functie, tijden en tarief staan er al: door naar de vestiging en de controle
    setStap(2);
  }, [concept]);

  // bij een andere stap naar de kop van die stap (focus voor een schermlezer, scroll voor wie onderaan klikte); niet bij het openen
  useEffect(() => {
    if (!stapGezien.current) {
      stapGezien.current = true;
      return;
    }
    const kop = stapKop.current;
    if (!kop) return;
    kop.focus({ preventScroll: true });
    kop.scrollIntoView({ block: "start" });
  }, [stap]);

  useEffect(() => {
    fetch("/api/werkgever/templates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setOwnTemplates(d.templates ?? []))
      .catch(() => undefined);
  }, []);

  // live tarief-advies / vervullingskans (debounced) zodra titel, tijd en tarief er zijn
  useEffect(() => {
    const rateCents = centsUitTarief(rateEuro);
    if (title.trim().length < 2 || !startsAt || rateCents <= 0) {
      setForecast(null);
      return;
    }
    const id = setTimeout(() => {
      fetch("/api/werkgever/pricing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, startsAt, rateCents }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setForecast(d))
        .catch(() => undefined);
    }, 600);
    return () => clearTimeout(id);
  }, [title, startsAt, rateEuro]);

  function applyTemplate(t: ShiftTemplate) {
    setTpl(t.key);
    setStapFout(null);
    setTitle(t.label);
    setDescription(t.description);
    setDresscode(t.dresscode ?? "");
    setRateEuro((Math.max(t.hourlyRateCents, minRateCents) / 100).toFixed(2));
    setBreakMin(String(t.breakMinutes));
  }

  // company-wide choice (all its klussen), saved at once; the server's answer is what we show
  async function kiesBeeld(logo: boolean) {
    setBeeldBezig(true);
    setBeeldFout(null);
    const res = await fetch("/api/werkgever/klus-beeld", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ beeld: logo ? "logo" : "foto" }),
    }).catch(() => null);
    setBeeldBezig(false);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setBeeldFout(d?.error?.message ?? n.opslaanMislukt);
      return;
    }
    setUseLogo(((await res.json()) as { useLogo: boolean }).useLogo);
  }

  // edit mode: the same checks as the old edit window (updateShiftAction: overlap with booked people,
  // chat message + push to them); afterwards back to the klus with the server's version
  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit) return;
    setEditBusy(true);
    setEditError(null);
    const res = await updateShiftAction(edit.shiftId, {
      title,
      description,
      dresscode,
      extraInfo,
      startsAt,
      endsAt,
      breakMinutes: Number(breakMin) || 0,
      hourlyRateCents,
      positions: Number(positions) || 1,
    }).catch(() => ({ ok: false, message: n.opslaanMislukt }));
    setEditBusy(false);
    if (!res.ok) {
      setEditError(res.message);
      return;
    }
    router.push(`/werkgever/diensten/${edit.shiftId}`);
    router.refresh();
  }

  function applyOwnTemplate(t: OwnTemplate) {
    setTpl("");
    setStapFout(null);
    setTitle(t.label);
    setDescription(t.description ?? "");
    setDresscode(t.dresscode ?? "");
    setRateEuro((t.hourlyRateCents / 100).toFixed(2));
    setBreakMin(String(t.breakMinutes));
    if (t.annuleerUren) setAnnuleerUren(String(t.annuleerUren));
  }

  // van stap 1 naar stap 2: de server wil een titel van minstens 3 tekens (createShiftSchema), dus zeg dat hier al
  function naarStap2() {
    if (title.trim().length < 3) {
      setStapFout(n.titelKort);
      titelRef.current?.focus();
      return;
    }
    setStapFout(null);
    setStap(2);
  }

  // Enter in een invoerveld van stap 1 gaat naar stap 2 en dient het formulier niet in (een tekstvak houdt Enter voor een nieuwe regel)
  function enterOpStap1(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    naarStap2();
  }

  // een toetsenbord dat "Ga" stuurt zonder Enter-toets: ook dan in stap 1 doorgaan in plaats van indienen
  function stapOpIndienen(e: FormEvent<HTMLFormElement>) {
    if (stap !== 1) return;
    e.preventDefault();
    naarStap2();
  }

  const hourlyRateCents = centsUitTarief(rateEuro);
  const cat = useMemo(() => shiftCategory(title || "Dienst", null), [title]);

  const hours = useMemo(() => {
    if (!startsAt || !endsAt) return 0;
    const h = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000 - Number(breakMin) / 60;
    return Math.max(0, Math.round(h * 100) / 100);
  }, [startsAt, endsAt, breakMin]);
  const grossPerSeat = Math.round(hours * hourlyRateCents);
  const totalDays = 1 + extraDates.length;

  // wat het kost: loon + platformkosten (staffel uit lib/pricing/tiers.ts), zoals op /klus-plaatsen en bij "Snel een klus plaatsen"
  const kosten = useMemo(
    () => kostenUitUren({ hours, positions: Number(positions) || 1, rateCents: Number.isFinite(hourlyRateCents) && hourlyRateCents > 0 ? hourlyRateCents : 0, days: totalDays }),
    [hours, positions, hourlyRateCents, totalDays],
  );
  const kostenTekst: SnelTeksten = locale === "en" ? SNEL_EN : SNEL_NL;
  const kostenZichtbaar = hours > 0 && hourlyRateCents > 0;
  // alle bedragen op de cent en het totaal is de som van loon en platformkosten (lib/klusconcept/kosten-tekst.ts, 23 nov 2026)
  const bedragen = kostenBedragen(kosten, taal);
  const kostenRegels = {
    teksten: kostenTekst,
    meer: (Number(positions) || 1) > 1 || totalDays > 1,
    loon: bedragen.loon,
    uren: urenTekst(kosten.totalHours, taal),
    platform: bedragen.platform,
    totaal: bedragen.totaal,
  };

  function toggleDate(iso: string) {
    setExtraDates((prev) => (prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort()));
  }

  // next 21 days grid (excluding the primary start date), on the calendar date of the field
  const primaryDay = startsAt ? startsAt.slice(0, 10) : "";
  const dayOptions = useMemo(() => extraDayOptions(startsAt ? startsAt.slice(0, 10) : amsterdamDayKey(new Date())), [startsAt]);

  // de waarde van een datetime-local is al de tijd in Nederland ("2026-11-05T09:00"): laat hem zo zien, in welke zone de browser ook staat
  const tijdTekst = (v: string) => new Date(`${v}Z`).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  const plek = edit ? edit.locatie : oneOff ? adHocAddress?.label ?? n.eenmaligeLocatie : branches[0]?.name ?? n.vestigingNaam;
  const kopieVestiging = kopie && branches.some((b) => b.id === kopie.branchId) ? kopie.branchId : undefined;

  return (
    // grid-cols-1 + minmax(0,…): anders wordt de kolom zo breed als een brede rij in de kiezer (4 nov: pagina 2552px breed)
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <form {...(edit ? { onSubmit: saveEdit } : { action: formAction, onSubmit: stapOpIndienen })} onKeyDown={metStappen && stap === 1 ? enterOpStap1 : undefined} className="min-w-0 space-y-7">
        {metStappen && (
          <div className="space-y-3">
            {/* de stappenbalk: twee stappen, de balk onder de naam wordt groen zodra je er bent */}
            <ol aria-label={n.stappenLabel} className="grid grid-cols-2 gap-3">
              {[n.stap1, n.stap2].map((naam, i) => {
                const nr = i + 1;
                const klaar = stap > nr;
                const huidig = stap === nr;
                const bol = `grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-xs font-bold ${huidig ? "bg-brand-500 text-white" : klaar ? "bg-brand-50 text-brand-700" : "bg-paper-soft text-neutralx-500"}`;
                return (
                  <li key={nr} aria-current={huidig ? "step" : undefined}>
                    {klaar ? (
                      <button type="button" onClick={() => setStap(1)} className="flex min-h-[44px] w-full items-center gap-2 text-left text-xs font-semibold text-brand-700 hover:underline">
                        <span aria-hidden className={bol}>✓</span>
                        {naam}
                      </button>
                    ) : (
                      <span className={`flex min-h-[44px] items-center gap-2 text-xs font-semibold ${huidig ? "text-ink" : "text-neutralx-500"}`}>
                        <span aria-hidden className={bol}>{nr}</span>
                        {naam}
                      </span>
                    )}
                    <span aria-hidden className={`block h-1 rounded-full ${huidig || klaar ? "bg-brand-500" : "bg-hair"}`} />
                  </li>
                );
              })}
            </ol>
            <div>
              <h2 ref={stapKop} tabIndex={-1} className="sr-only scroll-mt-28">
                {stap === 1 ? n.stap1 : n.stap2}
              </h2>
              <p className="text-sm text-neutralx-600">{stap === 1 ? n.stap1Uitleg : n.stap2Uitleg}</p>
            </div>
          </div>
        )}
        {(editError ?? state.error) && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{editError ?? state.error}</p>}
        {edit && edit.assignedCount > 0 && (
          <p role="status" className="rounded-lg bg-warn/10 px-3 py-2.5 text-sm text-neutralx-700">
            {edit.assignedCount === 1 ? n.ingeplandEen : fmt(n.ingeplandMeer, { n: edit.assignedCount })} {n.ingeplandNa}
          </p>
        )}
        {fromWebsite && toon2 && (
          <p role="status" className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
            {n.vanWebsite}
          </p>
        )}
        {kopie && toon2 && (
          <p role="status" className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
            {fmt(n.kopieNota, { van: kopie.van, tot: kopie.tot })}
          </p>
        )}

        <input type="hidden" name="templateKey" value={tpl} />
        <input type="hidden" name="hourlyRateCents" value={Number.isFinite(hourlyRateCents) ? hourlyRateCents : 0} />
        <input type="hidden" name="extraDates" value={extraDates.join(",")} />

        {/* ---- stap 1: klus omschrijven ---- */}
        <div hidden={!toon1} className="space-y-7">
          <SjabloonGalerij
            sjablonen={galerij}
            gekozen={tpl}
            onKies={(key) => {
              const t = templates.find((x) => x.key === key);
              if (t) applyTemplate(t);
            }}
            teksten={locale === "en" ? SJABLOON_EN : SJABLOON_NL}
            onEigen={() => titelRef.current?.focus()}
          />

          {ownTemplates.length > 0 && (
            <div>
              <p className="field-label mb-2">
                {n.eigenTemplates} <span className="text-neutralx-400">{n.eigenTemplatesHint}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {ownTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyOwnTemplate(t)}
                    className="rounded-full border border-hairstrong px-3 py-1.5 text-xs font-medium text-neutralx-600 transition hover:border-brand-500"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block">
              <span className="field-label">{n.titel}</span>
              <input
                ref={titelRef}
                name="title"
                required
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (stapFout && e.target.value.trim().length >= 3) setStapFout(null);
                }}
                placeholder={n.titelPlaceholder}
                aria-invalid={stapFout ? true : undefined}
                aria-describedby={stapFout ? "shift-title-fout" : undefined}
                className="field-input"
              />
            </label>
            {stapFout && (
              <p id="shift-title-fout" role="alert" className="mt-1 text-sm font-medium text-crit">
                {stapFout}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-end justify-between gap-2">
              <label htmlFor="shift-description" className="field-label">
                {n.omschrijving} <span className="text-neutralx-400">{n.optioneel}</span>
              </label>
              <button
                type="button"
                disabled={writing || title.trim().length < 3}
                title={title.trim().length < 3 ? n.eerstTitel : undefined}
                onClick={async (e) => {
                  const fd = new FormData(e.currentTarget.form ?? undefined);
                  setWriting(true);
                  setWriteNote(null);
                  try {
                    const r = await fetch("/api/werkgever/ai/shift-text", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title,
                        description,
                        dresscode,
                        branchId: oneOff ? undefined : String(fd.get("branchId") ?? "") || undefined,
                        city: oneOff ? adHocCity || undefined : undefined,
                        startsAt: startsAt || undefined,
                        endsAt: endsAt || undefined,
                        breakMinutes: Number(breakMin) || 0,
                        viaUitzendbureau: fd.get("viaUitzendbureau") === "on",
                      }),
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d?.error?.message ?? d?.message ?? n.schrijvenMislukt);
                    setDescription(d.description);
                    if (!dresscode.trim()) setDresscode(d.dresscode);
                    setWriteNote(d.mode === "model" ? n.doorAi : n.conceptTitel);
                  } catch (err) {
                    setWriteNote((err as Error).message);
                  } finally {
                    setWriting(false);
                  }
                }}
                className="mb-1 rounded-full border border-hair bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
              >
                {writing ? n.schrijven : description.trim() ? n.verbeter : n.schrijfVoorMij}
              </button>
            </div>
            <textarea ref={omschrijvingRef} id="shift-description" name="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" />
            {writeNote && <p className="mt-1 text-xs text-neutralx-500">{writeNote}</p>}
          </div>

          <label className="block">
            <span className="field-label">
              {n.kleding} <span className="text-neutralx-400">{n.optioneel}</span>
            </span>
            <textarea
              ref={kledingRef}
              name="dresscode"
              rows={2}
              value={dresscode}
              onChange={(e) => setDresscode(e.target.value)}
              placeholder={n.kledingPlaceholder}
              className="field-input"
            />
            {/* vaste keuzes (naar YoungOnes' kledingvoorschriften): één klik zet de regel in het veld, nog eens klikken haalt hem weg */}
            <span className="mt-2 flex flex-wrap gap-1.5">
              {n.kledingKeuzes.split("|").map((keuze) => {
                const aan = dresscode.split(/\s*[;,\n]\s*/).some((r) => r.trim().toLowerCase() === keuze.toLowerCase());
                return (
                  <button
                    key={keuze}
                    type="button"
                    aria-pressed={aan}
                    onClick={() =>
                      setDresscode((d) => {
                        const regels = d.split(/\s*[;,\n]\s*/).map((r) => r.trim()).filter(Boolean);
                        const zonder = regels.filter((r) => r.toLowerCase() !== keuze.toLowerCase());
                        return (aan ? zonder : [...zonder, keuze]).join(", ");
                      })
                    }
                    className={`rounded-full border px-2.5 py-1 text-xs ${aan ? "border-ink bg-ink text-white" : "border-hair bg-white text-neutralx-700 hover:border-brand-300"}`}
                  >
                    {keuze}
                  </button>
                );
              })}
            </span>
          </label>

          {!edit && (
            <label className="block">
              <span className="field-label">{n.annuleerTermijn}</span>
              <select name="annuleerUren" value={annuleerUren} onChange={(e) => setAnnuleerUren(e.target.value)} className="field-input">
                {ANNULEER_TERMIJNEN.map((u) => (
                  <option key={u} value={u}>
                    {annuleerTermijnLabel(u, locale === "en" ? "en" : "nl")}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutralx-400">{n.annuleerTermijnUitleg}</span>
            </label>
          )}

          {metStappen && (
            <button type="button" onClick={naarStap2} className="btn-primary min-h-[44px] w-full sm:w-auto sm:px-10">
              {n.volgende}
            </button>
          )}
        </div>

        {/* ---- stap 2: klus inplannen ---- */}
        <div hidden={!toon2} className="space-y-7">
          {edit ? (
            <div>
              <p className="field-label">{n.locatie}</p>
              <p className="rounded-xl border border-hair bg-paper-soft px-3 py-2.5 text-sm text-ink">{edit.locatie}</p>
              <p className="mt-1 text-xs text-neutralx-500">{n.locatieVast}</p>
            </div>
          ) : (
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-neutralx-500">
              <input
                type="checkbox"
                checked={oneOff}
                onChange={(e) => setOneOff(e.target.checked)}
                className="accent-brand-500"
              />
              {n.eenmaligLabel}
            </label>

            {!oneOff ? (
              <label className="mt-2 block">
                <span className="field-label">{n.vestiging}</span>
                <select name="branchId" required defaultValue={kopieVestiging} className="field-input">
                  {branches.length === 0 && <option value="">{n.geenVestiging}</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} — {b.city}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-neutralx-400">
                  {n.vestigingenBeheer}{" "}
                  <Link href="/werkgever/locaties" className="font-medium text-brand-600 hover:underline">
                    /werkgever/locaties
                  </Link>
                  .
                </span>
              </label>
            ) : (
              <div className="mt-2 space-y-3">
                <label className="block">
                  <span className="field-label">{n.adres}</span>
                  {/* postcode en plaats komen uit het gekozen adres (PDOK); aanpassen kan daaronder */}
                  <AddressAutocomplete
                    value={adHocAddress}
                    onPick={(a) => {
                      setAdHocAddress(a);
                      if (a.postcode) setAdHocPostalCode(a.postcode);
                      if (a.plaats) setAdHocCity(a.plaats);
                    }}
                    onWijzig={() => setAdHocAddress(null)}
                    placeholder={n.zoekAdres}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="field-label">{n.postcode}</span>
                    <input
                      value={adHocPostalCode}
                      onChange={(e) => setAdHocPostalCode(e.target.value)}
                      className="field-input"
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">{n.plaats}</span>
                    <input value={adHocCity} onChange={(e) => setAdHocCity(e.target.value)} className="field-input" />
                  </label>
                </div>
                <input type="hidden" name="adHocLabel" value={adHocAddress?.label ?? ""} />
                <input type="hidden" name="adHocPostalCode" value={adHocPostalCode} />
                <input type="hidden" name="adHocCity" value={adHocCity} />
                <input type="hidden" name="adHocLatitude" value={adHocAddress?.lat ?? ""} />
                <input type="hidden" name="adHocLongitude" value={adHocAddress?.lng ?? ""} />
              </div>
            )}
          </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">{n.start}</span>
              <input type="datetime-local" name="startsAt" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">{n.einde}</span>
              <input type="datetime-local" name="endsAt" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">{n.pauze}</span>
              <input type="number" name="breakMinutes" min={0} max={240} value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">{n.plekken}</span>
              <input type="number" name="positions" min={1} max={50} value={positions} onChange={(e) => setPositions(e.target.value)} className="field-input" />
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label">{n.uurtarief}</span>
              {/* tekstveld met een decimaaltoetsenbord: de browser maakt van een getalveld een punt of komma naar zijn eigen taal; dit
                  veld toont altijd de komma van het Nederlands of de punt van het Engels (lib/klusconcept/weergave.ts) */}
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={tariefWeergave(rateEuro, taal)}
                onChange={(e) => setRateEuro(tariefInvoer(e.target.value))}
                onBlur={() => {
                  if (rateEuro.trim() !== "" && hourlyRateCents < minRateCents) setRateEuro(minRateEuro.toFixed(2));
                }}
                className="field-input"
              />
              <span className="mt-1 block text-xs text-neutralx-400">
                {fmt(n.minimumTekst, { min: bedragTekst(minRateCents, taal) })}
              </span>
              {hourlyRateCents > 0 && hourlyRateCents < minRateCents && (
                <span className="mt-1 block text-xs font-medium text-crit">
                  {fmt(n.minimumFout, { min: bedragTekst(minRateCents, taal) })}
                </span>
              )}
            </label>
            {forecast && forecast.sample >= 8 && hourlyRateCents > 0 && (
              <FairPayMeter
                rateCents={hourlyRateCents}
                marketRateCents={forecast.marketRateCents}
                fillChance={forecast.fillChance}
                suggestedRateCents={forecast.suggestedRateCents}
                suggestedFillChance={forecast.suggestedFillChance}
                sample={forecast.sample}
                onApplySuggested={(cents) => setRateEuro((cents / 100).toFixed(2))}
              />
            )}
          </div>

          {/* multi-day (only when placing) */}
          {!edit && (
          <div className="rounded-xl border border-hair bg-paper-soft/50 p-4">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="accent-brand-500" />
              {n.meerdereDagen}
            </label>
            {multi && (
              <>
                <p className="mt-2 text-xs text-neutralx-500">
                  {startsAt ? n.kiesDagen : n.eerstStart}
                </p>
                {startsAt && (
                  <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {dayOptions.map((iso) => {
                      const dt = new Date(iso + "T12:00:00");
                      const on = extraDates.includes(iso);
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => toggleDate(iso)}
                          className={`rounded-lg border px-2 py-1.5 text-center text-[11px] transition ${
                            on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-hairstrong hover:border-brand-300"
                          }`}
                        >
                          <span className="block font-semibold">{WD[dt.getDay()]}</span>
                          <span className="opacity-70">{iso.slice(5)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {!edit && kostenplaatsen.length > 0 && (
            <label className="block">
              <span className="field-label">
                {n.kostenplaats} <span className="text-neutralx-400">{n.optioneel}</span>
              </span>
              <select name="kostenplaats" defaultValue="" className="field-input">
                <option value="">{n.kostenplaatsGeen}</option>
                {kostenplaatsen.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutralx-400">{n.kostenplaatsUitleg}</span>
            </label>
          )}

          {!edit && pools.length > 0 && (
            <label className="block">
              <span className="field-label">
                {n.poolKop} <span className="text-neutralx-400">{n.optioneel}</span>
              </span>
              <select name="poolId" value={poolId} onChange={(e) => setPoolId(e.target.value)} className="field-input">
                <option value="">{n.poolOpen}</option>
                {pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fmt(p.memberCount === 1 ? n.poolLid : n.poolLeden, { naam: p.name, n: p.memberCount })}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutralx-400">
                {n.poolUitleg}
              </span>
            </label>
          )}

          {!edit && (
            // "Favorieten automatisch accepteren" (naar YoungOnes): lib/shifts/auto-accept.ts + lib/pools/vaste-schil.ts
            <label className="flex items-start gap-3 rounded-xl border border-hairstrong bg-paper-soft px-4 py-3">
              <input type="checkbox" name="autoAcceptFavorieten" value="on" className="mt-0.5 h-4 w-4 accent-brand-500" />
              <span>
                <span className="block text-sm font-semibold text-ink">{n.autoAcceptFav}</span>
                <span className="block text-xs text-neutralx-500">{n.autoAcceptFavUitleg}</span>
              </span>
            </label>
          )}

          {!edit && ZEKERFLEX_UITZENDER && (
          <label className="flex items-start gap-3 rounded-xl border border-hairstrong bg-paper-soft px-4 py-3">
            <input type="checkbox" name="viaUitzendbureau" value="on" className="mt-0.5 h-4 w-4 accent-brand-500" />
            <span>
              <span className="block text-sm font-semibold text-ink">{n.uitzendbureau}</span>
              <span className="block text-xs text-neutralx-500">
                {n.uitzendbureauUitleg}
              </span>
            </span>
          </label>
          )}
          {/* ZekerFlex is zelf geen uitzender meer (lib/uitzend/model.ts): uitzendkrachten lopen via een aangesloten uitzendbureau */}
          {!edit && !ZEKERFLEX_UITZENDER && (
            <p className="rounded-xl border border-hairstrong bg-paper-soft px-4 py-3 text-xs text-neutralx-500">
              {n.uitzendViaBureau}{" "}
              <Link href="/contact" className="font-semibold text-brand-600 underline">
                {n.uitzendViaBureauLink}
              </Link>
            </p>
          )}

          {/* wat de klus kost, vlak boven de knop op een telefoon; op een laptop staat de kostenregel één keer, in het voorbeeld ernaast
              (23 nov 2026: het totaal stond daar twee keer, ook nog eens hier bij de knop) */}
          {!edit && kostenZichtbaar && (
            <KostenBlok {...kostenRegels} className="lg:hidden" />
          )}

          {edit ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="submit" disabled={editBusy || hourlyRateCents < minRateCents} className="btn-primary flex-1 disabled:opacity-50">
                {editBusy ? n.bezigOpslaan : n.wijzigingenOpslaan}
              </button>
              <Link href={`/werkgever/diensten/${edit.shiftId}`} className="btn-ghost text-center">
                {n.annuleren}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <button type="button" onClick={() => setStap(1)} className="btn-ghost min-h-[44px] sm:flex-shrink-0">
                {n.terug}
              </button>
              <Submit days={totalDays} blocked={hourlyRateCents < minRateCents} />
            </div>
          )}
        </div>
      </form>

      {/* live preview: op een laptop naast het formulier, op een telefoon een uitklapper onderaan */}
      <div className="lg:sticky lg:top-24 lg:-m-1 lg:max-h-[calc(100vh_-_7rem)] lg:self-start lg:overflow-y-auto lg:p-1">
        <button
          type="button"
          aria-expanded={voorbeeldOpen}
          aria-controls="klus-voorbeeld"
          onClick={() => setVoorbeeldOpen((o) => !o)}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-hairstrong bg-white px-4 py-2.5 text-left text-sm font-semibold text-ink lg:hidden"
        >
          {n.voorbeeldKop}
          <svg aria-hidden viewBox="0 0 16 16" className={`h-4 w-4 flex-shrink-0 transition-transform ${voorbeeldOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 6l4.5 4.5L12.5 6" />
          </svg>
        </button>
        <p className="field-label mb-2 hidden lg:block">{n.voorbeeldKop}</p>
        <div id="klus-voorbeeld" className={voorbeeldOpen ? "mt-3" : "hidden lg:block"}>
          <article className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
            <div className="relative aspect-[16/9]">
              {useLogo && beeld.logoUrl ? (
                // fixed white: logos are made for a light background, also in dark mode
                <span className="flex h-full w-full items-center justify-center bg-[#ffffff] px-10 py-8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={beeld.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                </span>
              ) : (
                // geen foto van mensen in het voorbeeld (23 nov 2026, eigenaar): een rustig vlak met de brancheskleur
                <KlusBeeldVlak accent={cat.accent} label={cat.label}>
                  <div className="absolute inset-x-3 bottom-3">
                    <p className="truncate font-display text-lg font-bold text-ink">{title || n.titelFallback}</p>
                    <p className="truncate text-xs text-neutralx-600">
                      {plek}
                      {startsAt ? ` · ${tijdTekst(startsAt)}` : ""}
                    </p>
                  </div>
                </KlusBeeldVlak>
              )}
              {/* bij een logo staat het branche-etiket boven op het witte vlak (zonder logo zit het al in het vlak) */}
              {useLogo && beeld.logoUrl && <BrancheEtiket accent={cat.accent} label={cat.label} />}
              {totalDays > 1 && (
                <span className="absolute right-3 top-3 rounded-full bg-brand-500/90 px-2 py-1 text-[11px] font-bold text-white">
                  {fmt(n.dagen, { n: totalDays })}
                </span>
              )}
            </div>
            {useLogo && beeld.logoUrl && (
              <div className="border-b border-hair px-4 pb-3 pt-3">
                <p className="truncate font-display text-lg font-bold text-ink">{title || n.titelFallback}</p>
                <p className="truncate text-xs text-neutralx-500">
                  {plek}
                  {startsAt ? ` · ${tijdTekst(startsAt)}` : ""}
                </p>
              </div>
            )}
            <div className="space-y-2 p-4 text-sm">
              <Row k={n.rijTarief} v={fmt(n.perUur, { bedrag: bedragTekst(hourlyRateCents, taal) })} />
              <Row k={n.rijDuur} v={hours ? `${fmt(n.duurUren, { u: urenTekst(hours, taal) })}${Number(breakMin) ? fmt(n.duurPauze, { m: breakMin }) : ""}` : "—"} />
              <Row k={n.rijPlekken} v={fmt(n.plekkenPerDag, { n: positions })} />
              <Row k={n.rijBruto} v={grossPerSeat ? geldTekst(grossPerSeat, taal) : "—"} highlight />
              {!edit && (
                <p className="pt-1 text-xs text-neutralx-500">
                  {fmt(n.voorbeeldAfzeg, { label: annuleerTermijnLabel(Number(annuleerUren), locale === "en" ? "en" : "nl") })}
                </p>
              )}
            </div>
          </article>
          {kostenZichtbaar && <KostenBlok {...kostenRegels} className="mt-3 hidden lg:block" />}
          {primaryDay && !edit && <p className="mt-2 text-[11px] text-neutralx-500">{n.gematcht}</p>}

          <fieldset className="mt-4 min-w-0 rounded-xl border border-hair bg-white p-3">
            <legend className="px-1 text-xs font-semibold text-ink">{n.beeldKop}</legend>
            {beeld.logoUrl ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <BeeldKeuze actief={!useLogo} disabled={beeldBezig || !beeld.canChange} onClick={() => void kiesBeeld(false)} label={n.beeldFoto}>
                    <KlusBeeldVlak accent={cat.accent} label={cat.label} klein />
                  </BeeldKeuze>
                  <BeeldKeuze actief={useLogo} disabled={beeldBezig || !beeld.canChange} onClick={() => void kiesBeeld(true)} label={n.beeldLogo}>
                    <span className="flex h-full w-full items-center justify-center bg-[#ffffff] p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={beeld.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                    </span>
                  </BeeldKeuze>
                </div>
                <p className="mt-2 text-[11px] text-neutralx-500">
                  {beeld.canChange ? n.beeldGeldt : n.beeldBeheerder}
                </p>
              </>
            ) : (
              <p className="text-xs text-neutralx-600">
                {n.beeldGeenLogo}{" "}
                <Link href="/werkgever/bedrijf" className="font-semibold text-brand-600 underline underline-offset-2">
                  {n.beeldUpload}
                </Link>
                .
              </p>
            )}
            {beeldFout && (
              <p role="alert" className="mt-2 text-xs text-crit">
                {beeldFout}
              </p>
            )}
          </fieldset>
        </div>
      </div>
    </div>
  );
}

function BeeldKeuze({ actief, disabled, onClick, label, children }: { actief: boolean; disabled: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={actief}
      disabled={disabled}
      onClick={onClick}
      className={`overflow-hidden rounded-lg border text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${actief ? "border-brand-500 ring-2 ring-brand-500" : "border-hair hover:border-hairstrong"}`}
    >
      <span className="relative block aspect-[16/9] overflow-hidden">{children}</span>
      <span className="block px-2 py-1.5 text-xs font-semibold text-ink">{label}</span>
    </button>
  );
}

function Row({ k, v, highlight = false }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-neutralx-500">{k}</span>
      <span className={`num text-sm ${highlight ? "font-semibold text-brand-600" : "text-ink-soft"}`}>{v}</span>
    </div>
  );
}

/** Loon + platformkosten = totaal excl. btw (dezelfde regels als "Snel een klus plaatsen"; de teksten staan in snel-teksten.ts). */
function KostenBlok({ teksten, meer, loon, uren, platform, totaal, className = "" }: { teksten: SnelTeksten; meer: boolean; loon: string; uren: string; platform: string; totaal: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-hair p-3 text-sm ${className}`}>
      <KostenLijst
        loonLabel={meer ? teksten.kostenLoonMeer : teksten.kostenLoon}
        platformLabel={fmt(teksten.kostenPlatform, { u: uren })}
        totaalLabel={teksten.kostenTotaal}
        loon={loon}
        platform={platform}
        totaal={totaal}
      />
      <p className="mt-2 text-xs text-neutralx-500">{teksten.kostenUitleg}</p>
    </div>
  );
}
