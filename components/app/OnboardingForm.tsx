"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { AUTH_DICTS, fill, type AuthDict } from "@/lib/i18n/auth";

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

export function OnboardingForm({
  defaultName,
  requireKvk = true,
  stripeIdentity = false,
}: {
  defaultName: string;
  requireKvk?: boolean;
  /** Stripe Identity is switched on: offer the Stripe camera flow (recommended) */
  stripeIdentity?: boolean;
}) {
  const t = AUTH_DICTS[useI18n().locale].onb;
  const [biz, setBiz] = useState<"kvk" | "vat">("kvk");
  const [method, setMethod] = useState<"stripe" | "upload">(stripeIdentity ? "stripe" : "upload");
  const photos = useRef<Partial<Record<PhotoKey, File>>>({});
  const [missing, setMissing] = useState<PhotoKey[]>([]);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0); // bump to remount + clear the 3 capture slots

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const body = new FormData(e.currentTarget);
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
      } else if (!res.ok) {
        setError(data?.error?.message ?? t.failed);
      } else if (data.redirectUrl) {
        window.location.href = data.redirectUrl as string;
        return;
      } else {
        setResult(data as Result);
        if (data.outcome === "verified") setTimeout(() => router.refresh(), 1500);
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
    <form ref={formRef} onSubmit={onSubmit} className="space-y-8">
      {error && (
        <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{error}</p>
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
              <input key="kvk" name="kvkNumber" required inputMode="numeric" placeholder="12345678" className="field-input" />
              <span className="mt-1 block text-xs text-neutralx-400">{t.kvkHint}</span>
            </label>
          ) : (
            <label className="block">
              <span className="field-label">{t.vatLabel}</span>
              <input key="vat" name="vatNumber" required placeholder="PL1234567890" autoCapitalize="characters" className="field-input" />
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
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <label className="block">
            <span className="field-label">{t.postal}</span>
            <input name="postalCode" required placeholder="1012 AB" className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">{t.house}</span>
            <input name="houseNumber" required placeholder="10" className="field-input" />
          </label>
        </div>
        <label className="block">
          <span className="field-label">{t.iban}</span>
          <input name="payoutIban" required placeholder="NL00 BANK 0000 0000 00" className="field-input" />
        </label>
      </fieldset>

      <fieldset className="space-y-4" key={attempt}>
        <legend className="text-sm font-semibold text-ink">
          {requireKvk ? "3." : "2."} {t.identity}
        </legend>
        {stripeIdentity && (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t.howIdentity}>
            {(
              [
                ["stripe", ...t.stripe],
                ["upload", ...t.upload],
              ] as const
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
        )}
        {method === "stripe" ? (
          <p className="rounded-lg bg-paper-soft px-3 py-2.5 text-xs leading-relaxed text-neutralx-600">
            {t.stripeInfo}
          </p>
        ) : (
        <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">{t.docType}</span>
            <select name="documentType" required defaultValue="ID_CARD" className="field-input">
              {Object.entries(t.docs).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">{t.docNumber}</span>
            <input name="documentNumber" required placeholder="SPECI2014" className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">{t.validUntil}</span>
            <input type="date" name="documentExpiry" required className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">{t.nameOnDoc}</span>
            <input name="nameOnDocument" required defaultValue={defaultName} className="field-input" />
          </label>
        </div>

        <p className="text-xs leading-relaxed text-neutralx-500">
          {t.photosInfo}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <CaptureSlot t={t} label={t.front[0]} hint={t.front[1]} missing={missing.includes("documentFront")} onPick={(f) => { photos.current.documentFront = f; setMissing((m) => m.filter((x) => x !== "documentFront")); }} />
          <CaptureSlot t={t} label={t.back[0]} hint={t.back[1]} missing={missing.includes("documentBack")} onPick={(f) => { photos.current.documentBack = f; setMissing((m) => m.filter((x) => x !== "documentBack")); }} />
          <CaptureSlot t={t} label={t.selfie[0]} hint={t.selfie[1]} round missing={missing.includes("selfie")} onPick={(f) => { photos.current.selfie = f; setMissing((m) => m.filter((x) => x !== "selfie")); }} />
        </div>
        </>
        )}
      </fieldset>

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? (method === "stripe" ? t.toStripe : t.checkingBusy) : t.submit}
      </button>
      <p className="text-xs leading-relaxed text-neutralx-400">
        {method === "stripe" ? t.stripeNote : t.uploadNote}
      </p>
    </form>
  );
}
