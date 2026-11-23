"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveOnboardingProfileAction } from "@/app/werkgever/onboarding/actions";
import { VestigingFormulier } from "@/components/werkgever/VestigingFormulier";
import { useKlusConcept } from "@/components/werkgever/useKlusConcept";
import { blokVoortgang, stapStanden, type StapStand } from "@/components/werkgever/bouwstenen";
import { useT } from "@/components/i18n/I18nProvider";
import { nl, fmt } from "@/lib/i18n/dictionaries";
import { BRANCHE_OPTIES, type BrancheKeuze } from "@/lib/shifts/branche-keuze";
import { werkgeverStappen, type WerkgeverStapSleutel } from "@/lib/onboarding/voortgang";

// "Jouw start" (23 nov 2026, eigenaar: precies de opzet van YoungOnes, in onze eigen woorden en kleuren). Twee blokken naast elkaar
// op een laptop, onder elkaar op een telefoon:
//  - links het overzicht: een stappenlijn met de twee groepen ("Jij en je bedrijf" en "Jouw eerste klus"), elk met een bolletje, een
//    regel uitleg en zijn stappen als rijtjes; daaronder het donkere blok met hulp;
//  - rechts de groep waar je nu bent: de titel, "Stap x van y", het percentage, een balk in stukken met een bolletje per stap, en de
//    stappen als uitklapbare rijen. De open stap heeft zijn velden en één knop.
// Blok 1: de organisatie, het profiel, het adres van de werklocatie, een omslagfoto (mag je overslaan) en het e-mailadres. Blok 2:
// klus plaatsen, reacties bekijken, een freelancer kiezen en afronden. De stappen en of ze klaar zijn komen uit
// lib/onboarding/voortgang.ts (werkgeverStappen); de omslagfoto is alleen hier een stap (lib/werkgever/bedrijfsprofiel.ts) en telt
// nergens anders mee. Er is geen KVK-stap: een nieuw bedrijf plaatst meteen, en de controle van het bedrijf komt pas als het iemand
// wil inplannen ("Nog een paar laatste checks", components/werkgever/LaatsteChecksVenster.tsx).
type Blok1Stap = Extract<WerkgeverStapSleutel, "org" | "adres" | "profiel" | "email"> | "omslag";
type Blok2Stap = Extract<WerkgeverStapSleutel, "klus" | "reacties" | "kiezen" | "afronden">;
type StapId = Blok1Stap | Blok2Stap;

/** de volgorde op het scherm */
const BLOK1: readonly Blok1Stap[] = ["org", "profiel", "adres", "omslag", "email"];
const BLOK2: readonly Blok2Stap[] = ["klus", "reacties", "kiezen", "afronden"];
/** ongeveer hoeveel minuten de omslagfoto kost (de andere stappen hebben hun minuten in lib/onboarding/voortgang.ts) */
const MINUTEN_OMSLAG = 1;

const SELECT_KEYS = ["role", "sector", "frequency", "urgency", "prior"] as const;
/** de vragen over de organisatie: alle vijf waarvoor de opslag bestaat (profile-org, onboarding) */
const VRAGEN: readonly (typeof SELECT_KEYS)[number][] = SELECT_KEYS;
// The stored value is always the canonical Dutch option (matched on re-display).
const CANON = nl.onboarding.selects;
const FORM_NAME: Record<(typeof SELECT_KEYS)[number], string> = {
  role: "role",
  sector: "sector",
  frequency: "shortageFrequency",
  urgency: "urgency",
  prior: "priorPlatform",
};

const MAAT = { klein: "h-4 w-4", rij: "h-8 w-8", groot: "h-9 w-9" } as const;

/** Het bolletje van een stap: gevuld met een vinkje = klaar, een ring met een stip = nu aan de beurt, een lege ring = nog niet. */
function Bol({ stand, maat }: { stand: StapStand; maat: keyof typeof MAAT }) {
  const klein = maat === "klein";
  return (
    <span
      aria-hidden
      className={`grid flex-shrink-0 place-items-center rounded-full border-2 ${MAAT[maat]} ${
        stand === "klaar" ? "border-brand-500 bg-brand-500 text-white" : stand === "actief" ? "border-brand-500 bg-white text-brand-500" : "border-hairstrong bg-white text-neutralx-400"
      }`}
    >
      {stand === "klaar" ? (
        <svg width={klein ? 8 : 14} height={klein ? 8 : 14} viewBox="0 0 16 16" fill="none">
          <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : stand === "actief" ? (
        <span className={`rounded-full bg-brand-500 ${klein ? "h-1 w-1" : "h-2 w-2"}`} />
      ) : null}
    </span>
  );
}

/** Het pijltje rechts in een uitklapbare rij. */
function Pijl({ omhoog }: { omhoog: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className={`flex-shrink-0 text-neutralx-500 transition-transform ${omhoog ? "rotate-180" : ""}`}>
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
    /** er is een omslagfoto, of de stap is bewust overgeslagen (lib/werkgever/bedrijfsprofiel.ts) */
    omslagKlaar: boolean;
    /** wat er al in het profiel staat: de stap "profiel" toont het in zijn velden */
    profiel: { websiteUrl: string; about: string };
    answers: Record<string, string>;
    /** de branches waarvoor het bedrijf al mensen zoekt, of null */
    brancheKeuze?: BrancheKeuze | null | undefined;
    /** de vaste werklocatie die er al is (Locaties of Klus uitzetten): dan tonen we hem alleen */
    vestiging?: { naam: string; adres: string } | null | undefined;
    /** blok 2: wat er al gebeurd is */
    eersteKlus: { heeftKlus: boolean; klusLive: boolean; heeftReactie: boolean; heeftIngepland: boolean };
  };
}) {
  const t = useT();
  const o = t.onboarding;
  const pf = t.orgForm;
  const router = useRouter();
  const concept = useKlusConcept();
  const [pending, startTransition] = useTransition();
  const vestiging = initial.vestiging ?? null;

  const [orgSaved, setOrgSaved] = useState(Boolean(initial.answers.role || initial.answers.sector));
  // het adres is net opgeslagen: de server laadt de pagina opnieuw, maar het scherm gaat alvast verder
  const [adresOpgeslagen, setAdresOpgeslagen] = useState(false);
  const [profielGedaan, setProfielGedaan] = useState(false);
  const [omslagGedaan, setOmslagGedaan] = useState(false);
  // de stap "profiel": website en omschrijving, bewaard via dezelfde route als het Bedrijfsprofiel (PUT /api/orgs)
  const [website, setWebsite] = useState(initial.profiel.websiteUrl);
  const [omschrijving, setOmschrijving] = useState(initial.profiel.about);
  const [profielFout, setProfielFout] = useState(false);
  // de stap "omslagfoto": uploaden via dezelfde route als het Bedrijfsprofiel (POST /api/orgs/photo)
  const fotoRef = useRef<HTMLInputElement>(null);
  const [fotoBezig, setFotoBezig] = useState(false);
  const [fotoFout, setFotoFout] = useState(false);
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

  // één bron voor "wat moet nog" (lib/onboarding/voortgang.ts): dezelfde stappen als de herinneringen en de kaart na deze checklist
  const adresKlaar = initial.adresKlaar || adresOpgeslagen;
  const profielKlaar = initial.profileStepDone || profielGedaan;
  const omslagKlaar = initial.omslagKlaar || omslagGedaan;
  const stappen = useMemo(
    () =>
      werkgeverStappen({
        orgBeantwoord: orgSaved,
        adresKlaar,
        profielKlaar,
        emailBevestigd: initial.emailVerified,
        heeftKlus: initial.eersteKlus.heeftKlus,
        heeftReactie: initial.eersteKlus.heeftReactie,
        heeftIngepland: initial.eersteKlus.heeftIngepland,
      }),
    [orgSaved, adresKlaar, profielKlaar, initial.emailVerified, initial.eersteKlus],
  );
  const klaar = (k: StapId): boolean => (k === "omslag" ? omslagKlaar : (stappen.find((s) => s.key === k)?.done ?? false));
  const minuten = (k: StapId): number => (k === "omslag" ? MINUTEN_OMSLAG : (stappen.find((s) => s.key === k)?.minuten ?? 0));

  const blok1Klaar = BLOK1.every((k) => klaar(k));
  const blok2Klaar = BLOK2.every((k) => klaar(k));
  const eersteOpen = (rij: readonly StapId[]): StapId | null => rij.find((k) => !klaar(k)) ?? null;

  // welke groep rechts staat en welke stap daarin open is: de eerste stap die nog open staat
  const [groep, setGroep] = useState<1 | 2>(blok1Klaar ? 2 : 1);
  const [open, setOpen] = useState<StapId | null>(blok1Klaar ? eersteOpen(BLOK2) : eersteOpen(BLOK1));

  /** Een stap in het overzicht links aantikken: zijn groep komt rechts te staan, met die stap open. */
  const kies = (g: 1 | 2, k: StapId) => {
    setGroep(g);
    setOpen(k);
  };
  /** Na een stap van blok 1: de eerstvolgende die nog open staat; is blok 1 af, dan door naar de eerste klus. */
  const verderNa = (k: Blok1Stap, klaarNu: Partial<Record<Blok1Stap, boolean>> = {}) => {
    const i = BLOK1.indexOf(k);
    const rest = BLOK1.slice(i + 1).concat(BLOK1.slice(0, i));
    const volgende = rest.find((s) => !(klaarNu[s] ?? klaar(s)));
    if (volgende) {
      kies(1, volgende);
      return;
    }
    kies(2, eersteOpen(BLOK2) ?? "klus");
  };

  const LABEL: Record<StapId, string> = {
    org: o.stepOrg,
    profiel: o.stepProfiel,
    adres: o.stepAdres,
    omslag: o.stepFoto,
    email: o.stepEmail,
    klus: o.firstJob1,
    reacties: o.firstJob2,
    kiezen: o.firstJob3,
    afronden: o.firstJob4,
  };

  function saveOrg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(async () => {
      await saveOnboardingProfileAction(form);
      setOrgSaved(true);
      verderNa("org", { org: true });
    });
  }
  /** Website en omschrijving bewaren (alleen als er iets is ingevuld) en de stap afvinken. */
  function saveProfiel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfielFout(false);
    startTransition(async () => {
      const gewijzigd = website.trim() !== initial.profiel.websiteUrl || omschrijving.trim() !== initial.profiel.about;
      if (gewijzigd) {
        const r = await fetch("/api/orgs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteUrl: website.trim(), about: omschrijving.trim() }),
        }).catch(() => null);
        if (!r || !r.ok) {
          setProfielFout(true);
          return;
        }
      }
      const f = new FormData();
      f.set("profileStepDone", "1");
      await saveOnboardingProfileAction(f);
      setProfielGedaan(true);
      verderNa("profiel", { profiel: true });
      router.refresh();
    });
  }
  async function uploadOmslag(bestand: File) {
    setFotoBezig(true);
    setFotoFout(false);
    try {
      const fd = new FormData();
      fd.append("file", bestand);
      const r = await fetch("/api/orgs/photo", { method: "POST", body: fd });
      if (!r.ok) {
        setFotoFout(true);
        return;
      }
      setOmslagGedaan(true);
      verderNa("omslag", { omslag: true });
      router.refresh();
    } catch {
      setFotoFout(true);
    } finally {
      setFotoBezig(false);
    }
  }
  /** De omslagfoto overslaan: bewust, dus de stap telt als gedaan (het veld coverStepDone bestond al). */
  function slaOmslagOver() {
    const f = new FormData();
    f.set("coverStepDone", "1");
    startTransition(async () => {
      await saveOnboardingProfileAction(f);
      setOmslagGedaan(true);
      verderNa("omslag", { omslag: true });
      router.refresh();
    });
  }

  const knopRij = "flex flex-wrap items-center justify-end gap-3 pt-2";

  const panels: Record<StapId, ReactNode> = {
    org: (
      <form onSubmit={saveOrg} className="space-y-5">
        <p className="text-sm leading-relaxed text-neutralx-600">{o.orgIntro}</p>
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
          <span className="field-label" id="org-branches-label">
            {o.orgBranches}
          </span>
          <p className="mt-0.5 text-xs text-neutralx-500">{o.orgBranchesHint}</p>
          <input type="hidden" name="branches" value={[...werkBranches].join(",")} />
          <input type="hidden" name="alleBranches" value={alleWerkBranches ? "1" : ""} />
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-labelledby="org-branches-label">
            <button
              type="button"
              aria-pressed={alleWerkBranches}
              onClick={() => setWerkBranches(alleWerkBranches ? new Set() : new Set(BRANCHE_OPTIES.map((b) => b.key)))}
              className={`min-h-11 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                alleWerkBranches ? "border-brand-500 bg-brand-500 text-white" : "border-hairstrong text-ink hover:border-brand-500"
              }`}
            >
              {o.orgAllBranches}
            </button>
            {BRANCHE_OPTIES.map((b) => {
              const gekozen = werkBranches.has(b.key);
              return (
                <button
                  key={b.key}
                  type="button"
                  aria-pressed={gekozen}
                  onClick={() => wisselBranche(b.key)}
                  className={`min-h-11 rounded-lg border px-3 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                    gekozen ? "border-brand-500 bg-brand-50 font-semibold text-ink" : "border-hairstrong text-neutralx-700 hover:border-brand-500"
                  }`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className={knopRij}>
          <button type="submit" disabled={pending} className="btn-primary min-h-11 disabled:opacity-60">
            {pending ? o.busy : o.nextStep}
          </button>
        </div>
      </form>
    ),
    profiel: (
      <form onSubmit={saveProfiel} className="space-y-5">
        <p className="text-sm leading-relaxed text-neutralx-600">{o.profielBody}</p>
        <label className="block">
          <span className="field-label">{pf.website}</span>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} autoComplete="url" className="field-input" placeholder={pf.websitePlaceholder} />
        </label>
        <label className="block">
          <span className="field-label">{pf.over}</span>
          <textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={600} rows={4} className="field-input" placeholder={pf.overPlaceholder} />
        </label>
        {profielFout && (
          <p role="alert" className="text-sm text-crit">
            {pf.mislukt}
          </p>
        )}
        <div className={knopRij}>
          <button type="submit" disabled={pending} className="btn-primary min-h-11 disabled:opacity-60">
            {pending ? o.busy : o.nextStep}
          </button>
        </div>
      </form>
    ),
    adres: adresKlaar ? (
      <div className="space-y-4">
        {/* groen = klaar */}
        {vestiging ? (
          <p role="status" className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
            <span className="font-semibold">{o.vestigingBekend}</span> {vestiging.naam}
            {vestiging.adres ? `, ${vestiging.adres}` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/werkgever/locaties" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 underline underline-offset-2">
            {o.vestigingWijzig}
          </Link>
          <button type="button" onClick={() => verderNa("adres", { adres: true })} className="btn-primary min-h-11">
            {o.nextStep}
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutralx-600">{o.adresIntro}</p>
        <VestigingFormulier
          key={concept?.city ?? ""}
          beginPlaats={concept?.city ?? ""}
          onOpgeslagen={() => {
            setAdresOpgeslagen(true);
            verderNa("adres", { adres: true });
            router.refresh();
          }}
        />
      </div>
    ),
    omslag: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutralx-600">{o.fotoBody}</p>
        {fotoFout && (
          <p role="alert" className="text-sm text-crit">
            {o.fotoMislukt}
          </p>
        )}
        {omslagGedaan && (
          <p role="status" className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
            {o.fotoGelukt}
          </p>
        )}
        <input
          ref={fotoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const bestand = e.target.files?.[0];
            if (bestand) void uploadOmslag(bestand);
          }}
        />
        <div className={knopRij}>
          {!omslagKlaar && (
            <button type="button" onClick={slaOmslagOver} disabled={pending || fotoBezig} className="btn-ghost min-h-11 disabled:opacity-60">
              {o.skip}
            </button>
          )}
          <button type="button" onClick={() => fotoRef.current?.click()} disabled={pending || fotoBezig} className="btn-primary min-h-11 disabled:opacity-60">
            {fotoBezig ? o.fotoBezig : o.uploadCover}
          </button>
        </div>
      </div>
    ),
    email: initial.emailVerified ? (
      <p role="status" className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
        {o.emailVerified}
      </p>
    ) : (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutralx-600">{o.emailBody}</p>
        <div className={knopRij}>
          <Link href="/verifieer-email" className="btn-primary min-h-11">
            {o.resend}
          </Link>
        </div>
      </div>
    ),
    // blok 2: elke stap een korte uitleg en één knop
    klus: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutralx-600">{o.klusBody}</p>
        <div className="flex flex-wrap gap-3">
          {initial.eersteKlus.heeftKlus ? (
            <Link href="/werkgever/diensten" className="btn-primary min-h-11">
              {o.naarKlussen}
            </Link>
          ) : (
            <Link href="/werkgever/diensten/nieuw" className="btn-primary min-h-11">
              {o.aanDeSlag}
            </Link>
          )}
        </div>
      </div>
    ),
    reacties: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutralx-600">{initial.eersteKlus.heeftReactie ? o.reactiesEr : o.reactiesNog}</p>
        {initial.eersteKlus.heeftKlus && (
          <div className="flex flex-wrap gap-3">
            <Link href="/werkgever/diensten" className="btn-primary min-h-11">
              {o.naarKlussen}
            </Link>
          </div>
        )}
      </div>
    ),
    kiezen: (
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-neutralx-600">{o.kiezenBody}</p>
        {initial.eersteKlus.heeftReactie && (
          <div className="flex flex-wrap gap-3">
            <Link href="/werkgever/diensten" className="btn-primary min-h-11">
              {o.naarKlussen}
            </Link>
          </div>
        )}
      </div>
    ),
    afronden: <p className="text-sm leading-relaxed text-neutralx-600">{o.afrondenBody}</p>,
  };

  // het blok rechts: de stappen van de groep waar je nu bent
  const rij: readonly StapId[] = groep === 1 ? BLOK1 : BLOK2;
  const gedaan = rij.map((k) => klaar(k));
  const standen = stapStanden(gedaan);
  const voortgang = blokVoortgang(gedaan);
  const minutenOver = rij.reduce((som, k) => som + (klaar(k) ? 0 : minuten(k)), 0);

  // het overzicht links: de twee groepen onder elkaar aan één lijn
  const GROEPEN: { nr: 1 | 2; titel: string; uitleg: string; stappen: readonly StapId[]; af: boolean }[] = [
    { nr: 1, titel: o.blok1Titel, uitleg: o.blok1Intro, stappen: BLOK1, af: blok1Klaar },
    { nr: 2, titel: o.firstJobTitle, uitleg: o.firstJobBody, stappen: BLOK2, af: blok2Klaar },
  ];

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-hair shadow-e1 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
      {/* Links (op een telefoon onder het blok waar je nu bent): het overzicht van alle stappen en het blok met hulp */}
      <nav aria-label={o.overzichtLabel} className="order-2 bg-paper px-5 py-8 sm:px-8 lg:order-1 lg:px-10 lg:py-12">
        <ol>
          {GROEPEN.map((g, gi) => {
            const stand: StapStand = g.af ? "klaar" : groep === g.nr || (g.nr === 1 && !blok1Klaar) ? "actief" : "open";
            const laatste = gi === GROEPEN.length - 1;
            return (
              <li key={g.nr} className={`relative pl-12 ${laatste ? "" : "pb-10"}`}>
                {/* de lijn naar de volgende groep: groen zodra deze groep af is */}
                {!laatste && <span aria-hidden className={`absolute bottom-0 left-[17px] top-9 w-0.5 ${g.af ? "bg-brand-500" : "bg-hairstrong"}`} />}
                <span className="absolute left-0 top-0">
                  <Bol stand={stand} maat="groot" />
                </span>
                <h2 className="pt-1.5 font-display text-base font-bold leading-snug text-ink">{g.titel}</h2>
                {g.af && <p className="text-sm font-semibold text-ok">{o.voltooid}</p>}
                <p className="mt-3 text-sm leading-relaxed text-neutralx-600">{g.uitleg}</p>
                <ul className="mt-4 space-y-2">
                  {g.stappen.map((k) => {
                    const nu = groep === g.nr && open === k;
                    return (
                      <li key={k}>
                        <button
                          type="button"
                          onClick={() => kies(g.nr, k)}
                          aria-current={nu ? "step" : undefined}
                          className={`flex min-h-11 w-full items-center gap-2 rounded-lg border bg-white px-4 py-2 text-left text-sm font-semibold transition-colors hover:border-brand-500 ${
                            nu ? "border-hairstrong text-ink" : "border-hair text-neutralx-500"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            {LABEL[k]}
                            {k === "omslag" && <span className="font-normal"> ({o.stepFotoHint})</span>}
                          </span>
                          {klaar(k) && <Bol stand="klaar" maat="klein" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>

        <div className="mt-10 rounded-lg bg-ink p-5 text-white">
          <p className="font-display text-sm font-bold leading-snug">{o.helpTitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/kennis/werkgevers" className="inline-flex min-h-11 items-center rounded-lg bg-brand-mint px-4 text-sm font-bold text-ink">
              {o.helpFaq}
            </Link>
            <Link href="/werkgever/berichten" className="inline-flex min-h-11 items-center rounded-lg border border-white/30 px-4 text-sm font-semibold text-white">
              {o.helpChat}
            </Link>
          </div>
        </div>
      </nav>

      {/* Rechts (op een telefoon bovenaan): de groep waar je nu bent, met de voortgang en de stappen als uitklapbare rijen */}
      <section aria-labelledby="start-blok-kop" className="order-1 bg-white px-5 py-8 sm:px-8 lg:order-2 lg:px-12 lg:py-12">
        <h2 id="start-blok-kop" className="font-display text-xl font-bold leading-snug text-ink">
          {groep === 1 ? o.blok1Titel : o.firstJobTitle}
        </h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-neutralx-500">
          <p>
            {fmt(o.stapVan, { step: voortgang.stap, total: voortgang.totaal })}
            {minutenOver > 0 && <span className="ml-3 border-l border-hairstrong pl-3">{fmt(o.minutenTeGaan, { min: minutenOver })}</span>}
          </p>
          <p>{fmt(o.pctVoltooid, { pct: voortgang.pct })}</p>
        </div>
        {/* de balk in stukken, met onder elk stuk het bolletje van die stap */}
        <div className={`mt-5 grid gap-1.5 ${rij.length === 5 ? "grid-cols-5" : "grid-cols-4"}`} aria-hidden>
          {rij.map((k, i) => (
            <div key={k} className="flex flex-col items-center gap-2.5">
              <span className={`h-1.5 w-full rounded-full ${gedaan[i] ? "bg-brand-500" : "bg-hairstrong"}`} />
              <Bol stand={standen[i] ?? "open"} maat="klein" />
            </div>
          ))}
        </div>

        {groep === 2 && initial.eersteKlus.klusLive && (
          <p role="status" className="mt-6 rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
            {o.klusLive}
          </p>
        )}

        <div className="mt-8 space-y-3">
          {rij.map((k, i) => {
            const isOpen = open === k;
            return (
              <div key={k} className={`rounded-lg border ${isOpen ? "border-hairstrong bg-white" : "border-hair bg-paper-soft"}`}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : k)}
                  aria-expanded={isOpen}
                  aria-controls={`start-stap-${k}`}
                  className="flex min-h-[3.75rem] w-full items-center gap-4 px-4 py-3 text-left sm:px-5"
                >
                  <Bol stand={isOpen && !gedaan[i] ? "actief" : (standen[i] ?? "open")} maat="rij" />
                  <span className={`min-w-0 flex-1 text-sm font-bold ${isOpen || gedaan[i] ? "text-ink" : "text-neutralx-600"}`}>
                    {LABEL[k]}
                    {k === "omslag" && <span className="font-normal text-neutralx-500"> ({o.stepFotoHint})</span>}
                  </span>
                  <Pijl omhoog={isOpen} />
                </button>
                {isOpen && (
                  <div id={`start-stap-${k}`} className="px-4 pb-5 pt-1 sm:px-5">
                    {panels[k]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
