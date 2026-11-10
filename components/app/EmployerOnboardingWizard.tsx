"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import {
  employerOnboardingAction,
  saveOnboardingProfileAction,
  type EmployerOnboardingState,
} from "@/app/werkgever/onboarding/actions";
import { KvkZoeker } from "@/components/kvk/KvkZoeker";
import { useT } from "@/components/i18n/I18nProvider";
import { nl, fmt } from "@/lib/i18n/dictionaries";
import { BUITEN_LANDEN, EU_LANDEN, landSoort } from "@/lib/onboarding/buitenland";
import { BRANCHE_OPTIES, type BrancheKeuze } from "@/lib/shifts/branche-keuze";
import { controleerVestigingVeld, type VestigingVeld } from "@/lib/onboarding/vestiging";

type StepKey = "org" | "adres" | "profiel" | "foto" | "email" | "klaar";

const SELECT_KEYS = ["role", "sector", "frequency", "urgency", "prior"] as const;
// The stored value is always the canonical Dutch option (matched on re-display).
const CANON = nl.onboarding.selects;
const FORM_NAME: Record<(typeof SELECT_KEYS)[number], string> = {
  role: "role",
  sector: "sector",
  frequency: "shortageFrequency",
  urgency: "urgency",
  prior: "priorPlatform",
};

function Dot({ done, active }: { done: boolean; active?: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border text-[10px] ${
        done
          ? "border-brand-500 bg-brand-500 text-white"
          : active
            ? "border-brand-500 text-brand-500"
            : "border-hairstrong text-neutralx-400"
      }`}
    >
      {done ? "✓" : active ? "●" : ""}
    </span>
  );
}

/** Melding bij één vestigingsveld (role="alert", gekoppeld via aria-describedby). */
function VeldMelding({ veld, tekst }: { veld: VestigingVeld; tekst: string | null | undefined }) {
  if (!tekst) return null;
  return (
    <span id={`vestiging-${veld}-fout`} role="alert" className="mt-1 block text-xs font-medium text-crit">
      {tekst}
    </span>
  );
}

function NextButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-60">
      {pending ? busy : label}
    </button>
  );
}

export function EmployerOnboardingWizard({
  initial,
}: {
  initial: {
    kvkDone: boolean;
    profileStepDone: boolean;
    emailVerified: boolean;
    answers: Record<string, string>;
    coverStepDone?: boolean;
    /** het KVK-nummer dat bij het aanmelden uit het Handelsregister werd gekozen */
    kvkPrefill?: string | undefined;
    /** het land van het bedrijf (ISO), uit de aanmelding */
    landPrefill?: string | undefined;
    /** de branches waarvoor het bedrijf al mensen zoekt, of null */
    brancheKeuze?: BrancheKeuze | null | undefined;
    /** na opnieuw laden: is het bedrijf goedgekeurd, of nog in controle bij ZekerFlex? */
    verified?: boolean | undefined;
    inControle?: boolean | undefined;
    /** het bedrijf zit buiten Nederland: geen KVK, een beheerder keurt het goed */
    buitenlands?: boolean | undefined;
    companyName?: string | undefined;
  };
}) {
  const o = useT().onboarding;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kvkState, kvkFormAction] = useFormState<EmployerOnboardingState, FormData>(employerOnboardingAction, {
    error: null,
    done: initial.kvkDone,
    ...(initial.kvkDone ? { kvkValid: Boolean(initial.verified || initial.inControle), inControle: Boolean(initial.inControle), buitenlands: Boolean(initial.buitenlands), companyName: initial.companyName ?? null } : {}),
  });
  // het land dat bij het aanmelden werd gekozen
  const [land, setLand] = useState(initial.landPrefill && landSoort(initial.landPrefill) ? initial.landPrefill : "NL");
  const soort = landSoort(land) ?? "NL";

  const [orgSaved, setOrgSaved] = useState(Boolean(initial.answers.role || initial.answers.sector));
  // branches waarvoor het bedrijf mensen zoekt: één of meer, of alle
  const [werkBranches, setWerkBranches] = useState<Set<string>>(
    new Set(initial.brancheKeuze?.alle ? BRANCHE_OPTIES.map((b) => b.key) : (initial.brancheKeuze?.branches ?? [])),
  );
  const alleWerkBranches = werkBranches.size === BRANCHE_OPTIES.length;
  const wisselBranche = (k: string) =>
    setWerkBranches((vorig) => {
      const volgend = new Set(vorig);
      if (volgend.has(k)) volgend.delete(k);
      else volgend.add(k);
      return volgend;
    });
  const [coverDone, setCoverDone] = useState(Boolean(initial.coverStepDone));
  // meldingen per vestigingsveld: eerst wat de browser bij het verlaten van een veld vond, anders wat de server teruggaf
  const [vestFout, setVestFout] = useState<Partial<Record<VestigingVeld, string | null>>>({});
  const vestMelding = (k: VestigingVeld): string | null | undefined => (k in vestFout ? vestFout[k] : kvkState.fieldErrors?.[k]);
  const vestAttrs = (k: VestigingVeld) => (vestMelding(k) ? { "aria-invalid": true as const, "aria-describedby": `vestiging-${k}-fout` } : {});
  const vestBlur = (k: VestigingVeld) => (e: React.FocusEvent<HTMLInputElement>) => {
    const m = controleerVestigingVeld(k, e.target.value);
    setVestFout((o) => ({ ...o, [k]: m }));
  };

  const done: Record<StepKey, boolean> = {
    org: orgSaved,
    adres: initial.kvkDone || kvkState.done === true,
    profiel: initial.profileStepDone,
    foto: coverDone,
    email: initial.emailVerified,
    klaar: false,
  };
  // de KVK-stap eerst: zonder geverifieerd bedrijf kun je niemand inplannen (4 nov 2026)
  const ORDER: StepKey[] = ["adres", "org", "profiel", "foto", "email"];
  const firstOpen = ORDER.find((k) => !done[k]) ?? "klaar";
  const [open, setOpen] = useState<StepKey>(firstOpen);

  const completed = ORDER.filter((k) => done[k]).length;
  const pct = Math.round((completed / ORDER.length) * 100);
  const stepNo = Math.min(completed + 1, ORDER.length);
  const minutesLeft = Math.max(1, ORDER.length - completed);

  const STEP_META: { key: StepKey; label: string; hint?: string }[] = [
    { key: "adres", label: o.stepAdres, hint: o.stepAdresHint },
    { key: "org", label: o.stepOrg },
    { key: "profiel", label: o.stepProfiel, hint: o.stepProfielHint },
    { key: "foto", label: o.stepFoto, hint: o.stepFotoHint },
    { key: "email", label: o.stepEmail, hint: o.stepEmailHint },
  ];
  const FIRST_JOB = [o.firstJob1, o.firstJob2, o.firstJob3, o.firstJob4];

  function saveOrg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      await saveOnboardingProfileAction(form);
      setOrgSaved(true);
      setOpen(done.adres ? "profiel" : "adres");
    });
  }
  function markStep(field: "profileStepDone" | "coverStepDone", nextStep: StepKey) {
    const f = new FormData();
    f.set(field, "1");
    startTransition(async () => {
      await saveOnboardingProfileAction(f);
      if (field === "coverStepDone") setCoverDone(true);
      setOpen(nextStep);
      router.refresh();
    });
  }

  const panels: { key: StepKey; title: string; body: React.ReactNode }[] = useMemo(
    () => [
      {
        key: "org",
        title: o.stepOrg,
        body: (
          <form onSubmit={saveOrg} className="space-y-4">
            <p className="text-sm text-neutralx-500">{o.orgIntro}</p>
            {SELECT_KEYS.map((k) => {
              const sel = o.selects[k];
              const name = FORM_NAME[k];
              return (
                <label key={k} className="block">
                  <span className="field-label">{sel.label}</span>
                  <select name={name} defaultValue={initial.answers[name] ?? ""} className="field-input">
                    <option value="" disabled>
                      {o.selectAnswer}
                    </option>
                    {sel.options.map((label, i) => (
                      <option key={i} value={CANON[k].options[i]}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            <div>
              <span className="field-label" id="org-branches-label">{o.orgBranches}</span>
              <p className="mt-0.5 text-xs text-neutralx-500">{o.orgBranchesHint}</p>
              <input type="hidden" name="branches" value={[...werkBranches].join(",")} />
              <input type="hidden" name="alleBranches" value={alleWerkBranches ? "1" : ""} />
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="org-branches-label">
                <button
                  type="button"
                  aria-pressed={alleWerkBranches}
                  onClick={() => setWerkBranches(alleWerkBranches ? new Set() : new Set(BRANCHE_OPTIES.map((b) => b.key)))}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                    alleWerkBranches ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong text-ink hover:border-brand-500"
                  }`}
                >
                  {o.orgAllBranches}
                </button>
                {BRANCHE_OPTIES.map((b) => {
                  const aan = werkBranches.has(b.key);
                  return (
                    <button
                      key={b.key}
                      type="button"
                      aria-pressed={aan}
                      onClick={() => wisselBranche(b.key)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                        aan ? "border-brand-500 bg-brand-50 font-semibold text-ink" : "border-hairstrong text-neutralx-700 hover:border-brand-500"
                      }`}
                    >
                      {b.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-60">
                {pending ? o.busy : o.nextStep}
              </button>
            </div>
          </form>
        ),
      },
      {
        key: "adres",
        title: o.stepAdres,
        body: kvkState.done ? (
          <div className="space-y-3">
            {/* groen = goedgekeurd, amber = wacht op ZekerFlex of op een geldig KVK-nummer (één kleur = één betekenis) */}
            <p role="status" className={`rounded-lg px-3 py-2.5 text-sm ${kvkState.kvkValid && !kvkState.inControle ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
              {fmt(kvkState.kvkValid ? (kvkState.inControle ? (kvkState.buitenlands ? o.kvkInControleForeign : o.kvkInControle) : o.kvkVerified) : o.kvkSaved, {
                name: kvkState.companyName ?? nl.shell.orgFallback,
              })}
            </p>
            {kvkState.reasons && kvkState.reasons.length > 0 && !kvkState.kvkValid && (
              <ul className="list-disc pl-5 text-xs text-neutralx-600">
                {kvkState.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setOpen(done.org ? "profiel" : "org")} className="btn-primary text-sm">
              {o.nextStep}
            </button>
          </div>
        ) : (
          <form action={kvkFormAction} className="space-y-4">
            {kvkState.error && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{kvkState.error}</p>}
            <KvkZoeker
              label="Zoek je bedrijf in het Handelsregister"
              vulFormulier={{ kvk: "kvkNumber", address: "addressLine", houseNumber: "houseNumber", postalCode: "postalCode", name: "branchName" }}
              alleenAlsLeeg={["name"]}
            />
            <label className="block">
              <span className="field-label">{o.country}</span>
              <select name="land" value={land} onChange={(e) => setLand(e.target.value)} className="field-input">
                <option value="NL">Nederland</option>
                <optgroup label={o.countryEu}>
                  {EU_LANDEN.map((l) => <option key={l.code} value={l.code}>{l.naam}</option>)}
                </optgroup>
                <optgroup label={o.countryOther}>
                  {BUITEN_LANDEN.map((l) => <option key={l.code} value={l.code}>{l.naam}</option>)}
                </optgroup>
              </select>
            </label>
            {soort === "NL" && (
              <label className="block">
                <span className="field-label">{o.kvkNumber}</span>
                <input name="kvkNumber" required inputMode="numeric" placeholder="12345678" defaultValue={kvkState.values?.kvkNumber ?? initial.kvkPrefill ?? ""} className="field-input" />
                <span className="mt-1 block text-xs text-neutralx-400">{o.kvkHint}</span>
              </label>
            )}
            {soort === "EU" && (
              <label className="block">
                <span className="field-label">{o.vatNumber}</span>
                <input name="btwNummer" required autoCapitalize="characters" placeholder="DE123456789" defaultValue={kvkState.values?.btwNummer ?? ""} className="field-input" />
                <span className="mt-1 block text-xs text-neutralx-400">{o.vatHint}</span>
              </label>
            )}
            {soort === "BUITEN" && (
              <label className="block">
                <span className="field-label">{o.regNumber}</span>
                <input name="registratieNummer" required defaultValue={kvkState.values?.registratieNummer ?? ""} className="field-input" />
                <span className="mt-1 block text-xs text-neutralx-400">{o.regHint}</span>
              </label>
            )}
            {soort !== "NL" && <p className="text-xs text-neutralx-600">{o.foreignWorkplace}</p>}
            <label className="block">
              <span className="field-label">{o.branchName}</span>
              <input name="branchName" required aria-required="true" autoComplete="organization" placeholder={o.branchNamePh} defaultValue={kvkState.values?.branchName ?? ""} onBlur={vestBlur("branchName")} {...vestAttrs("branchName")} className="field-input" />
              <VeldMelding veld="branchName" tekst={vestMelding("branchName")} />
            </label>
            <label className="block">
              <span className="field-label">{o.address}</span>
              <input name="addressLine" required aria-required="true" autoComplete="street-address" placeholder={o.addressPh} defaultValue={kvkState.values?.addressLine ?? ""} onBlur={vestBlur("addressLine")} {...vestAttrs("addressLine")} className="field-input" />
              <VeldMelding veld="addressLine" tekst={vestMelding("addressLine")} />
            </label>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <label className="block">
                <span className="field-label">{o.postal}</span>
                <input name="postalCode" required aria-required="true" autoComplete="postal-code" placeholder="1012 AB" defaultValue={kvkState.values?.postalCode ?? ""} onBlur={vestBlur("postalCode")} {...vestAttrs("postalCode")} className="field-input" />
                <VeldMelding veld="postalCode" tekst={vestMelding("postalCode")} />
              </label>
              <label className="block">
                <span className="field-label">{o.houseNr}</span>
                <input name="houseNumber" required aria-required="true" autoComplete="off" placeholder="10" defaultValue={kvkState.values?.houseNumber ?? ""} onBlur={vestBlur("houseNumber")} {...vestAttrs("houseNumber")} className="field-input" />
                <VeldMelding veld="houseNumber" tekst={vestMelding("houseNumber")} />
              </label>
            </div>
            <div className="flex justify-end pt-1">
              <NextButton label={o.verifyNext} busy={o.busy} />
            </div>
          </form>
        ),
      },
      {
        key: "profiel",
        title: o.stepProfiel,
        body: (
          <div className="space-y-3 text-sm text-neutralx-600">
            <p>{o.profielBody}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/werkgever/bedrijf" className="btn-ghost text-sm">
                {o.editProfile}
              </Link>
              <button
                type="button"
                onClick={() => markStep("profileStepDone", "foto")}
                disabled={pending}
                className="btn-primary text-sm disabled:opacity-60"
              >
                {o.doneThis}
              </button>
            </div>
          </div>
        ),
      },
      {
        key: "foto",
        title: o.stepFoto,
        body: (
          <div className="space-y-3 text-sm text-neutralx-600">
            <p>{o.fotoBody}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/werkgever/bedrijf" className="btn-ghost text-sm">
                {o.uploadCover}
              </Link>
              <button
                type="button"
                onClick={() => markStep("coverStepDone", "email")}
                disabled={pending}
                className="btn-primary text-sm disabled:opacity-60"
              >
                {coverDone ? o.done : o.skip}
              </button>
            </div>
          </div>
        ),
      },
      {
        key: "email",
        title: o.stepEmail,
        body: initial.emailVerified ? (
          <p className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">{o.emailVerified}</p>
        ) : (
          <div className="space-y-3 text-sm text-neutralx-600">
            <p>{o.emailBody}</p>
            <Link href="/verifieer-email" className="btn-primary inline-block text-sm">
              {o.resend}
            </Link>
          </div>
        ),
      },
      {
        key: "klaar",
        title: o.stepKlaar,
        body: (
          <div className="space-y-3 text-sm text-neutralx-600">
            <p>{o.klaarBody}</p>
            <Link href="/werkgever/diensten/nieuw" className="btn-primary inline-block text-sm">
              {o.placeFirst}
            </Link>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kvkState, pending, orgSaved, coverDone, initial, o, vestFout, werkBranches],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr]">
      {/* Left — checklist */}
      <div className="space-y-6">
        <div className="rounded-2xl border border-hair bg-white p-1.5">
          <div className="border-b border-hair px-3.5 pb-2 pt-2.5 text-xs text-neutralx-500">
            {fmt(o.stepProgress, { step: stepNo, total: ORDER.length, min: minutesLeft, pct })}
          </div>
          <ol className="mt-1 space-y-0.5">
            {STEP_META.map((it) => {
              const isActive = it.key === open;
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={() => setOpen(it.key)}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${
                      isActive ? "bg-brand-50" : "hover:bg-paper-soft"
                    }`}
                  >
                    <Dot done={done[it.key]} active={isActive} />
                    <span>
                      <span className={`block text-sm ${isActive ? "font-semibold text-ink" : "text-ink"}`}>
                        {it.label}
                      </span>
                      {it.hint && <span className="block text-[11px] text-neutralx-500">{it.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          {/* h2: het eerste kopje onder de h1 van de startpagina (axe heading-order); uiterlijk gelijk */}
          <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
            <span className="grid h-5 w-5 place-items-center rounded-full border border-hairstrong text-[10px] text-neutralx-400">
              ●
            </span>
            {o.firstJobTitle}
          </h2>
          <p className="mt-2 text-xs text-neutralx-500">{o.firstJobBody}</p>
          <ol className="mt-3 space-y-1">
            {FIRST_JOB.map((label) => (
              <li key={label} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutralx-400">
                <Dot done={false} />
                {label}
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl bg-ink p-5 text-white">
          <p className="text-sm font-semibold">{o.helpTitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/kennis/werkgevers" className="rounded-full bg-brand-mint px-3.5 py-1.5 text-xs font-bold text-ink">
              {o.helpFaq}
            </Link>
            <Link href="/werkgever/berichten" className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-semibold text-white">
              {o.helpChat}
            </Link>
          </div>
        </div>
      </div>

      {/* Right — wizard */}
      <div>
        <div className="mb-1 flex gap-1.5">
          {ORDER.map((k, i) => (
            <span key={k} className={`h-1.5 flex-1 rounded-full ${i < completed ? "bg-brand-500" : "bg-hairstrong"}`} />
          ))}
        </div>
        <div className="mb-5 mt-3 flex items-center justify-between">
          {ORDER.map((k) => (
            <Dot key={k} done={done[k]} active={k === open} />
          ))}
        </div>

        <h2 className="font-display text-lg font-bold text-ink">
          {panels.find((p) => p.key === open)?.title ?? o.stepOrg}
        </h2>
        <div className="mt-3 space-y-2">
          {panels
            .filter((p) => p.key !== "klaar" || completed === ORDER.length)
            .sort((a, b) => (a.key === "klaar" ? 99 : ORDER.indexOf(a.key)) - (b.key === "klaar" ? 99 : ORDER.indexOf(b.key)))
            .map((p) => {
              const isOpen = open === p.key;
              return (
                <div key={p.key} className={`rounded-xl border ${isOpen ? "border-brand-500 bg-white" : "border-hair bg-paper"}`}>
                  <button
                    type="button"
                    onClick={() => setOpen(p.key)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <Dot done={p.key === "klaar" ? false : done[p.key]} active={isOpen} />
                    <span className={`flex-1 text-sm font-semibold ${isOpen ? "text-ink" : "text-neutralx-600"}`}>
                      {p.title}
                    </span>
                    <span className="text-neutralx-400">{isOpen ? "▲" : "▼"}</span>
                  </button>
                  {isOpen && <div className="border-t border-hair px-4 py-4">{p.body}</div>}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
