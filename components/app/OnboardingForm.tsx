"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { ThuisbasisVelden, controleerThuisbasisVooraf, useThuisbasisFout } from "@/components/app/ThuisbasisVelden";
import { AUTH_DICTS, fill, type AuthDict } from "@/lib/i18n/auth";
import { DocumentLezing, leesDocumentFoto, type Lezing } from "@/components/app/DocumentLezing";
import { IdScan, type ScanAfronden, type ScanAfrondenOverdracht, type ScanRoute, type ScanUitslag } from "@/components/app/IdScan";
import { WieBenJijKop } from "@/components/app/WieBenJijKop";
import { WieBenJijPersoon, type PersoonStand } from "@/components/app/WieBenJijPersoon";
import { IdKeuzeKaarten } from "@/components/app/WieBenJijIdKaarten";
import { stappenVoor, voegNaam, type WieStap } from "@/lib/onboarding/wie-ben-jij";
import { controleerVeld, type VeldSleutel } from "@/lib/onboarding/velden";
import { heeftAchterkant } from "@/lib/kyc/document-zijden";
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

/**
 * Shrink a phone photo before upload: max 1600 px, JPEG ~0.82. A 4–8 MB camera
 * photo becomes ~250–400 kB — three of them used to exceed the 4.5 MB request
 * limit on the hosting platform, so the upload silently failed. Falls back to
 * the original file if the browser can't decode it.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 450_000) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size === 0) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
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

/** One photo — front, back, or selfie. Camera OR gallery (no forced camera);
 * the (compressed) file is handed to the parent, which checks completeness. */
function CaptureSlot({
  label,
  hint,
  round = false,
  missing = false,
  onPick,
  t,
}: {
  label: string;
  hint: string;
  round?: boolean;
  missing?: boolean;
  onPick: (file: File) => void;
  t: AuthDict["onb"];
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <div>
      <span className="field-label">{label}</span>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`mt-1.5 flex w-full items-center gap-3 border border-dashed px-3 py-3 text-left transition hover:border-brand-500 ${
          missing ? "border-crit bg-crit/5" : "border-hairstrong"
        } ${round ? "rounded-full" : "rounded-lg"}`}
      >
        <span
          className={`grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden bg-paper-soft ${
            round ? "rounded-full" : "rounded-md"
          }`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <CameraIcon />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">
            {busy ? t.processing : preview ? t.replace : t.pick}
          </span>
          <span className="block truncate text-xs text-neutralx-400">{hint}</span>
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          const small = await compressImage(f);
          setBusy(false);
          onPick(small);
          setPreview((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(small);
          });
        }}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="text-neutralx-400">
      <path
        d="M4 7h3l1.5-2h7L17 7h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

type PhotoKey = "documentFront" | "documentBack" | "selfie" | "selfie2";
type DocKey = "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";

export function OnboardingForm({
  defaultName,
  requireKvk = true,
  stripeIdentity = false,
  initial,
  persoon,
  beginStap,
  idKlaar = false,
  kanSluiten = true,
}: {
  /** stap 1 ("Hey! Wie ben jij?"): wat er al bewaard is */
  persoon: PersoonStand;
  /** de stap waar deze werker verdergaat */
  beginStap: WieStap;
  /** de identiteit is al bevestigd: dan geen ID-check meer */
  idKlaar?: boolean;
  /** de verplichte poort (lib/onboarding/werker-poort.ts) mag niet gesloten worden */
  kanSluiten?: boolean;
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
  // twee routes in de eigen ID-scan (Nederlands of buitenlands document); daarnaast Stripe (als dat aanstaat) en zelf foto's uploaden
  const [uploadOpen, setUploadOpen] = useState(false);
  const [route, setRoute] = useState<ScanRoute>("nl");
  const [scanOpen, setScanOpen] = useState(false);
  const naamNu = voegNaam(persoonNu.voornaam, persoonNu.achternaam) || defaultName;
  const stappen = stappenVoor({ idKlaar });
  const scanResult = useRef<Result | null>(null);
  const photos = useRef<Partial<Record<PhotoKey, File>>>({});
  const [missing, setMissing] = useState<PhotoKey[]>([]);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to remount + clear the 3 capture slots
  const [docType, setDocType] = useState<DocKey>("ID_CARD");
  const [lezing, setLezing] = useState<Lezing | null>(null);
  // de vraag vóór het insturen: "Weet je zeker dat je alles hebt ingevuld?" (eigen dialoog, geen window.confirm)
  const [bevestig, setBevestig] = useState<{ m: "stripe" | "upload"; rijen: OverzichtRij[] } | null>(null);
  const lezingNr = useRef(0); // een oud antwoord mag een nieuwer niet overschrijven

  /** De MRZ staat bij een ID-kaart op de achterkant, bij een paspoort op de pasfotozijde; een rijbewijs heeft er geen. */
  const mrzFoto = (soort: DocKey): PhotoKey | null => (soort === "PASSPORT" ? "documentFront" : soort === "ID_CARD" ? "documentBack" : null);

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

  function zetVeld(name: string, value: string) {
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement) el.value = value;
  }

  async function leesDocument(file: File) {
    const nr = ++lezingNr.current;
    setLezing({ status: "bezig" });
    const l = await leesDocumentFoto(file, t);
    if (nr !== lezingNr.current) return;
    setLezing(l);
    // goed gelezen en niet verlopen: nummer en datum van het document zelf invullen
    if (l.status === "klaar" && l.geldig && !l.verlopen) {
      if (l.documentnummer) zetVeld("documentNumber", l.documentnummer);
      if (l.vervaldatum) zetVeld("documentExpiry", l.vervaldatum);
      if (l.soort === "PASSPORT" || l.soort === "ID_CARD") setDocType(l.soort);
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

  function kiesFoto(k: PhotoKey, f: File) {
    photos.current[k] = f;
    setMissing((m) => m.filter((x) => x !== k));
    if (mrzFoto(docType) === k) void leesDocument(f);
  }

  function kiesSoort(soort: DocKey) {
    setDocType(soort);
    lezingNr.current++;
    const k = mrzFoto(soort);
    const f = k ? photos.current[k] : undefined;
    if (f) void leesDocument(f);
    else setLezing(null);
  }

  /** Een van de twee routes van de ID-scan starten (eerst de velden van stap 2 en het buitenlandse adres controleren). */
  async function startScan(r: ScanRoute) {
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
    setRoute(r);
    setScanOpen(true);
  }

  /**
   * Stripe of zelf foto's uploaden: versturen naar dezelfde route als altijd. Eerst controleren, dan een overzicht tonen en
   * vragen of alles is ingevuld; pas na "Ja, insturen" (bevestigd = true) gaat het echt weg.
   */
  async function verstuur(m: "stripe" | "upload", bevestigd = false) {
    const form = formRef.current;
    if (busy || !form) return;
    setBewaard(null);
    if (!valideer(new FormData(form), { documenten: m === "upload", bedrijfOptioneel: false })) return;
    setError(null);
    const body = new FormData(form);
    let fotoNamen: string[] = [];
    if (m === "upload") {
      // een paspoort heeft geen achterkant: dan alleen de fotopagina en de selfie (12 nov 2026)
      const paspoort = !heeftAchterkant(docType);
      // de selfie met een gedraaid hoofd is hier niet verplicht: met zelf gekozen foto's kijkt altijd een medewerker mee
      // (geen live camera; lib/onboarding/auto-redenen.ts), en die foto helpt hem wel
      const nodig: PhotoKey[] = paspoort ? ["documentFront", "selfie"] : ["documentFront", "documentBack", "selfie"];
      const absent = nodig.filter((k) => !photos.current[k]);
      setMissing(absent);
      if (absent.length) {
        const names = absent.map((k) => t.missingNames[k]);
        setError(fill(t.missing, { list: names.length > 1 ? `${names.slice(0, -1).join(", ")} ${t.and} ${names.at(-1)}` : names[0]! }));
        return;
      }
      fotoNamen = nodig.map((k) => t.missingNames[k]);
      for (const k of nodig) body.set(k, photos.current[k]!);
      if (photos.current.selfie2) body.set("selfie2", photos.current.selfie2);
      // de server wil twee beelden van het document: bij een paspoort dient de fotopagina ook als tweede (zoals in de ID-scan)
      if (paspoort) body.set("documentBack", photos.current.documentFront!);
    } else {
      body.set("identityMethod", "stripe");
    }
    if (!bevestigd) {
      setBevestig({
        m,
        rijen: bevestigOverzicht({
          methode: m,
          veld: (n) => String(body.get(n) ?? ""),
          labels: { naam: t.nameOnDoc, soort: t.docType, nummer: t.docNumber, geldigTot: t.validUntil, kvk: t.kvkLabel, btw: t.vatLabel, postcode: ft.bevestig.postcode, fotos: ft.bevestig.fotos, methode: ft.bevestig.methode },
          soortNaam: t.docs[docType],
          bedrijf: requireKvk ? biz : null,
          fotoNamen,
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

  /** Enter in een veld: in stap 2 is dat "Verder", bij het uploaden "Foto's insturen". */
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (stap === "woon") void naVolgende();
    else if (stap === "id" && uploadOpen) void verstuur("upload");
  }

  function naVolgende() {
    return bewaarVoorLater({ strikt: true, daarna: () => (stappen.includes("id") ? setStap("id") : router.refresh()) });
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
                photos.current = {};
                setMissing([]);
                setLezing(null);
                lezingNr.current++;
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
  const uploadSoorten = Object.entries(t.docs).filter(([v]) => v !== "DRIVERS_LICENSE");

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
      <div className="relative -mt-5 rounded-t-3xl bg-white px-5 pb-6 pt-6">
        {stap === "persoon" && (
          <WieBenJijPersoon
            begin={persoonNu}
            onKlaar={(stand) => {
              setPersoonNu(stand);
              setStap("woon");
            }}
          />
        )}

        <OnderSheet open={bevestig !== null} titelId="bevestig-insturen-titel" titel={ft.bevestig.titel} onSluit={() => setBevestig(null)}>
          {bevestig && (
            <div className="overflow-y-auto px-6 pb-6">
              <p className="text-center text-sm leading-relaxed text-neutralx-600">{ft.bevestig.uitleg}</p>
              <dl className="mt-4 divide-y divide-hair rounded-xl border border-hair text-sm">
                {bevestig.rijen.map(([label, waarde]) => (
                  <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                    <dt className="text-neutralx-500">{label}</dt>
                    <dd className="break-words text-right font-medium text-ink">{waarde}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 flex gap-2">
                <button type="button" onClick={() => setBevestig(null)} className="btn-ghost flex-1">
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
                  className="btn-trust flex-1 disabled:opacity-60"
                >
                  {ft.bevestig.ja}
                </button>
              </div>
            </div>
          )}
        </OnderSheet>

        <form ref={formRef} onSubmit={onSubmit} noValidate className={`space-y-6 ${stap === "persoon" ? "hidden" : ""}`}>
          {error && (
            <p role="alert" className="rounded-xl bg-crit/10 px-3 py-2.5 text-sm text-crit">{error}</p>
          )}
          {bewaard && (
            <p role="status" className="rounded-xl bg-ok/10 px-3 py-2.5 text-sm text-ok">{bewaard}</p>
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
              </fieldset>
            )}

            {!requireKvk && (
              <p className="rounded-lg border border-hair bg-paper-soft px-3 py-2.5 text-xs leading-relaxed text-neutralx-500">
                {t.uitzendNote}
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
            <IdKeuzeKaarten
              w={w.id}
              busy={busy}
              onStart={(r) => void startScan(r)}
              zelfOpen={uploadOpen}
              onZelf={() => setUploadOpen((o) => !o)}
              stripe={
                stripeIdentity ? (
                  <button type="button" onClick={() => void verstuur("stripe")} disabled={busy} className="text-sm font-semibold text-brand-600 underline underline-offset-4 disabled:opacity-60">
                    {w.id.stripeLink}
                  </button>
                ) : null
              }
              zelf={
                uploadOpen && (
                <div>
                  {uploadOpen && (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="field-label">{t.docType}</span>
                          <select name="documentType" required value={docType} onChange={(e) => kiesSoort(e.target.value as DocKey)} className="field-input">
                            {uploadSoorten.map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="field-label">{t.docNumber}</span>
                          <input
                            name="documentNumber"
                            required
                            aria-required="true"
                            placeholder="SPECI2014"
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            onBlur={(e) => controleerEen("docNumber", e.target.value)}
                            {...veldAttrs("docNumber")}
                            className="field-input"
                          />
                          <VeldFout veld="docNumber" tekst={veldFout("docNumber")} />
                        </label>
                        <label className="block">
                          <span className="field-label">{t.validUntil}</span>
                          <input
                            type="date"
                            name="documentExpiry"
                            required
                            aria-required="true"
                            autoComplete="off"
                            onBlur={(e) => controleerEen("expiry", e.target.value)}
                            {...veldAttrs("expiry")}
                            className="field-input"
                          />
                          <VeldFout veld="expiry" tekst={veldFout("expiry")} />
                        </label>
                        <label className="block">
                          <span className="field-label">{t.nameOnDoc}</span>
                          <input
                            name="nameOnDocument"
                            required
                            aria-required="true"
                            autoComplete="name"
                            defaultValue={naamNu}
                            onBlur={(e) => controleerEen("name", e.target.value)}
                            {...veldAttrs("name")}
                            className="field-input"
                          />
                          <VeldFout veld="name" tekst={veldFout("name")} />
                        </label>
                      </div>
                      <p className="text-xs leading-relaxed text-neutralx-500">{heeftAchterkant(docType) ? t.photosInfo : t.photosInfoPaspoort}</p>
                      <div className={`grid gap-3 ${heeftAchterkant(docType) ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
                        <CaptureSlot t={t} label={t.front[0]} hint={t.front[1]} missing={missing.includes("documentFront")} onPick={(f) => kiesFoto("documentFront", f)} />
                        {/* een paspoort heeft geen achterkant */}
                        {heeftAchterkant(docType) && (
                          <CaptureSlot t={t} label={t.back[0]} hint={t.back[1]} missing={missing.includes("documentBack")} onPick={(f) => kiesFoto("documentBack", f)} />
                        )}
                        <CaptureSlot t={t} label={t.selfie[0]} hint={t.selfie[1]} round missing={missing.includes("selfie")} onPick={(f) => kiesFoto("selfie", f)} />
                        {/* de selfie met een gedraaid hoofd (bewegingscontrole), zoals in de scan */}
                        <CaptureSlot t={t} label={t.selfie2[0]} hint={t.selfie2[1]} round missing={missing.includes("selfie2")} onPick={(f) => kiesFoto("selfie2", f)} />
                      </div>
                      {lezing && <DocumentLezing lezing={lezing} t={t} />}
                      <button type="button" onClick={() => void verstuur("upload")} disabled={busy} className="btn-trust w-full">
                        {busy ? t.checkingBusy : t.submit}
                      </button>
                    </div>
                  )}
                </div>
                )
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
        {scanOpen && <IdScan t={t} naam={naamNu} route={route} onAfronden={afrondenViaScan} onAfrondenOverdracht={afrondenViaTelefoon} onSluiten={sluitScan} />}
      </div>
    </section>
  );
}
