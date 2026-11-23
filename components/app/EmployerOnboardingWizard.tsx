"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveOnboardingProfileAction } from "@/app/werkgever/onboarding/actions";
import { VestigingFormulier } from "@/components/werkgever/VestigingFormulier";
import { useKlusConcept } from "@/components/werkgever/useKlusConcept";
import { useT } from "@/components/i18n/I18nProvider";
import { nl, fmt } from "@/lib/i18n/dictionaries";
import { BRANCHE_OPTIES, type BrancheKeuze } from "@/lib/shifts/branche-keuze";
import { berekenVoortgang, werkgeverStappen, type WerkgeverStapSleutel } from "@/lib/onboarding/voortgang";

// "Jouw start" (23 nov 2026, eigenaar: zoals YoungOnes): een checklist in twee blokken. Blok 1, "Jij en je bedrijf": de organisatie,
// het adres van de werklocatie, het profiel en het e-mailadres. Blok 2, "Jouw eerste klus": klus plaatsen, reacties bekijken, een
// freelancer kiezen en afronden. Er is geen KVK-stap meer: een nieuw bedrijf plaatst meteen, en de controle van het bedrijf komt
// pas als het iemand wil inplannen ("Nog een paar laatste checks", components/werkgever/LaatsteChecksVenster.tsx).
// 20 nov 2026 (eigenaar: korter): de stap "omslagfoto" is weg (kan later in Bedrijfsprofiel) en van de vijf vragen over de
// organisatie blijft alleen de branche over (die stuurt de matching). De teksten en het serverveld coverStepDone blijven bestaan.
type BlokStap = Extract<WerkgeverStapSleutel, "org" | "adres" | "profiel" | "email">;

const SELECT_KEYS = ["role", "sector", "frequency", "urgency", "prior"] as const;
/** de vragen die nog gesteld worden */
const VRAGEN: readonly (typeof SELECT_KEYS)[number][] = ["sector"];
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

export function EmployerOnboardingWizard({
  initial,
}: {
  initial: {
    /** minstens één vaste werklocatie: het adres is bevestigd */
    adresKlaar: boolean;
    profileStepDone: boolean;
    emailVerified: boolean;
    answers: Record<string, string>;
    /** de branches waarvoor het bedrijf al mensen zoekt, of null */
    brancheKeuze?: BrancheKeuze | null | undefined;
    /** de vaste werklocatie die er al is (Locaties of Klus uitzetten): dan tonen we hem alleen */
    vestiging?: { naam: string; adres: string } | null | undefined;
    /** blok 2: wat er al gebeurd is */
    eersteKlus: { heeftKlus: boolean; klusLive: boolean; heeftReactie: boolean; heeftIngepland: boolean };
  };
}) {
  const o = useT().onboarding;
  const router = useRouter();
  const concept = useKlusConcept();
  const [pending, startTransition] = useTransition();
  const vestiging = initial.vestiging ?? null;

  const [orgSaved, setOrgSaved] = useState(Boolean(initial.answers.role || initial.answers.sector));
  // het adres is net opgeslagen: de server laadt de pagina opnieuw, maar het scherm gaat alvast verder
  const [adresOpgeslagen, setAdresOpgeslagen] = useState(false);
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

  // één bron voor "wat moet nog" (lib/onboarding/voortgang.ts): dezelfde stappen als de kaart na deze checklist en de herinneringen
  const adresKlaar = initial.adresKlaar || adresOpgeslagen;
  const stappen = useMemo(
    () =>
      werkgeverStappen({
        orgBeantwoord: orgSaved,
        adresKlaar,
        profielKlaar: initial.profileStepDone,
        emailBevestigd: initial.emailVerified,
        heeftKlus: initial.eersteKlus.heeftKlus,
        heeftReactie: initial.eersteKlus.heeftReactie,
        heeftIngepland: initial.eersteKlus.heeftIngepland,
      }),
    [orgSaved, adresKlaar, initial.profileStepDone, initial.emailVerified, initial.eersteKlus],
  );
  const klaar = (k: WerkgeverStapSleutel) => stappen.find((s) => s.key === k)?.done ?? false;
  const voortgang = berekenVoortgang(stappen);

  const ORDER: BlokStap[] = ["org", "adres", "profiel", "email"];
  const firstOpen = ORDER.find((k) => !klaar(k)) ?? "org";
  const [open, setOpen] = useState<BlokStap>(firstOpen);
  /** de eerstvolgende stap van blok 1 die nog niet klaar is, na deze */
  const volgendeNa = (k: BlokStap, klaarNu: Partial<Record<BlokStap, boolean>> = {}): BlokStap => {
    const rest = ORDER.slice(ORDER.indexOf(k) + 1).concat(ORDER.slice(0, ORDER.indexOf(k)));
    return rest.find((s) => !(klaarNu[s] ?? klaar(s))) ?? k;
  };

  const STEP_META: Record<BlokStap, { label: string; hint: string }> = {
    org: { label: o.stepOrg, hint: "" },
    adres: { label: o.stepAdres, hint: o.stepAdresHint },
    profiel: { label: o.stepProfiel, hint: o.stepProfielHint },
    email: { label: o.stepEmail, hint: o.stepEmailHint },
  };

  function saveOrg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      await saveOnboardingProfileAction(form);
      setOrgSaved(true);
      setOpen(volgendeNa("org", { org: true }));
    });
  }
  function markStep(field: "profileStepDone", nextStep: BlokStap) {
    const f = new FormData();
    f.set(field, "1");
    startTransition(async () => {
      await saveOnboardingProfileAction(f);
      setOpen(nextStep);
      router.refresh();
    });
  }

  const panels: Record<BlokStap, React.ReactNode> = {
      org: (
        <form onSubmit={saveOrg} className="space-y-4">
          <p className="text-sm text-neutralx-500">{o.orgIntro}</p>
          {VRAGEN.map((k) => {
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
      adres: adresKlaar ? (
        <div className="space-y-3">
          {/* groen = klaar */}
          {vestiging ? (
            <p role="status" className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
              <span className="font-semibold">{o.vestigingBekend}</span> {vestiging.naam}
              {vestiging.adres ? `, ${vestiging.adres}` : ""}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setOpen(volgendeNa("adres", { adres: true }))} className="btn-primary text-sm">
              {o.nextStep}
            </button>
            <Link href="/werkgever/locaties" className="text-xs font-semibold text-brand-600 underline underline-offset-2">
              {o.vestigingWijzig}
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-neutralx-500">{o.adresIntro}</p>
          <VestigingFormulier
            key={concept?.city ?? ""}
            beginPlaats={concept?.city ?? ""}
            onOpgeslagen={() => {
              setAdresOpgeslagen(true);
              setOpen(volgendeNa("adres", { adres: true }));
              router.refresh();
            }}
          />
        </div>
      ),
      profiel: (
        <div className="space-y-3 text-sm text-neutralx-600">
          <p>{o.profielBody}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/werkgever/bedrijf" className="btn-ghost text-sm">
              {o.editProfile}
            </Link>
            <button
              type="button"
              onClick={() => markStep("profileStepDone", volgendeNa("profiel", { profiel: true }))}
              disabled={pending}
              className="btn-primary text-sm disabled:opacity-60"
            >
              {o.doneThis}
            </button>
          </div>
        </div>
      ),
      email: initial.emailVerified ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">{o.emailVerified}</p>
      ) : (
        <div className="space-y-3 text-sm text-neutralx-600">
          <p>{o.emailBody}</p>
          <Link href="/verifieer-email" className="btn-primary inline-block text-sm">
            {o.resend}
          </Link>
        </div>
      ),
  };

  // blok 2: de vier stappen van de eerste klus, elk met wat er al gebeurd is
  const EERSTE_KLUS: { key: Extract<WerkgeverStapSleutel, "klus" | "reacties" | "kiezen" | "afronden">; label: string; hint?: string; href?: string; knop?: string }[] = [
    { key: "klus", label: o.firstJob1, href: "/werkgever/diensten/nieuw", knop: o.aanDeSlag },
    { key: "reacties", label: o.firstJob2, hint: o.firstJobHint2, ...(initial.eersteKlus.heeftKlus ? { href: "/werkgever/diensten", knop: o.naarKlussen } : {}) },
    { key: "kiezen", label: o.firstJob3, hint: o.firstJobHint3, ...(initial.eersteKlus.heeftReactie ? { href: "/werkgever/diensten", knop: o.naarKlussen } : {}) },
    { key: "afronden", label: o.firstJob4, hint: o.firstJobHint4 },
  ];
  // de eerstvolgende stap van blok 2 die nog open staat: die krijgt zijn knop, de rest is een rustige lijst
  const volgendeKlusStap = EERSTE_KLUS.find((s) => !klaar(s.key))?.key ?? null;

  const stepNo = Math.min(voortgang.done + 1, voortgang.total);
  const minutesLeft = Math.max(1, voortgang.minutenOpen);

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
      {/* De stappen, één keer (22 nov 2026, gebruikersonderzoek B11): de voortgang en daaronder de stappen zelf, met hun uitleg in de kop. */}
      <div>
        <p className="text-xs text-neutralx-500">{fmt(o.stepProgress, { step: stepNo, total: voortgang.total, min: minutesLeft, pct: voortgang.pct })}</p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {stappen.map((s) => (
            <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.done ? "bg-brand-500" : "bg-hairstrong"}`} />
          ))}
        </div>
        {/* h2: het eerste kopje onder de h1 van de startpagina (axe heading-order) */}
        <h2 className="mt-4 font-display text-sm font-bold uppercase tracking-wide text-ink">{o.blok1Titel}</h2>
        <div className="mt-3 space-y-2">
          {ORDER.map((k) => {
            const isOpen = open === k;
            const meta = STEP_META[k];
            return (
              <div key={k} className={`rounded-xl border ${isOpen ? "border-brand-500 bg-white" : "border-hair bg-paper"}`}>
                <button
                  type="button"
                  onClick={() => setOpen(k)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <Dot done={klaar(k)} active={isOpen} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${isOpen ? "text-ink" : "text-neutralx-600"}`}>{meta.label}</span>
                    {meta.hint && !klaar(k) && <span className="block text-[11px] text-neutralx-500">{meta.hint}</span>}
                  </span>
                  <span aria-hidden className="text-neutralx-400">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && <div className="border-t border-hair px-4 py-4">{panels[k]}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
            <span className="grid h-5 w-5 place-items-center rounded-full border border-hairstrong text-[10px] text-neutralx-400">
              ●
            </span>
            {o.firstJobTitle}
          </h2>
          <p className="mt-2 text-xs text-neutralx-500">{o.firstJobBody}</p>
          {initial.eersteKlus.klusLive && (
            <p role="status" className="mt-3 rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
              {o.klusLive}
            </p>
          )}
          <ol className="mt-3 space-y-1">
            {EERSTE_KLUS.map((s) => {
              const gedaan = klaar(s.key);
              const aanZet = volgendeKlusStap === s.key;
              return (
                <li key={s.key} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                  <Dot done={gedaan} active={aanZet} />
                  <span className="min-w-0 flex-1">
                    <span className={`block ${gedaan ? "text-neutralx-500 line-through" : aanZet ? "font-semibold text-ink" : "text-neutralx-600"}`}>{s.label}</span>
                    {s.hint && !gedaan && <span className="block text-[11px] text-neutralx-500">{s.hint}</span>}
                  </span>
                  {aanZet && s.href && s.knop && (
                    <Link href={s.href} className="btn-primary flex-shrink-0 px-3 py-1.5 text-xs">
                      {s.knop}
                    </Link>
                  )}
                </li>
              );
            })}
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
    </div>
  );
}
