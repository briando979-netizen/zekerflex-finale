"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { ThuisbasisVelden, controleerThuisbasisVooraf, useThuisbasisFout } from "@/components/app/ThuisbasisVelden";
import { AUTH_DICTS, type AuthDict } from "@/lib/i18n/auth";
import { IdScan, type ScanAfronden, type ScanAfrondenOverdracht, type ScanRoute, type ScanUitslag, type ScanWijze } from "@/components/app/IdScan";
import { WieBenJijKop } from "@/components/app/WieBenJijKop";
import { WieBenJijPersoon, type PersoonStand } from "@/components/app/WieBenJijPersoon";
import { IdKeuzeKaarten } from "@/components/app/WieBenJijIdKaarten";
import { leesDatum, stappenVoor, voegNaam, type WieStap } from "@/lib/onboarding/wie-ben-jij";
import { controleerVeld, type VeldSleutel } from "@/lib/onboarding/velden";
import { OnderSheet } from "@/components/app/OnderSheet";
import { bevestigOverzicht, type OverzichtRij } from "@/lib/werker/bevestig-overzicht";

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}
interface Result {
  outcome: "verified" | "in_review" | "rejected";
  summary: string;
  kvkValid: boolean;
  companyName: string | null;
  checks: Check[];
  reasons: string[];
}

/** Foutmelding bij één veld (role="alert", gekoppeld via aria-describedby). */
function VeldFout({ veld, tekst }: { veld: VeldSleutel; tekst: string | undefined }) {
  if (!tekst) return null;
  return (
    <span id={`fout-${veld}`} role="alert" className="mt-1 block text-xs font-medium text-crit">
      {tekst}
    </span>
  );
}

export function OnboardingForm({
  defaultName,
  requireKvk = true,
  stripeIdentity = false,
  initial,
  persoon,
  beginStap,
  idKlaar = false,
  kanSluiten = true,
  laatstePoging = null,
  bsnBekend = false,
}: {
  /** stap 1 ("Hey! Wie ben jij?"): wat er al bewaard is */
  persoon: PersoonStand;
  /** de stap waar deze werker verdergaat */
  beginStap: WieStap;
  /** de identiteit is al bevestigd: dan geen ID-check meer */
  idKlaar?: boolean;
  /** de verplichte poort (lib/onboarding/werker-poort.ts) mag niet gesloten worden */
  kanSluiten?: boolean;
  /** de vorige ID-poging (uitslag en redenen), getoond in de ID-stap */
  laatstePoging?: ReactNode;
  /** het BSN is al bekend: de uitzendnoot noemt het dan niet meer */
  bsnBekend?: boolean;
  defaultName: string;
  requireKvk?: boolean;
  /** Stripe Identity staat aan en weigert niet: dan een klein linkje onder de twee keuzes (12 nov 2026). */
  stripeIdentity?: boolean;
  /** Eerder opgeslagen gegevens: iemand die later terugkomt, begint niet opnieuw. */
  initial?: { kvkNumber?: string; vatNumber?: string; postalCode?: string };
}) {
  const t = AUTH_DICTS[useI18n().locale].onb;
  const ft = useFT();
  const thuisbasisFout = useThuisbasisFout();
  const [biz, setBiz] = useState<"kvk" | "vat">(initial?.vatNumber && !initial.kvkNumber ? "vat" : "kvk");
  // per veld een foutmelding (role="alert"); gecontroleerd bij het verlaten van het veld en bij het versturen
  const [fouten, setFouten] = useState<Partial<Record<VeldSleutel, VeldSleutel>>>({});
  const [bewaard, setBewaard] = useState<string | null>(null);
  const w = ft.wie;
  const [stap, setStap] = useState<WieStap>(beginStap);
  const [persoonNu, setPersoonNu] = useState<PersoonStand>(persoon);
  // twee routes in de eigen ID-scan (Nederlands of buitenlands document), elk automatisch of zelf de foto maken; daarnaast
  // Stripe (als dat aanstaat). Geen bestandskeuze meer (13 nov 2026, eigenaar).
  const [route, setRoute] = useState<ScanRoute>("nl");
  const [wijze, setWijze] = useState<ScanWijze>("auto");
  // wat de werker verder instuurt, voor de controlestap aan het eind van de scan
  const [overzicht, setOverzicht] = useState<OverzichtRij[]>([]);
  const [scanOpen, setScanOpen] = useState(false);
  const naamNu = voegNaam(persoonNu.voornaam, persoonNu.achternaam) || defaultName;
  const stappen = stappenVoor({ idKlaar });
  const scanResult = useRef<Result | null>(null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to remount + clear the 3 capture slots
  // de vraag vóór het insturen: "Weet je zeker dat je alles hebt ingevuld?" (eigen dialoog, geen window.confirm)
  const [bevestig, setBevestig] = useState<{ m: "stripe"; rijen: OverzichtRij[] } | null>(null);
  // Een fout of "opgeslagen" staat bovenaan het formulier, de knoppen onderaan: in beeld brengen, anders lijkt er op de
  // telefoon niets te gebeuren (12 nov: in 15 van 43 sessies op Verificatie 3+ keer "Opslaan" achter elkaar).
  const meldingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || bewaard) meldingRef.current?.scrollIntoView({ block: "center" });
  }, [error, bewaard]);


  const veldFout = (k: VeldSleutel): string | undefined => (fouten[k] ? t.err[k] : undefined);
  const veldAttrs = (k: VeldSleutel) => (fouten[k] ? { "aria-invalid": true as const, "aria-describedby": `fout-${k}` } : {});

  function controleerEen(k: VeldSleutel, waarde: string) {
    const f = controleerVeld(k, waarde);
    setFouten((o) => {
      const n = { ...o };
      if (f) n[k] = f;
      else delete n[k];
      return n;
    });
  }

  /** Controleer de velden die bij deze actie horen; leeg KVK/btw mag bij "later verder". */
  function valideer(form: FormData, opties: { documenten: boolean; bedrijfOptioneel: boolean }): boolean {
    const w = (n: string) => String(form.get(n) ?? "");
    const lijst: [VeldSleutel, string][] = [];
    // in Nederland komt de postcode uit het gekozen adres (ThuisbasisVelden); een adres in het buitenland controleert ThuisbasisVelden zelf
    if ((w("country") || "NL") === "NL") lijst.unshift(["postal", w("postalCode")]);
    if (requireKvk) {
      const waarde = biz === "kvk" ? w("kvkNumber") : w("vatNumber");
      if (waarde.trim() || !opties.bedrijfOptioneel) lijst.push([biz, waarde]);
    }
    if (opties.documenten) {
      lijst.push(["docNumber", w("documentNumber")], ["expiry", w("documentExpiry")], ["name", w("nameOnDocument")]);
    }
    const nieuw: Partial<Record<VeldSleutel, VeldSleutel>> = {};
    for (const [k, v] of lijst) {
      const f = controleerVeld(k, v);
      if (f) nieuw[k] = f;
    }
    setFouten(nieuw);
    if (Object.keys(nieuw).length > 0) {
      setError(t.err.fix);
      return false;
    }
    return true;
  }

  /** "Verder" in stap 2 (strikt: het bedrijf is nodig) of "bewaar en ga later verder"; slaat het basisdeel op en doet dan `daarna`. */
  async function bewaarVoorLater(opties: { strikt?: boolean; daarna?: () => void } = {}) {
    const form = formRef.current;
    if (busy || !form) return;
    setBewaard(null);
    const bron = new FormData(form);
    if (!valideer(bron, { documenten: false, bedrijfOptioneel: !opties.strikt })) return;
    const body = new FormData();
    for (const k of ["kvkNumber", "vatNumber", "postalCode", "city", "country", "houseNumber"]) {
      const v = bron.get(k);
      if (typeof v === "string" && v.trim()) body.set(k, v);
    }
    body.set("identityMethod", "bewaren");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(thuisbasisFout(data) ?? data?.error?.message ?? t.later.failed);
      } else if (opties.daarna) {
        opties.daarna();
      } else {
        setBewaard(t.later.saved);
        router.refresh();
      }
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }

  /** De ID-scan levert foto's en documentgegevens; het basisformulier (KVK, postcode, IBAN) komt hier vandaan. */
  const afrondenViaScan: ScanAfronden = async (g) => {
    const form = formRef.current;
    if (!form) return { ok: false, fout: t.failed };
    const body = new FormData(form);
    body.set("documentType", g.documentType);
    body.set("documentNumber", g.documentNumber);
    body.set("documentExpiry", g.documentExpiry);
    body.set("nameOnDocument", g.nameOnDocument);
    body.set("documentFront", g.front);
    body.set("documentBack", g.back);
    body.set("selfie", g.selfie);
    // de tweede selfie met een gedraaid hoofd (bewegingscontrole): zonder die foto beslist altijd een medewerker
    if (g.selfie2) body.set("selfie2", g.selfie2);
    try {
      const res = await fetch("/api/onboarding", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.status === 413) return { ok: false, fout: t.tooBig };
      if (!res.ok) return { ok: false, fout: thuisbasisFout(data) ?? (data?.error?.message as string | undefined) ?? t.failed };
      scanResult.current = data as Result;
      return { ok: true, uitslag: data as Result };
    } catch {
      return { ok: false, fout: t.scan.mislukt };
    }
  };

  /** "Verder op je telefoon": het formulier gaat mee, de foto's en documentgegevens haalt de server van de telefoon. */
  const afrondenViaTelefoon: ScanAfrondenOverdracht = async () => {
    const form = formRef.current;
    if (!form) return { ok: false, fout: t.failed };
    const body = new FormData(form);
    body.set("overdracht", "1");
    try {
      const res = await fetch("/api/onboarding", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, fout: thuisbasisFout(data) ?? (data?.error?.message as string | undefined) ?? t.failed };
      scanResult.current = data as Result;
      return { ok: true, uitslag: data as Result };
    } catch {
      return { ok: false, fout: t.scan.mislukt };
    }
  };

  function sluitScan(uitslag: ScanUitslag | null) {
    setScanOpen(false);
    const r = scanResult.current;
    if (!uitslag || !r) return;
    setResult(r);
    // ook bij "in behandeling": de poort van de app (lib/onboarding/werker-poort.ts) gaat dan open
    if (r.outcome !== "rejected") setTimeout(() => router.refresh(), 1500);
  }

  /** Een van de twee routes van de ID-scan starten (eerst de velden van stap 2 en het buitenlandse adres controleren). */
  async function startScan(r: ScanRoute, wz: ScanWijze) {
    const form = formRef.current;
    if (busy || !form) return;
    setBewaard(null);
    if (!valideer(new FormData(form), { documenten: false, bedrijfOptioneel: false })) return;
    setError(null);
    scanResult.current = null;
    // een adres in het buitenland eerst controleren: anders blijkt pas ná de scan dat OSM het niet kent
    setBusy(true);
    const fout = await controleerThuisbasisVooraf(form, thuisbasisFout, t.failed);
    setBusy(false);
    if (fout) {
      setError(fout);
      return;
    }
    // alles wat de werker instuurt, voor de controlestap aan het eind van de scan (13 nov 2026, eigenaar: "alle gegevens
    // nog een keer zien en controleren voordat er ingediend wordt")
    const fd = new FormData(form);
    const veld = (n: string) => String(fd.get(n) ?? "").trim();
    const twee = (n: number) => String(n).padStart(2, "0");
    const geboren = leesDatum(persoonNu.geboortedatum);
    const rijen: OverzichtRij[] = [
      [w.persoon.voornaam, persoonNu.voornaam || "—"],
      [w.persoon.achternaam, persoonNu.achternaam || "—"],
      [w.persoon.geboortedatum, geboren ? `${twee(geboren.dag)}-${twee(geboren.maand)}-${geboren.jaar}` : "—"],
      [w.persoon.telefoon, [persoonNu.landnummer, persoonNu.telefoon].filter(Boolean).join(" ") || "—"],
    ];
    if (requireKvk) {
      const nr = veld(biz === "kvk" ? "kvkNumber" : "vatNumber");
      if (nr) rijen.push([biz === "kvk" ? t.kvkLabel : t.vatLabel, nr]);
    }
    const plaats = [veld("postalCode"), veld("city")].filter(Boolean).join(" ");
    if (plaats) rijen.push([ft.bevestig.postcode, plaats]);
    setOverzicht(rijen);
    setRoute(r);
    setWijze(wz);
    setScanOpen(true);
  }

  /**
   * Stripe: versturen naar dezelfde route als altijd. Eerst controleren, dan een overzicht tonen en vragen of alles is
   * ingevuld; pas na "Ja, insturen" (bevestigd = true) gaat het echt weg.
   */
  async function verstuur(m: "stripe", bevestigd = false) {
    const form = formRef.current;
    if (busy || !form) return;
    setBewaard(null);
    if (!valideer(new FormData(form), { documenten: false, bedrijfOptioneel: false })) return;
    setError(null);
    const body = new FormData(form);
    body.set("identityMethod", "stripe");
    if (!bevestigd) {
      setBevestig({
        m,
        rijen: bevestigOverzicht({
          methode: m,
          veld: (n) => String(body.get(n) ?? ""),
          labels: { naam: t.nameOnDoc, soort: t.docType, nummer: t.docNumber, geldigTot: t.validUntil, kvk: t.kvkLabel, btw: t.vatLabel, postcode: ft.bevestig.postcode, fotos: ft.bevestig.fotos, methode: ft.bevestig.methode },
          soortNaam: "",
          bedrijf: requireKvk ? biz : null,
          fotoNamen: [],
          viaStripe: ft.bevestig.viaStripe,
        }),
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.status === 413) {
        setError(t.tooBig);
      } else if (!res.ok) {
        setError(thuisbasisFout(data) ?? data?.error?.message ?? t.failed);
      } else if (data.redirectUrl) {
        window.location.href = data.redirectUrl as string;
        return;
      } else {
        setResult(data as Result);
        if (data.outcome !== "rejected") setTimeout(() => router.refresh(), 1500);
      }
    } catch {
      setError(t.offline);
    } finally {
      setBusy(false);
    }
  }

  /** Enter in een veld: in stap 2 is dat "Verder". */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stap === "woon") void naVolgende();
  }

  function naVolgende() {
    return bewaarVoorLater({
      strikt: true,
      // ID al af: dan is dit "Opslaan"; laat zien dat het gelukt is (vroeger alleen een stille refresh)
      daarna: () => {
        if (stappen.includes("id")) {
          setStap("id");
        } else {
          setBewaard(t.later.savedKlaar);
          router.refresh();
        }
      },
    });
  }

  function terug() {
    const i = stappen.indexOf(stap);
    if (i > 0) {
      setError(null);
      setStap(stappen[i - 1] ?? "persoon");
    } else router.push("/dashboard");
  }

  if (result) {
    const tone =
      result.outcome === "verified"
        ? { pill: "pill-ok", label: t.verified, ring: "border-ok/30 bg-ok/5" }
        : result.outcome === "rejected"
          ? { pill: "pill-crit", label: t.rejected, ring: "border-crit/30 bg-crit/5" }
          : { pill: "pill-warn", label: t.inReview, ring: "border-warn/30 bg-warn/5" };

    return (
      <div className="space-y-5">
        <div className={`card p-6 ${tone.ring}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t.result}</h2>
            <span className={tone.pill}>{tone.label}</span>
          </div>
          <p className="mt-2 text-sm text-ink-soft">{result.summary}</p>
          {result.companyName && (
            <p className="mt-1 text-xs text-neutralx-500">
              {t.company}: {result.companyName} · {result.kvkValid ? t.validated : t.notValidated}
            </p>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">{t.checks}</div>
          <ul className="divide-y divide-hair">
            {result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[11px] ${
                    c.ok ? "bg-ok text-white" : "bg-crit text-white"
                  }`}
                >
                  {c.ok ? "✓" : "!"}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{c.label}</p>
                  <p className="text-xs text-neutralx-500">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {result.outcome !== "verified" && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                formRef.current?.reset();
                setAttempt((a) => a + 1);
              }}
              className="btn-primary"
            >
              {t.retry}
            </button>
            <a href="mailto:support@zekerflex.com" className="btn-ghost">
              {t.help}
            </a>
          </div>
        )}
        {result.outcome === "verified" && (
          <button type="button" onClick={() => router.refresh()} className="btn-primary">
            {t.toDashboard}
          </button>
        )}
      </div>
    );
  }

  const kopTitel = stap === "persoon" ? w.persoon.kop : stap === "woon" ? (requireKvk ? w.woon.kopBedrijf : w.woon.kop) : w.id.kop;
  const kopUitleg = stap === "persoon" ? w.persoon.uitleg : undefined;

  return (
    <section className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-hair bg-white shadow-sm">
      <WieBenJijKop
        titel={kopTitel}
        uitleg={kopUitleg}
        aantal={stappen.length}
        huidig={Math.max(0, stappen.indexOf(stap))}
        teksten={w}
        onTerug={terug}
        onSluit={kanSluiten ? () => router.push("/dashboard") : undefined}
      />
      <div id="id-stap" tabIndex={-1} className="relative -mt-5 scroll-mt-4 rounded-t-3xl bg-white px-5 pb-6 pt-6 focus:outline-none">
        {stap === "persoon" && (
          <WieBenJijPersoon
            begin={persoonNu}
            onKlaar={(stand) => {
              setPersoonNu(stand);
              setStap("woon");
            }}
          />
        )}

        <OnderSheet open={bevestig !== null} titelId="bevestig-insturen-titel" beschrijvingId="bevestig-insturen-uitleg" titel={ft.bevestig.titel} onSluit={() => setBevestig(null)}>
          {bevestig && (
            <div className="overflow-y-auto px-6 pb-6">
              <p id="bevestig-insturen-uitleg" className="text-center text-sm leading-relaxed text-neutralx-600">{ft.bevestig.uitleg}</p>
              <dl className="mt-4 divide-y divide-hair rounded-xl border border-hair text-sm">
                {bevestig.rijen.map(([label, waarde]) => (
                  <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                    <dt className="text-neutralx-500">{label}</dt>
                    <dd className="break-words text-right font-medium text-ink">{waarde}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => setBevestig(null)} className="btn-ghost min-h-[44px] flex-1">
                  {ft.bevestig.terug}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const m = bevestig.m;
                    setBevestig(null);
                    void verstuur(m, true);
                  }}
                  className="btn-trust min-h-[44px] flex-1 disabled:opacity-60"
                >
                  {ft.bevestig.ja}
                </button>
              </div>
            </div>
          )}
        </OnderSheet>

        <form ref={formRef} onSubmit={onSubmit} noValidate className={`space-y-6 ${stap === "persoon" ? "hidden" : ""}`}>
          {(error || bewaard) && (
            <div ref={meldingRef} className="space-y-2">
              {error && <p role="alert" className="rounded-xl bg-crit/10 px-3 py-2.5 text-sm text-crit">{error}</p>}
              {bewaard && <p role="status" className="rounded-xl bg-ok/10 px-3 py-2.5 text-sm text-ok">{bewaard}</p>}
            </div>
          )}

          {/* stap 2: het bedrijf (zzp, flexwerker) en waar je woont; blijft in de pagina staan zodat de velden hun waarde houden */}
          <div hidden={stap !== "woon"} className="space-y-6">
            {requireKvk && (
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-ink">{t.business}</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.regKind}>
                  {(
                    [
                      ["kvk", ...t.kvk],
                      ["vat", ...t.vat],
                    ] as const
                  ).map(([k, title, sub]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={biz === k}
                      onClick={() => setBiz(k)}
                      className={`rounded-xl border px-3 py-2.5 text-left ${biz === k ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}
                    >
                      <span className="block text-sm font-semibold text-ink">{title}</span>
                      <span className="block text-xs text-neutralx-500">{sub}</span>
                    </button>
                  ))}
                </div>
                {biz === "kvk" ? (
                  <label className="block">
                    <span className="field-label">{t.kvkLabel}</span>
                    <input
                      key="kvk"
                      name="kvkNumber"
                      required
                      aria-required="true"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="12345678"
                      defaultValue={initial?.kvkNumber ?? ""}
                      onBlur={(e) => controleerEen("kvk", e.target.value)}
                      {...veldAttrs("kvk")}
                      className="field-input"
                    />
                    <VeldFout veld="kvk" tekst={veldFout("kvk")} />
                    <span className="mt-1 block text-xs text-neutralx-400">{t.kvkHint}</span>
                  </label>
                ) : (
                  <label className="block">
                    <span className="field-label">{t.vatLabel}</span>
                    <input
                      key="vat"
                      name="vatNumber"
                      required
                      aria-required="true"
                      placeholder="PL1234567890"
                      autoCapitalize="characters"
                      autoComplete="off"
                      defaultValue={initial?.vatNumber ?? ""}
                      onBlur={(e) => controleerEen("vat", e.target.value)}
                      {...veldAttrs("vat")}
                      className="field-input"
                    />
                    <VeldFout veld="vat" tekst={veldFout("vat")} />
                    <span className="mt-1 block text-xs text-neutralx-400">{t.vatHint}</span>
                  </label>
                )}
                {/* zonder KVK: de werkvorm Uitzendkracht (13 nov: flexwerker gekozen en dan verrast door de KVK-vraag) */}
                <p className="text-xs leading-relaxed text-neutralx-500">
                  {t.geenKvk}{" "}
                  <Link href="/dashboard/fiscaal" className="font-semibold text-brand-700 underline">
                    {t.geenKvkLink}
                  </Link>
                </p>
              </fieldset>
            )}

            {!requireKvk && (
              <p className="rounded-lg border border-hair bg-paper-soft px-3 py-2.5 text-xs leading-relaxed text-neutralx-500">
                {bsnBekend ? t.uitzendNoteZonderBsn : t.uitzendNote}
              </p>
            )}

            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-ink">{t.home}</legend>
              <ThuisbasisVelden postcodeLabel={t.postal} begin={initial?.postalCode} fout={fouten.postal ? ft.thuisbasis.kiesAdres : undefined} />
            </fieldset>

            <button type="button" onClick={() => void naVolgende()} disabled={busy} className="btn-primary w-full">
              {busy ? t.later.busy : stappen.includes("id") ? w.woon.verder : w.woon.opslaanKlaar}
            </button>
            <div className="border-t border-hair pt-4">
              <button type="button" onClick={() => void bewaarVoorLater()} disabled={busy} className="btn-ghost w-full sm:w-auto">
                {busy ? t.later.busy : t.later.button}
              </button>
              <p className="mt-2 text-xs leading-relaxed text-neutralx-500">{t.later.hint}</p>
            </div>
          </div>

          {/* stap 3: de ID-check */}
          <div hidden={stap !== "id"} className="space-y-5" key={attempt}>
            {laatstePoging}
            <IdKeuzeKaarten
              w={w.id}
              busy={busy}
              onStart={(r, wz) => void startScan(r, wz)}
              stripe={
                stripeIdentity ? (
                  <button type="button" onClick={() => void verstuur("stripe")} disabled={busy} className="text-sm font-semibold text-brand-600 underline underline-offset-4 disabled:opacity-60">
                    {w.id.stripeLink}
                  </button>
                ) : null
              }
            />
            <div className="border-t border-hair pt-4">
              <button type="button" onClick={() => void bewaarVoorLater()} disabled={busy} className="btn-ghost w-full sm:w-auto">
                {busy ? t.later.busy : t.later.button}
              </button>
              <p className="mt-2 text-xs leading-relaxed text-neutralx-500">{t.later.hint}</p>
            </div>
            <p className="text-xs leading-relaxed text-neutralx-400">{t.uploadNote}</p>
          </div>
        </form>
        {scanOpen && <IdScan t={t} naam={naamNu} route={route} wijze={wijze} overzicht={overzicht} onAfronden={afrondenViaScan} onAfrondenOverdracht={afrondenViaTelefoon} onSluiten={sluitScan} />}
      </div>
    </section>
  );
}
