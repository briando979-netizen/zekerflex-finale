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
import { useT } from "@/components/i18n/I18nProvider";
import { DICTS, fmt } from "@/lib/i18n/dictionaries";

type StepKey = "org" | "adres" | "profiel" | "foto" | "email" | "klaar";

const SELECT_KEYS = ["role", "sector", "frequency", "urgency", "prior"] as const;
// The stored value is always the canonical Dutch option (matched on re-display).
const CANON = DICTS.nl.onboarding.selects;
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
  };
}) {
  const o = useT().onboarding;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kvkState, kvkFormAction] = useFormState<EmployerOnboardingState, FormData>(employerOnboardingAction, {
    error: null,
    done: initial.kvkDone,
  });

  const [orgSaved, setOrgSaved] = useState(Boolean(initial.answers.role || initial.answers.sector));
  const [coverDone, setCoverDone] = useState(Boolean(initial.coverStepDone));

  const done: Record<StepKey, boolean> = {
    org: orgSaved,
    adres: initial.kvkDone || kvkState.done === true,
    profiel: initial.profileStepDone,
    foto: coverDone,
    email: initial.emailVerified,
    klaar: false,
  };
  const ORDER: StepKey[] = ["org", "adres", "profiel", "foto", "email"];
  const firstOpen = ORDER.find((k) => !done[k]) ?? "klaar";
  const [open, setOpen] = useState<StepKey>(firstOpen);

  const completed = ORDER.filter((k) => done[k]).length;
  const pct = Math.round((completed / ORDER.length) * 100);
  const stepNo = Math.min(completed + 1, ORDER.length);
  const minutesLeft = Math.max(1, ORDER.length - completed);

  const STEP_META: { key: StepKey; label: string; hint?: string }[] = [
    { key: "org", label: o.stepOrg },
    { key: "adres", label: o.stepAdres, hint: o.stepAdresHint },
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
      setOpen("adres");
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
            <p className={`rounded-lg px-3 py-2.5 text-sm ${kvkState.kvkValid ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
              {fmt(kvkState.kvkValid ? o.kvkVerified : o.kvkSaved, {
                name: kvkState.companyName ?? DICTS.nl.shell.orgFallback,
              })}
            </p>
            <button type="button" onClick={() => setOpen("profiel")} className="btn-primary text-sm">
              {o.nextStep}
            </button>
          </div>
        ) : (
          <form action={kvkFormAction} className="space-y-4">
            {kvkState.error && <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{kvkState.error}</p>}
            <label className="block">
              <span className="field-label">{o.kvkNumber}</span>
              <input name="kvkNumber" required inputMode="numeric" placeholder="12345678" className="field-input" />
              <span className="mt-1 block text-xs text-neutralx-400">{o.kvkHint}</span>
            </label>
            <label className="block">
              <span className="field-label">{o.branchName}</span>
              <input name="branchName" required placeholder={o.branchNamePh} className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">{o.address}</span>
              <input name="addressLine" required placeholder={o.addressPh} className="field-input" />
            </label>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <label className="block">
                <span className="field-label">{o.postal}</span>
                <input name="postalCode" required placeholder="1012 AB" className="field-input" />
              </label>
              <label className="block">
                <span className="field-label">{o.houseNr}</span>
                <input name="houseNumber" required placeholder="10" className="field-input" />
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
    [kvkState, pending, orgSaved, coverDone, initial, o],
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
                      {it.hint && <span className="block text-[11px] text-neutralx-400">{it.hint}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
            <span className="grid h-5 w-5 place-items-center rounded-full border border-hairstrong text-[10px] text-neutralx-400">
              ●
            </span>
            {o.firstJobTitle}
          </h3>
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
