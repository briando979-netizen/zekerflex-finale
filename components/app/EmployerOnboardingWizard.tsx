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

type StepKey = "org" | "kvk" | "profiel" | "email" | "klaar";

const SELECTS: { name: string; label: string; options: string[] }[] = [
  { name: "role", label: "Wat is jouw rol?", options: ["Eigenaar / directie", "HR / recruitment", "Vestigings- of teammanager", "Planner", "Anders"] },
  { name: "sector", label: "In welke branche is jouw bedrijf actief?", options: ["Horeca", "Retail", "Logistiek & magazijn", "Evenementen", "Schoonmaak", "Zorg", "Bouw", "Kantoor / administratie", "Anders"] },
  { name: "shortageFrequency", label: "Hoe vaak heeft jouw bedrijf te maken met personeelstekorten?", options: ["Dagelijks", "Wekelijks", "Bij pieken en seizoen", "Zelden"] },
  { name: "urgency", label: "Hoe dringend heb je nu personeel nodig?", options: ["Deze week", "Binnen een maand", "Ik oriënteer me nog"] },
  { name: "priorPlatform", label: "Heb je al eerder met een flexplatform gewerkt?", options: ["Ja", "Nee"] },
];

const TIMELINE = {
  "Jij en je bedrijf": [
    { key: "org", label: "Jouw organisatie" },
    { key: "kvk", label: "KVK & eerste vestiging" },
    { key: "profiel", label: "Je profiel instellen" },
    { key: "email", label: "E-mailadres bevestigen" },
  ],
  "Jouw eerste dienst": [
    { label: "Plaats je eerste dienst" },
    { label: "Bekijk reacties" },
    { label: "Kies een kracht om mee samen te werken" },
    { label: "Onboarding afronden" },
  ],
};

function Dot({ done, active }: { done: boolean; active?: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border text-[10px] ${
        done
          ? "border-brand-500 bg-brand-500 text-white"
          : active
            ? "border-brand-500 text-brand-500"
            : "border-hairstrong text-neutralx-300"
      }`}
    >
      {done ? "✓" : active ? "●" : ""}
    </span>
  );
}

function NextButton({ label = "Volgende stap" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-60">
      {pending ? "Bezig…" : label}
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
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kvkState, kvkFormAction] = useFormState<EmployerOnboardingState, FormData>(employerOnboardingAction, {
    error: null,
    done: initial.kvkDone,
  });

  const done: Record<StepKey, boolean> = {
    org: Boolean(initial.answers.role || initial.answers.sector),
    kvk: initial.kvkDone || kvkState.done === true,
    profiel: initial.profileStepDone,
    email: initial.emailVerified,
    klaar: false,
  };
  const ORDER: StepKey[] = ["org", "kvk", "profiel", "email", "klaar"];
  const firstOpen = ORDER.find((k) => !done[k]) ?? "klaar";
  const [open, setOpen] = useState<StepKey>(firstOpen);
  const [orgSaved, setOrgSaved] = useState(done.org);

  const completed = ORDER.filter((k) => k !== "klaar" && (k === "org" ? orgSaved : done[k])).length;
  const pct = Math.round((completed / 4) * 100);
  const stepNo = Math.min(completed + 1, 5);
  const minutesLeft = Math.max(1, (4 - completed) * 2);

  function saveOrg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      await saveOnboardingProfileAction(form);
      setOrgSaved(true);
      setOpen("kvk");
    });
  }
  function markProfile() {
    const f = new FormData();
    f.set("profileStepDone", "1");
    startTransition(async () => {
      await saveOnboardingProfileAction(f);
      setOpen("email");
      router.refresh();
    });
  }

  const panels: { key: StepKey; title: string; body: React.ReactNode }[] = useMemo(
    () => [
      {
        key: "org",
        title: "Jouw organisatie",
        body: (
          <form onSubmit={saveOrg} className="space-y-4">
            {SELECTS.map((s) => (
              <label key={s.name} className="block">
                <span className="field-label">{s.label}</span>
                <select
                  name={s.name}
                  defaultValue={initial.answers[s.name] ?? ""}
                  className="field-input"
                >
                  <option value="" disabled>
                    Kies…
                  </option>
                  {s.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="flex justify-end pt-1">
              <button type="submit" disabled={pending} className="btn-primary text-sm disabled:opacity-60">
                {pending ? "Bezig…" : "Volgende stap"}
              </button>
            </div>
          </form>
        ),
      },
      {
        key: "kvk",
        title: "KVK & eerste vestiging",
        body: kvkState.done ? (
          <div className="space-y-3">
            <p className={`rounded-lg px-3 py-2.5 text-sm ${kvkState.kvkValid ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
              {kvkState.companyName ?? "Je organisatie"} —{" "}
              {kvkState.kvkValid ? "geverifieerd in het Handelsregister" : "opgeslagen, KVK nog te bevestigen"}
            </p>
            <button type="button" onClick={() => setOpen("profiel")} className="btn-primary text-sm">
              Volgende stap
            </button>
          </div>
        ) : (
          <form action={kvkFormAction} className="space-y-4">
            {kvkState.error && <p className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{kvkState.error}</p>}
            <label className="block">
              <span className="field-label">KVK-nummer</span>
              <input name="kvkNumber" required inputMode="numeric" placeholder="12345678" className="field-input" />
              <span className="mt-1 block text-xs text-neutralx-400">Wordt live gecontroleerd in het Handelsregister.</span>
            </label>
            <label className="block">
              <span className="field-label">Naam eerste vestiging</span>
              <input name="branchName" required placeholder="Bijv. Amsterdam Centrum" className="field-input" />
            </label>
            <label className="block">
              <span className="field-label">Adres</span>
              <input name="addressLine" required placeholder="Straat + huisnummer" className="field-input" />
            </label>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <label className="block">
                <span className="field-label">Postcode</span>
                <input name="postalCode" required placeholder="1012 AB" className="field-input" />
              </label>
              <label className="block">
                <span className="field-label">Huisnr.</span>
                <input name="houseNumber" required placeholder="10" className="field-input" />
              </label>
            </div>
            <div className="flex justify-end pt-1">
              <NextButton label="Verifiëren & verder" />
            </div>
          </form>
        ),
      },
      {
        key: "profiel",
        title: "Je profiel instellen",
        body: (
          <div className="space-y-3 text-sm text-neutralx-600">
            <p>
              Voeg een logo, omslagfoto en korte bio toe. Zo zien krachten meteen wie je bent — dat levert meer en
              betere reacties op.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/werkgever/bedrijf" className="btn-ghost text-sm">
                Profiel bewerken
              </Link>
              <button type="button" onClick={markProfile} disabled={pending} className="btn-primary text-sm disabled:opacity-60">
                Dit heb ik gedaan
              </button>
            </div>
          </div>
        ),
      },
      {
        key: "email",
        title: "E-mailadres bevestigen",
        body: initial.emailVerified ? (
          <p className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">Je e-mailadres is bevestigd.</p>
        ) : (
          <div className="space-y-3 text-sm text-neutralx-600">
            <p>We hebben je een bevestigingsmail gestuurd. Klik op de link daarin om je account te activeren.</p>
            <Link href="/verifieer-email" className="btn-primary inline-block text-sm">
              Bevestigingsmail opnieuw sturen
            </Link>
          </div>
        ),
      },
      {
        key: "klaar",
        title: "Klaar om te starten",
        body: (
          <div className="space-y-3 text-sm text-neutralx-600">
            <p>Je organisatie staat klaar. Zet je eerste dienst uit — ZekerFlex matcht direct de beste krachten.</p>
            <Link href="/werkgever/diensten/nieuw" className="btn-primary inline-block text-sm">
              Zet je eerste dienst uit
            </Link>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kvkState, pending, orgSaved, initial],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr]">
      {/* Left — checklist */}
      <div className="space-y-6">
        {Object.entries(TIMELINE).map(([group, items], gi) => (
          <div key={group}>
            <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink">{group}</h3>
            <ol className="mt-3 space-y-1">
              {items.map((it, i) => {
                const k = "key" in it ? (it.key as StepKey) : null;
                const isDone = k ? (k === "org" ? orgSaved : done[k]) : false;
                const isActive = k === open && gi === 0;
                return (
                  <li key={it.label}>
                    <button
                      type="button"
                      onClick={() => k && setOpen(k)}
                      disabled={!k}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                        isActive ? "bg-brand-50 font-semibold text-ink" : k ? "text-ink hover:bg-paper-soft" : "text-neutralx-400"
                      }`}
                    >
                      <Dot done={isDone} active={isActive} />
                      {it.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}

        <div className="rounded-xl bg-ink p-5 text-white">
          <p className="text-sm font-semibold">Hulp nodig bij het opstarten?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/kennis/werkgevers" className="rounded-full bg-brand-mint px-3.5 py-1.5 text-xs font-bold text-ink">
              Bekijk het helpcentrum
            </Link>
            <a href="mailto:support@zekerflex.com" className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-semibold text-white">
              Mail support
            </a>
          </div>
        </div>
      </div>

      {/* Right — wizard */}
      <div>
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutralx-500">
          <span>Stap {stepNo} van 5</span>
          <span>± {minutesLeft} min te gaan</span>
          <span>{pct}% voltooid</span>
        </div>
        <div className="mb-1 flex gap-1.5">
          {ORDER.map((k, i) => (
            <span key={k} className={`h-1.5 flex-1 rounded-full ${i < completed ? "bg-brand-500" : "bg-hairstrong"}`} />
          ))}
        </div>
        <div className="mb-5 mt-3 flex items-center justify-between">
          {ORDER.map((k) => (
            <Dot key={k} done={k === "org" ? orgSaved : done[k]} active={k === open} />
          ))}
        </div>

        <div className="space-y-2">
          {panels.map((p) => {
            const isOpen = open === p.key;
            const isDone = p.key === "org" ? orgSaved : done[p.key];
            return (
              <div key={p.key} className={`rounded-xl border ${isOpen ? "border-brand-500 bg-white" : "border-hair bg-paper"}`}>
                <button
                  type="button"
                  onClick={() => setOpen(p.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <Dot done={isDone} active={isOpen} />
                  <span className={`flex-1 text-sm font-semibold ${isOpen ? "text-ink" : "text-neutralx-600"}`}>{p.title}</span>
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
