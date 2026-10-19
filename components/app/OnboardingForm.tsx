"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

const DOC_LABEL: Record<string, string> = {
  PASSPORT: "Paspoort",
  ID_CARD: "Identiteitskaart",
  DRIVERS_LICENSE: "Rijbewijs",
};

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
}: {
  label: string;
  hint: string;
  round?: boolean;
  missing?: boolean;
  onPick: (file: File) => void;
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
            {busy ? "Verwerken…" : preview ? "Vervangen" : "Foto maken of kiezen"}
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
const PHOTO_LABEL: Record<PhotoKey, string> = { documentFront: "de voorkant", documentBack: "de achterkant", selfie: "de selfie" };

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
        setError(`Maak of kies nog een foto van ${absent.map((k) => PHOTO_LABEL[k]).join(", ").replace(/, ([^,]*)$/, " en $1")}.`);
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
        setError("De foto's zijn te groot om te versturen. Probeer het opnieuw — of kies kleinere foto's.");
      } else if (!res.ok) {
        setError(data?.error?.message ?? "Er ging iets mis. Probeer het opnieuw.");
      } else if (data.redirectUrl) {
        window.location.href = data.redirectUrl as string;
        return;
      } else {
        setResult(data as Result);
        if (data.outcome === "verified") setTimeout(() => router.refresh(), 1500);
      }
    } catch {
      setError("Kon de verificatie niet versturen. Controleer je verbinding.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const tone =
      result.outcome === "verified"
        ? { pill: "pill-ok", label: "Geverifieerd", ring: "border-ok/30 bg-ok/5" }
        : result.outcome === "rejected"
          ? { pill: "pill-crit", label: "Afgewezen", ring: "border-crit/30 bg-crit/5" }
          : { pill: "pill-warn", label: "In behandeling", ring: "border-warn/30 bg-warn/5" };

    return (
      <div className="space-y-5">
        <div className={`card p-6 ${tone.ring}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Resultaat</h2>
            <span className={tone.pill}>{tone.label}</span>
          </div>
          <p className="mt-2 text-sm text-ink-soft">{result.summary}</p>
          {result.companyName && (
            <p className="mt-1 text-xs text-neutralx-500">
              Onderneming: {result.companyName} {result.kvkValid ? "· gevalideerd" : "· niet gevalideerd"}
            </p>
          )}
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Controles</div>
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
              Gegevens aanpassen en opnieuw proberen
            </button>
            <a href="mailto:support@zekerflex.com" className="btn-ghost">
              Hulp nodig? support@zekerflex.com
            </a>
          </div>
        )}
        {result.outcome === "verified" && (
          <button type="button" onClick={() => router.refresh()} className="btn-primary">
            Naar mijn dashboard
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
          <legend className="text-sm font-semibold text-ink">1. Onderneming</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Soort registratie">
            {(
              [
                ["kvk", "KVK-nummer", "Ingeschreven in Nederland"],
                ["vat", "Btw-nummer (EU)", "Bijv. uit Polen, Roemenië, België"],
              ] as const
            ).map(([k, t, sub]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={biz === k}
                onClick={() => setBiz(k)}
                className={`rounded-xl border px-3 py-2.5 text-left ${biz === k ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}
              >
                <span className="block text-sm font-semibold text-ink">{t}</span>
                <span className="block text-xs text-neutralx-500">{sub}</span>
              </button>
            ))}
          </div>
          {biz === "kvk" ? (
            <label className="block">
              <span className="field-label">KVK-nummer</span>
              <input key="kvk" name="kvkNumber" required inputMode="numeric" placeholder="12345678" className="field-input" />
              <span className="mt-1 block text-xs text-neutralx-400">We controleren dit live in het Handelsregister.</span>
            </label>
          ) : (
            <label className="block">
              <span className="field-label">Btw-nummer (met landcode)</span>
              <input key="vat" name="vatNumber" required placeholder="PL1234567890" autoCapitalize="characters" className="field-input" />
              <span className="mt-1 block text-xs text-neutralx-400">
                We controleren dit live in de EU-database (VIES). Werk je in Nederland als zzp&apos;er zonder KVK? Dan factureer je met je eigen btw-nummer.
              </span>
            </label>
          )}
        </fieldset>
      )}

      {!requireKvk && (
        <p className="rounded-lg border border-hair bg-paper-soft px-3 py-2.5 text-xs leading-relaxed text-neutralx-500">
          Je werkt als uitzendkracht — je hoeft geen KVK te koppelen. Vul hieronder je thuisbasis,
          rekeningnummer en identiteitsbewijs in. Je BSN en loonheffingskorting vul je apart in bij
          &ldquo;Uitzenden&rdquo;.
        </p>
      )}

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink">
          {requireKvk ? "2." : "1."} Thuisbasis &amp; uitbetaling
        </legend>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <label className="block">
            <span className="field-label">Postcode</span>
            <input name="postalCode" required placeholder="1012 AB" className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Huisnr.</span>
            <input name="houseNumber" required placeholder="10" className="field-input" />
          </label>
        </div>
        <label className="block">
          <span className="field-label">IBAN voor uitbetalingen</span>
          <input name="payoutIban" required placeholder="NL00 BANK 0000 0000 00" className="field-input" />
        </label>
      </fieldset>

      <fieldset className="space-y-4" key={attempt}>
        <legend className="text-sm font-semibold text-ink">
          {requireKvk ? "3." : "2."} Identiteitsbewijs
        </legend>
        {stripeIdentity && (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Hoe wil je je identiteit bevestigen?">
            {(
              [
                ["stripe", "Snel via Stripe (aanbevolen)", "Ongeveer 2 minuten met je telefooncamera: ID + selfie, meestal direct goedgekeurd."],
                ["upload", "Zelf foto's uploaden", "Voorkant, achterkant en een selfie; wij controleren het."],
              ] as const
            ).map(([k, t, sub]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={method === k}
                onClick={() => setMethod(k)}
                className={`rounded-xl border px-3 py-2.5 text-left ${method === k ? "border-brand-500 bg-brand-50" : "border-hairstrong"}`}
              >
                <span className="block text-sm font-semibold text-ink">{t}</span>
                <span className="block text-xs text-neutralx-500">{sub}</span>
              </button>
            ))}
          </div>
        )}
        {method === "stripe" ? (
          <p className="rounded-lg bg-paper-soft px-3 py-2.5 text-xs leading-relaxed text-neutralx-600">
            Na &ldquo;Verificatie versturen&rdquo; ga je naar de beveiligde pagina van Stripe. Daar maak je met je camera een foto van je
            ID-kaart, paspoort of rijbewijs en een korte selfie. Daarna kom je automatisch hier terug.
          </p>
        ) : (
        <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Type document</span>
            <select name="documentType" required defaultValue="ID_CARD" className="field-input">
              {Object.entries(DOC_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Documentnummer</span>
            <input name="documentNumber" required placeholder="SPECI2014" className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Geldig tot</span>
            <input type="date" name="documentExpiry" required className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Naam zoals op document</span>
            <input name="nameOnDocument" required defaultValue={defaultName} className="field-input" />
          </label>
        </div>

        <p className="text-xs leading-relaxed text-neutralx-500">
          Drie foto&apos;s, in één keer — dit vervangt losse uploads verderop: de voorkant en achterkant
          van je document, en een selfie zodat we kunnen zien dat jij het bent. Maak ze met je camera of
          kies ze uit je galerij. Zorg voor goed licht en scherpe tekst.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <CaptureSlot label="Voorkant" hint="Pasfoto-zijde van je document" missing={missing.includes("documentFront")} onPick={(f) => { photos.current.documentFront = f; setMissing((m) => m.filter((x) => x !== "documentFront")); }} />
          <CaptureSlot label="Achterkant" hint="De kant zonder foto" missing={missing.includes("documentBack")} onPick={(f) => { photos.current.documentBack = f; setMissing((m) => m.filter((x) => x !== "documentBack")); }} />
          <CaptureSlot label="Selfie" hint="Kijk recht in de camera" round missing={missing.includes("selfie")} onPick={(f) => { photos.current.selfie = f; setMissing((m) => m.filter((x) => x !== "selfie")); }} />
        </div>
        </>
        )}
      </fieldset>

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? (method === "stripe" ? "Doorsturen naar Stripe…" : "Bezig met controleren…") : "Verificatie versturen"}
      </button>
      <p className="text-xs leading-relaxed text-neutralx-400">
        {method === "stripe"
          ? "De ID-controle gebeurt door Stripe (onze betaalpartner), die je gegevens beveiligd verwerkt. ZekerFlex krijgt alleen de uitslag en je naam zoals op het document."
          : "Je foto's worden versleuteld bewaard door ZekerFlex en alleen gebruikt voor deze verificatie. Dit voldoet meteen aan de verplichte identiteitsbewijs-upload verderop op deze pagina — dat hoef je dus niet nog een keer te doen."}
      </p>
    </form>
  );
}
