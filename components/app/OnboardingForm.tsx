"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { IbanCodeVeld } from "@/components/app/IbanCodeVeld";
import { ThuisbasisVelden, controleerThuisbasisVooraf, useThuisbasisFout } from "@/components/app/ThuisbasisVelden";
import { ibanCodeBericht, isIbanCodeFout } from "@/lib/fiscal/iban-code-teksten";
import { AUTH_DICTS, fill, type AuthDict } from "@/lib/i18n/auth";
import { DocumentLezing, leesDocumentFoto, type Lezing } from "@/components/app/DocumentLezing";
import { IdScan, type ScanAfronden, type ScanAfrondenOverdracht, type ScanUitslag } from "@/components/app/IdScan";
import { controleerVeld, type VeldSleutel } from "@/lib/onboarding/velden";

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

type PhotoKey = "documentFront" | "documentBack" | "selfie";
type DocKey = "PASSPORT" | "ID_CARD" | "DRIVERS_LICENSE";

export function OnboardingForm({
  defaultName,
  requireKvk = true,
  stripeIdentity = false,
  initial,
}: {
  defaultName: string;
  requireKvk?: boolean;
  /** Stripe Identity is switched on: offer the Stripe camera flow (recommended) */
  stripeIdentity?: boolean;
  /** Eerder opgeslagen gegevens: iemand die later terugkomt, begint niet opnieuw. */
  initial?: { kvkNumber?: string; vatNumber?: string; postalCode?: string; payoutIban?: string };
}) {
  const t = AUTH_DICTS[useI18n().locale].onb;
  const ft = useFT();
  const thuisbasisFout = useThuisbasisFout();
  // Een gewijzigd IBAN vraagt een code (mail of verificatie-app): het veld verschijnt na de eerste 423.
  const [ibanCode, setIbanCode] = useState("");
  const [codeMelding, setCodeMelding] = useState<string | null>(null);
  const zonderCode = useRef(false); // "Stuur code": opnieuw versturen zonder de oude code
  const [biz, setBiz] = useState<"kvk" | "vat">(initial?.vatNumber && !initial.kvkNumber ? "vat" : "kvk");
  // per veld een foutmelding (role="alert"); gecontroleerd bij het verlaten van het veld en bij het versturen
  const [fouten, setFouten] = useState<Partial<Record<VeldSleutel, VeldSleutel>>>({});
  const [bewaard, setBewaard] = useState<string | null>(null);
  // drie manieren: Stripe (als dat aanstaat), de ID-scan van ZekerFlex, of zelf foto's uploaden
  const [method, setMethod] = useState<"stripe" | "zekerflex" | "upload">(stripeIdentity ? "stripe" : "zekerflex");
  const [scanOpen, setScanOpen] = useState(false);
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
    const lijst: [VeldSleutel, string][] = [["iban", w("payoutIban")]];
    // het NL-postcodeformaat geldt alleen in Nederland; een adres in het buitenland controleert ThuisbasisVelden zelf
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

  async function bewaarVoorLater() {
    const form = formRef.current;
    if (busy || !form) return;
    setBewaard(null);
    const bron = new FormData(form);
    if (!valideer(bron, { documenten: false, bedrijfOptioneel: true })) return;
    const body = new FormData();
    for (const k of ["kvkNumber", "vatNumber", "postalCode", "houseNumber", "payoutIban", "ibanCode"]) {
      const v = bron.get(k);
      if (typeof v === "string" && v.trim()) body.set(k, v);
    }
    if (zonderCode.current) body.delete("ibanCode");
    zonderCode.current = false;
    body.set("identityMethod", "bewaren");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && isIbanCodeFout(res.status, data?.error?.code)) {
        setIbanCode("");
        setCodeMelding(ibanCodeBericht(data.error.code, ft.ibanCode, data.error.message));
      } else if (!res.ok) {
        setError(data?.error?.message ?? t.later.failed);
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBewaard(null);
    if (!valideer(new FormData(e.currentTarget), { documenten: method === "upload", bedrijfOptioneel: false })) return;
    setError(null);
    if (method === "zekerflex") {
      setError(null);
      scanResult.current = null;
      // een adres in het buitenland eerst controleren: anders blijkt pas ná de scan dat OSM het niet kent
      const formulier = e.currentTarget;
      setBusy(true);
      const fout = await controleerThuisbasisVooraf(formulier, thuisbasisFout, t.failed);
      setBusy(false);
      if (fout) {
        setError(fout);
        return;
      }
      setScanOpen(true);
      return;
    }
    const body = new FormData(e.currentTarget);
    if (zonderCode.current) body.delete("ibanCode");
    zonderCode.current = false;
    if (method === "upload") {
      const absent = (["documentFront", "documentBack", "selfie"] as PhotoKey[]).filter((k) => !photos.current[k]);
      setMissing(absent);
      if (absent.length) {
        const names = absent.map((k) => t.missingNames[k]);
        setError(fill(t.missing, { list: names.length > 1 ? `${names.slice(0, -1).join(", ")} ${t.and} ${names.at(-1)}` : names[0]! }));
        return;
      }
      for (const k of Object.keys(photos.current) as PhotoKey[]) body.set(k, photos.current[k]!);
    } else {
      body.set("identityMethod", "stripe");
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.status === 413) {
        setError(t.tooBig);
      } else if (!res.ok && isIbanCodeFout(res.status, data?.error?.code)) {
        setIbanCode("");
        setCodeMelding(ibanCodeBericht(data.error.code, ft.ibanCode, data.error.message));
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

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-8">
      {error && (
        <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{error}</p>
      )}
      {bewaard && (
        <p role="status" className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">{bewaard}</p>
      )}

      {requireKvk && (
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-ink">1. {t.business}</legend>
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
        <legend className="text-sm font-semibold text-ink">
          {requireKvk ? "2." : "1."} {t.home}
        </legend>
        <ThuisbasisVelden postcodeLabel={t.postal} />
        <label className="block">
          <span className="field-label">{t.iban}</span>
          <input
            name="payoutIban"
            required
            aria-required="true"
            placeholder="NL00 BANK 0000 0000 00"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            defaultValue={initial?.payoutIban ?? ""}
            onBlur={(e) => controleerEen("iban", e.target.value)}
            {...veldAttrs("iban")}
            className="field-input"
          />
          <VeldFout veld="iban" tekst={veldFout("iban")} />
        </label>
        {codeMelding && (
          <IbanCodeVeld
            name="ibanCode"
            texts={ft.ibanCode}
            melding={codeMelding}
            value={ibanCode}
            onChange={setIbanCode}
            onResend={() => {
              zonderCode.current = true;
              formRef.current?.requestSubmit();
            }}
            busy={busy}
          />
        )}
      </fieldset>

      <fieldset className="space-y-4" key={attempt}>
        <legend className="text-sm font-semibold text-ink">
          {requireKvk ? "3." : "2."} {t.identity}
        </legend>
        <div className={`grid gap-2 ${stripeIdentity ? "sm:grid-cols-3" : "sm:grid-cols-2"}`} role="radiogroup" aria-label={t.howIdentity}>
          {(
            [
              ...(stripeIdentity ? [["stripe", ...t.stripe] as const] : []),
              ["zekerflex", ...t.scan.optie] as const,
              ["upload", ...t.upload] as const,
            ]
          ).map(([k, title, sub]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={method === k}
              onClick={() => setMethod(k)}
              className={`rounded-xl border px-3 py-2.5 text-left ${method === k ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}
            >
              <span className="block text-sm font-semibold text-ink">{title}</span>
              <span className="block text-xs text-neutralx-500">{sub}</span>
            </button>
          ))}
        </div>
        {method === "stripe" || method === "zekerflex" ? (
          <p className="rounded-lg bg-paper-soft px-3 py-2.5 text-xs leading-relaxed text-neutralx-600">
            {method === "stripe" ? t.stripeInfo : t.scan.info}
          </p>
        ) : (
        <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">{t.docType}</span>
            <select name="documentType" required value={docType} onChange={(e) => kiesSoort(e.target.value as DocKey)} className="field-input">
              {Object.entries(t.docs).map(([v, l]) => (
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
          {docType === "DRIVERS_LICENSE" && (
            // een rijbewijs mag voor het account; voor betaald werk volgt nog een ID (lib/werkrecht)
            <p role="note" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm leading-relaxed text-ink sm:col-span-2">
              {t.scan.rijbewijsUitleg}
            </p>
          )}
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
              defaultValue={defaultName}
              onBlur={(e) => controleerEen("name", e.target.value)}
              {...veldAttrs("name")}
              className="field-input"
            />
            <VeldFout veld="name" tekst={veldFout("name")} />
          </label>
        </div>

        <p className="text-xs leading-relaxed text-neutralx-500">
          {t.photosInfo}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <CaptureSlot t={t} label={t.front[0]} hint={t.front[1]} missing={missing.includes("documentFront")} onPick={(f) => kiesFoto("documentFront", f)} />
          <CaptureSlot t={t} label={t.back[0]} hint={t.back[1]} missing={missing.includes("documentBack")} onPick={(f) => kiesFoto("documentBack", f)} />
          <CaptureSlot t={t} label={t.selfie[0]} hint={t.selfie[1]} round missing={missing.includes("selfie")} onPick={(f) => kiesFoto("selfie", f)} />
        </div>
        {lezing && <DocumentLezing lezing={lezing} t={t} />}
        </>
        )}
      </fieldset>

      <button type="submit" disabled={busy} className="btn-trust w-full">
        {busy ? (method === "stripe" ? t.toStripe : t.checkingBusy) : method === "zekerflex" ? t.scan.starten : t.submit}
      </button>
      <div className="border-t border-hair pt-4">
        <button type="button" onClick={() => void bewaarVoorLater()} disabled={busy} className="btn-ghost w-full sm:w-auto">
          {busy ? t.later.busy : t.later.button}
        </button>
        <p className="mt-2 text-xs leading-relaxed text-neutralx-500">{t.later.hint}</p>
      </div>
      <p className="text-xs leading-relaxed text-neutralx-400">
        {method === "stripe" ? t.stripeNote : t.uploadNote}
      </p>
      {scanOpen && <IdScan t={t} naam={defaultName} onAfronden={afrondenViaScan} onAfrondenOverdracht={afrondenViaTelefoon} onSluiten={sluitScan} />}
    </form>
  );
}
