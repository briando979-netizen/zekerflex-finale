"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar/links";
import { BASE, CONTACT } from "@/lib/voorstel/schwarzwald";
import { sterren } from "@/lib/voorstel/review-weergave";
import { VOORUIT_DAGEN, plusDagen } from "@/lib/voorstel/schwarzwald-agenda";

// Klantaccount: inloggen/registreren (ook met Google), en ingelogd een
// dashboard met je volgende uitje, reserveringen, aanvragen, berichten met het
// team, je wensen en je gegevens. Praat met /api/voorstel/schwarzwald/account.

export interface AccountGegevens {
  email: string;
  naam: string;
  telefoon: string;
  rol: "klant" | "beheerder";
  google: boolean;
  heeftWachtwoord: boolean;
}
export interface MijnBoeking {
  id: string;
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
  status: "nieuw" | "bevestigd" | "geannuleerd";
}
export interface MijnAanvraag {
  id: string;
  programma: string;
  gelegenheid: string;
  datum: string;
  personen: number;
  status: "nieuw" | "in-behandeling" | "offerte" | "geboekt" | "verloren";
  aangemaakt: string;
}
export interface MijnBericht {
  id: string;
  soort: "bericht-klant" | "bericht-team";
  tekst: string;
  door: string;
  datum: string;
}
export interface MijnReview {
  id: string;
  boekingId: string;
  score: number;
  tekst: string;
  status: "nieuw" | "goedgekeurd" | "verborgen";
  antwoord: string;
}

const REVIEW_STATUS: Record<MijnReview["status"], string> = {
  nieuw: "wacht op goedkeuring",
  goedgekeurd: "staat op de site",
  verborgen: "niet gepubliceerd",
};

/** Beoordelen na een bezoek, of je beoordeling (met antwoord van het team) terugzien. */
function ReviewBlok({ review, plaats }: { review: MijnReview | undefined; plaats: (score: number, tekst: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [tekst, setTekst] = useState("");
  const [bezig, setBezig] = useState(false);

  if (review) {
    return (
      <div className="w-full rounded-xl bg-white p-3 text-sm">
        <p>
          <span className="text-schw-orange" aria-label={`${review.score} van 5 sterren`}>
            {sterren(review.score)}
          </span>{" "}
          <span className="text-schw-mute">· jouw beoordeling · {REVIEW_STATUS[review.status]}</span>
        </p>
        <p className="mt-1">&ldquo;{review.tekst}&rdquo;</p>
        {review.antwoord && <p className="mt-2 border-l-2 border-schw-orange pl-3 text-schw-mute">Het Schwarzwald: {review.antwoord}</p>}
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-schw-sun px-4 py-2 text-sm font-bold text-schw-night">
        ★ Beoordeel dit uitje
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setBezig(true);
        void plaats(score, tekst).finally(() => setBezig(false));
      }}
      className="w-full space-y-3 rounded-xl bg-white p-4"
    >
      <div role="radiogroup" aria-label="Aantal sterren" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} ${n === 1 ? "ster" : "sterren"}`}
            onClick={() => setScore(n)}
            className={`text-3xl leading-none ${n <= score ? "text-schw-orange" : "text-schw-night/20"}`}
          >
            ★
          </button>
        ))}
      </div>
      <label className="block text-sm font-semibold">
        Hoe was het?
        <textarea required minLength={10} maxLength={1500} rows={3} value={tekst} onChange={(e) => setTekst(e.target.value)} className={VELD} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={bezig || score === 0} className="rounded-full bg-schw-night px-5 py-2.5 text-sm font-bold text-schw-cream disabled:opacity-40">
          Plaats beoordeling
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-schw-night/15">
          Annuleren
        </button>
      </div>
      <p className="text-xs text-schw-mute">Op de site staat alleen je voornaam en de eerste letter van je achternaam.</p>
    </form>
  );
}

export interface Suggestie {
  slug: string;
  naam: string;
  kort: string;
  foto?: string | undefined;
  duurMin: number;
}

const API = "/api/voorstel/schwarzwald/account";
const VELD = "mt-1.5 w-full rounded-2xl border-0 bg-white px-4 py-3 text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";
const KAART = "rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8";
const BOEK_STATUS: Record<MijnBoeking["status"], [string, string]> = {
  nieuw: ["wacht op bevestiging", "bg-schw-sun text-schw-night"],
  bevestigd: ["bevestigd", "bg-[#DCFCE7] text-[#15803D]"],
  geannuleerd: ["geannuleerd", "bg-schw-sand text-schw-mute line-through"],
};
const AANVRAAG_STATUS: Record<MijnAanvraag["status"], [string, string]> = {
  nieuw: ["ontvangen", "bg-schw-sun text-schw-night"],
  "in-behandeling": ["we zijn ermee bezig", "bg-[#E0E7FF] text-[#3730A3]"],
  offerte: ["offerte verstuurd", "bg-[#FFEDD5] text-[#9A3412]"],
  geboekt: ["geboekt", "bg-[#DCFCE7] text-[#15803D]"],
  verloren: ["gesloten", "bg-schw-sand text-schw-mute"],
};
const FOUTEN: Record<string, string> = {
  "google-uit": "Inloggen met Google staat nog niet aan.",
  "google-verlopen": "Het inloggen met Google duurde te lang. Probeer het opnieuw.",
  "google-geannuleerd": "Inloggen met Google is afgebroken.",
  "google-mislukt": "Inloggen met Google is niet gelukt. Probeer het opnieuw of log in met e-mail.",
  "google-geen-email": "Google gaf geen bevestigd e-mailadres door.",
  geblokkeerd: "Dit account is geblokkeerd. Neem contact op met Het Schwarzwald.",
};

const dagNaam = (datum: string, opties: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) =>
  new Intl.DateTimeFormat("nl-NL", { ...opties, timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));
const dagenTot = (datum: string, vandaag: string) => Math.round((Date.parse(`${datum}T00:00:00Z`) - Date.parse(`${vandaag}T00:00:00Z`)) / 86_400_000);
const eindTijd = (tijd: string, duur: number) => {
  const m = Number(tijd.slice(0, 2)) * 60 + Number(tijd.slice(3)) + duur;
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

async function post(body: Record<string, unknown>) {
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!r.ok) throw new Error(d.error?.message ?? "Er ging iets mis.");
  return d;
}

function Melding({ fout, ok }: { fout?: string; ok?: string }) {
  if (fout) return <p role="alert" className="mt-4 rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">{fout}</p>;
  if (ok) return <p role="status" className="mt-4 rounded-2xl bg-[#DCFCE7] p-3 text-sm font-semibold text-[#15803D]">{ok}</p>;
  return null;
}

function GoogleKnop() {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- geen pagina maar een doorstuur naar Google; moet een volledige navigatie zijn
    <a
      href="/api/voorstel/schwarzwald/google"
      className="flex w-full items-center justify-center gap-3 rounded-full bg-white py-3.5 font-semibold text-schw-night ring-1 ring-schw-night/20 transition-colors hover:bg-schw-cream"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      Doorgaan met Google
    </a>
  );
}

function Inloggen({ googleAan, fout: startFout }: { googleAan: boolean; fout: string }) {
  const router = useRouter();
  const [modus, setModus] = useState<"inloggen" | "registreren">("inloggen");
  const [fout, setFout] = useState(FOUTEN[startFout] ?? "");
  const [bezig, setBezig] = useState(false);

  async function doe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBezig(true);
    setFout("");
    try {
      await post({ ...data, actie: modus });
      router.refresh();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className={KAART}>
        <div role="tablist" aria-label="Inloggen of account maken" className="grid grid-cols-2 gap-1 rounded-full bg-schw-sand p-1">
          {(["inloggen", "registreren"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modus === m}
              onClick={() => {
                setModus(m);
                setFout("");
              }}
              className={`rounded-full py-2.5 text-sm font-bold ${modus === m ? "bg-schw-night text-schw-cream" : "text-schw-night"}`}
            >
              {m === "inloggen" ? "Inloggen" : "Account maken"}
            </button>
          ))}
        </div>
        {googleAan && (
          <div className="mt-6">
            <GoogleKnop />
            <p className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-schw-mute">
              <span className="h-px flex-1 bg-schw-night/10" />
              of met e-mail
              <span className="h-px flex-1 bg-schw-night/10" />
            </p>
          </div>
        )}
        <form key={modus} onSubmit={(e) => void doe(e)} className={`space-y-4 ${googleAan ? "" : "mt-6"}`}>
          {modus === "registreren" && (
            <label className="block">
              <span className="text-sm font-semibold">Naam</span>
              <input name="naam" required autoComplete="name" className={VELD} />
            </label>
          )}
          <label className="block">
            <span className="text-sm font-semibold">E-mailadres</span>
            <input name="email" type="email" required autoComplete="email" className={VELD} />
          </label>
          {modus === "registreren" && (
            <label className="block">
              <span className="text-sm font-semibold">Telefoonnummer</span>
              <input name="telefoon" type="tel" required autoComplete="tel" className={VELD} />
            </label>
          )}
          <label className="block">
            <span className="text-sm font-semibold">{modus === "registreren" ? "Wachtwoord (minimaal 8 tekens)" : "Wachtwoord"}</span>
            <input
              name="wachtwoord"
              type="password"
              required
              minLength={modus === "registreren" ? 8 : undefined}
              autoComplete={modus === "registreren" ? "new-password" : "current-password"}
              className={VELD}
            />
          </label>
          <button type="submit" disabled={bezig} className="w-full rounded-full bg-schw-orange py-4 font-bold text-schw-night disabled:opacity-50">
            {bezig ? "Bezig…" : modus === "inloggen" ? "Inloggen" : "Account maken"}
          </button>
        </form>
        <Melding fout={fout} />
      </div>
      <div className="rounded-xl3 bg-schw-night p-6 text-schw-cream sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Met een account</p>
        <ul className="mt-5 space-y-4">
          {[
            ["Al je reserveringen op één plek", "Zie wanneer je komt, zet het in je agenda en annuleer zelf tot de dag ervoor."],
            ["Sneller reserveren", "Je gegevens staan al klaar bij de volgende boeking."],
            ["Je wensen bij het team", "Dieetwensen en allergieën ziet de keuken meteen bij je reservering."],
            ["Direct contact", "Stuur een bericht en lees het antwoord terug in je account."],
          ].map(([kop, tekst]) => (
            <li key={kop} className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-schw-orange text-xs font-bold text-schw-night">✓</span>
              <span>
                <strong className="block">{kop}</strong>
                <span className="text-sm text-schw-cream/75">{tekst}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-schw-cream/50">Dit is een proefaccount voor het ontwerpvoorstel van ZekerFlex. Er worden geen e-mails verstuurd.</p>
      </div>
    </div>
  );
}

/** Een eigen reservering naar een andere dag of tijd verzetten; de vrije tijden komen live uit de agenda. */
function Verzetten({ b, naam, vandaag, verzet, sluit }: { b: MijnBoeking; naam: string; vandaag: string; verzet: (datum: string, tijd: string) => Promise<boolean>; sluit: () => void }) {
  const [datum, setDatum] = useState("");
  const [sloten, setSloten] = useState<{ tijd: string; status: string }[] | null>(null);
  const [melding, setMelding] = useState("");
  const [tijd, setTijd] = useState("");
  const [bezig, setBezig] = useState(false);
  const gevraagd = useRef("");

  async function kies(d: string) {
    gevraagd.current = d;
    setDatum(d);
    setTijd("");
    setSloten(null);
    setMelding("");
    if (!d) return;
    try {
      const r = await fetch(`/api/voorstel/schwarzwald/agenda?activiteit=${encodeURIComponent(b.activiteit)}&personen=${b.personen}&datum=${d}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { status?: string; sloten?: { tijd: string; status: string }[]; error?: { message?: string } };
      if (gevraagd.current !== d) return; // intussen een andere dag gekozen
      if (!r.ok) throw new Error(j.error?.message ?? "De tijden konden niet geladen worden.");
      if (j.status === "verleden") setMelding("Deze datum is niet te boeken.");
      else if (j.status === "gesloten") setMelding("Op deze dag zijn we gesloten voor jullie groep.");
      setSloten(j.sloten ?? []);
    } catch (err) {
      if (gevraagd.current === d) setMelding(err instanceof Error ? err.message : "De tijden konden niet geladen worden.");
    }
  }

  return (
    <div className="w-full space-y-3 rounded-xl bg-white p-4">
      <p className="text-sm font-semibold">
        {naam} verzetten · {b.personen} personen
      </p>
      <label className="block text-sm font-semibold">
        Nieuwe datum
        <input type="date" min={plusDagen(vandaag, 1)} max={plusDagen(vandaag, VOORUIT_DAGEN)} value={datum} onChange={(e) => void kies(e.target.value)} className={VELD} />
      </label>
      {melding && <p className="text-sm font-semibold text-[#B91C1C]">{melding}</p>}
      {sloten && sloten.length > 0 && (
        <div role="radiogroup" aria-label="Nieuwe begintijd" className="flex flex-wrap gap-2">
          {sloten.map((s) => {
            const huidig = datum === b.datum && s.tijd === b.tijd;
            return (
              <button
                key={s.tijd}
                type="button"
                role="radio"
                aria-checked={tijd === s.tijd}
                disabled={s.status === "vol" || huidig}
                onClick={() => setTijd(s.tijd)}
                className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-35 ${tijd === s.tijd ? "bg-schw-night text-schw-cream" : "bg-schw-cream ring-1 ring-schw-night/10"}`}
              >
                {s.tijd}
                {huidig ? " (nu)" : s.status === "vol" ? " vol" : ""}
              </button>
            );
          })}
        </div>
      )}
      {sloten && sloten.length === 0 && !melding && <p className="text-sm text-schw-mute">Op deze dag zijn er geen tijden.</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!tijd || bezig}
          onClick={() => {
            setBezig(true);
            void verzet(datum, tijd).then((gelukt) => {
              setBezig(false);
              if (gelukt) sluit();
            });
          }}
          className="rounded-full bg-schw-night px-5 py-2.5 text-sm font-bold text-schw-cream disabled:opacity-40"
        >
          {tijd ? `Verzet naar ${dagNaam(datum, { weekday: "short", day: "numeric", month: "short" })} ${tijd}` : "Kies een dag en tijd"}
        </button>
        <button type="button" onClick={sluit} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-schw-night/15">
          Annuleren
        </button>
      </div>
      <p className="text-xs text-schw-mute">Het team bevestigt de nieuwe tijd opnieuw.</p>
    </div>
  );
}

/** Inzage (download) en zelf je account met alle gegevens wissen (AVG). */
function MijnGegevens({ heeftWachtwoord, gewist }: { heeftWachtwoord: boolean; gewist: () => void }) {
  const [open, setOpen] = useState(false);
  const [wachtwoord, setWachtwoord] = useState("");
  const [zeker, setZeker] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  async function wis(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      await post({ actie: "verwijderen", wachtwoord, bevestig: zeker });
      gewist();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Verwijderen is niet gelukt.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="rounded-2xl bg-schw-cream p-4">
      <h3 className="font-bold">Je gegevens</h3>
      <p className="mt-1 text-sm text-schw-mute">Download alles wat bij je account staat, of verwijder je account met al je gegevens.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <a href={`${API}/gegevens`} download className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold ring-1 ring-schw-night/15">
          Download mijn gegevens
        </a>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#B91C1C] ring-1 ring-[#B91C1C]/30">
            Account verwijderen
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={(e) => void wis(e)} className="mt-4 space-y-3 rounded-xl bg-white p-4">
          <p className="text-sm">
            Dit verwijdert je account, reserveringen, aanvragen, berichten, wensen, beoordelingen en sollicitaties. Dit kun je niet ongedaan maken.
          </p>
          {heeftWachtwoord && (
            <label className="block">
              <span className="text-sm font-semibold">Je wachtwoord</span>
              <input type="password" required autoComplete="current-password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} className={VELD} />
            </label>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required checked={zeker} onChange={(e) => setZeker(e.target.checked)} className="mt-1" />
            Ja, verwijder mijn account en al mijn gegevens.
          </label>
          {fout && (
            <p role="alert" className="rounded-xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
              {fout}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={bezig || !zeker} className="rounded-full bg-[#B91C1C] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">
              {bezig ? "Bezig…" : "Definitief verwijderen"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-schw-night/15">
              Annuleren
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

type Tab = "reserveringen" | "aanvragen" | "berichten" | "wensen" | "gegevens";

export function SchwarzwaldAccount(props: {
  account: AccountGegevens | null;
  boekingen: MijnBoeking[];
  aanvragen: MijnAanvraag[];
  berichten: MijnBericht[];
  wensen: string;
  namen: Record<string, string>;
  duur: Record<string, number>;
  suggesties: Suggestie[];
  reviews: MijnReview[];
  vandaag: string;
  googleAan: boolean;
  fout: string;
}) {
  const { account, boekingen, aanvragen, berichten, namen, duur, suggesties, vandaag } = props;
  const reviewPer = useMemo(() => new Map(props.reviews.map((r) => [r.boekingId, r])), [props.reviews]);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("reserveringen");
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [bezig, setBezig] = useState(false);
  const [wensen, setWensen] = useState(props.wensen);
  const [bericht, setBericht] = useState("");
  const [gewist, setGewist] = useState(false);
  const [verzetId, setVerzetId] = useState<string | null>(null);

  const komend = useMemo(() => boekingen.filter((b) => b.datum >= vandaag).sort((a, b) => `${a.datum}${a.tijd}`.localeCompare(`${b.datum}${b.tijd}`)), [boekingen, vandaag]);
  const eerder = useMemo(() => boekingen.filter((b) => b.datum < vandaag).sort((a, b) => `${b.datum}${b.tijd}`.localeCompare(`${a.datum}${a.tijd}`)), [boekingen, vandaag]);
  const volgende = komend.find((b) => b.status !== "geannuleerd");
  const openAanvragen = aanvragen.filter((a) => a.status !== "geboekt" && a.status !== "verloren");
  const gedaan = new Set(boekingen.map((b) => b.activiteit));
  const ontdek = suggesties.filter((s) => !gedaan.has(s.slug)).slice(0, 3);

  if (gewist) {
    return (
      <div role="status" className="mx-auto max-w-xl rounded-xl3 bg-white p-7 text-center shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-10">
        <h2 className="font-display text-3xl font-bold">Je account is verwijderd</h2>
        <p className="mt-3 text-schw-mute">Je account en al je gegevens zijn gewist en je bent uitgelogd. Je bent altijd weer welkom!</p>
        <Link href={BASE} className="mt-6 inline-block rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
          Naar de homepage
        </Link>
      </div>
    );
  }
  if (!account) return <Inloggen googleAan={props.googleAan} fout={props.fout} />;

  async function actie(body: Record<string, unknown>, melding: string) {
    setBezig(true);
    setFout("");
    setOk("");
    try {
      await post(body);
      setOk(melding);
      router.refresh();
      return true;
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er ging iets mis.");
      return false;
    } finally {
      setBezig(false);
    }
  }

  const agendaEvent = (b: MijnBoeking) => ({
    title: `${namen[b.activiteit] ?? b.activiteit} bij Het Schwarzwald`,
    startLocal: `${b.datum}T${b.tijd}:00`,
    endLocal: `${b.datum}T${eindTijd(b.tijd, duur[b.activiteit] ?? 60)}:00`,
    location: `${CONTACT.naam}, ${CONTACT.adres}, ${CONTACT.postcode}`,
    description: `Reservering ${b.id} voor ${b.personen} personen.`,
  });

  // een functie, geen component: een component die hier gedefinieerd wordt is
  // bij elke render een nieuw type, en dan verliest het beoordelingsformulier
  // zijn ingetypte tekst zodra er een melding verschijnt
  const boekingRij = (b: MijnBoeking) => {
    const [label, kleur] = BOEK_STATUS[b.status];
    return (
      <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-schw-cream p-4">
        <div>
          <p className="font-bold">
            {namen[b.activiteit] ?? b.activiteit} · {b.personen} personen
            <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${kleur}`}>{label}</span>
          </p>
          <p className="text-sm text-schw-mute first-letter:uppercase">
            {dagNaam(b.datum)} om {b.tijd} · nr. {b.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {b.status !== "geannuleerd" && b.datum >= vandaag && (
            <a href={googleCalendarUrl(agendaEvent(b))} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15">
              In agenda
            </a>
          )}
          {b.status !== "geannuleerd" && b.datum > vandaag && verzetId !== b.id && (
            <button type="button" disabled={bezig} onClick={() => setVerzetId(b.id)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15">
              Verzetten
            </button>
          )}
          {b.status !== "geannuleerd" && b.datum > vandaag && (
            <button
              type="button"
              disabled={bezig}
              onClick={() => {
                if (window.confirm(`${namen[b.activiteit] ?? b.activiteit} op ${dagNaam(b.datum)} annuleren?`)) void actie({ actie: "annuleren", datum: b.datum, id: b.id }, "Je reservering is geannuleerd.");
              }}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15"
            >
              Annuleren
            </button>
          )}
          {b.datum < vandaag && (
            <Link href={`${BASE}/reserveren?activiteit=${b.activiteit}`} className="rounded-full bg-schw-night px-4 py-2 text-sm font-bold text-schw-cream">
              Opnieuw boeken
            </Link>
          )}
        </div>
        {verzetId === b.id && (
          <Verzetten
            b={b}
            naam={namen[b.activiteit] ?? b.activiteit}
            vandaag={vandaag}
            verzet={(datum, tijd) =>
              actie({ actie: "verzetten", datum: b.datum, id: b.id, naarDatum: datum, naarTijd: tijd }, `Verzet naar ${dagNaam(datum)} om ${tijd}. Het team bevestigt de nieuwe tijd.`)
            }
            sluit={() => setVerzetId(null)}
          />
        )}
        {b.status !== "geannuleerd" && b.datum <= vandaag && (
          <ReviewBlok
            review={reviewPer.get(b.id)}
            plaats={(score, tekst) => actie({ actie: "review", boekingId: b.id, score, tekst }, "Dank je voor je beoordeling! Het team bekijkt hem en zet hem daarna op de site.")}
          />
        )}
      </li>
    );
  };

  const tegels: [string, number, Tab][] = [
    ["Komende uitjes", komend.filter((b) => b.status !== "geannuleerd").length, "reserveringen"],
    ["Eerdere uitjes", eerder.filter((b) => b.status !== "geannuleerd").length, "reserveringen"],
    ["Open aanvragen", openAanvragen.length, "aanvragen"],
    ["Berichten", berichten.length, "berichten"],
  ];

  return (
    <div className="space-y-6">
      {/* volgende uitje */}
      {volgende ? (
        <section className="relative overflow-hidden rounded-xl3 bg-schw-night p-6 text-schw-cream sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-schw-orange/30 blur-3xl" />
          <p className="relative text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Je volgende uitje</p>
          <div className="relative mt-3 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-3xl font-bold sm:text-4xl">{namen[volgende.activiteit] ?? volgende.activiteit}</h2>
              <p className="mt-2 text-lg text-schw-cream/85 first-letter:uppercase">
                {dagNaam(volgende.datum)} om {volgende.tijd} · {volgende.personen} personen
              </p>
            </div>
            <p className="font-display text-5xl font-bold text-schw-orange">
              {dagenTot(volgende.datum, vandaag) === 0 ? "Vandaag!" : dagenTot(volgende.datum, vandaag) === 1 ? "Morgen!" : `Nog ${dagenTot(volgende.datum, vandaag)} dagen`}
            </p>
          </div>
          <div className="relative mt-6 flex flex-wrap gap-3">
            <a href={googleCalendarUrl(agendaEvent(volgende))} target="_blank" rel="noopener noreferrer" className="rounded-full bg-schw-orange px-5 py-2.5 text-sm font-bold text-schw-night">
              Zet in Google Agenda
            </a>
            <a href={outlookCalendarUrl(agendaEvent(volgende))} target="_blank" rel="noopener noreferrer" className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-white/25">
              Outlook
            </a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${CONTACT.adres}, ${CONTACT.postcode}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full px-5 py-2.5 text-sm font-semibold ring-1 ring-white/25"
            >
              Route
            </a>
          </div>
        </section>
      ) : (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl3 bg-schw-night p-6 text-schw-cream sm:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">Nog niets gepland</p>
            <h2 className="mt-2 font-display text-3xl font-bold">Tijd voor een nieuw avontuur?</h2>
          </div>
          <Link href={`${BASE}/reserveren`} className="rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
            Reserveer je uitje
          </Link>
        </section>
      )}

      {/* tegels */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tegels.map(([k, v, t]) => (
          <button key={k} type="button" onClick={() => setTab(t)} className="rounded-2xl bg-white p-5 text-left shadow-[0_1px_2px_rgba(10,18,14,0.06)] hover:ring-2 hover:ring-schw-orange">
            <p className="text-sm text-schw-mute">{k}</p>
            <p className="mt-1 font-display text-3xl font-bold">{v}</p>
          </button>
        ))}
      </div>

      {/* tabbladen */}
      <div role="tablist" aria-label="Mijn account" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {(
          [
            ["reserveringen", "Reserveringen"],
            ["aanvragen", "Aanvragen"],
            ["berichten", "Berichten"],
            ["wensen", "Mijn wensen"],
            ["gegevens", "Mijn gegevens"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => {
              setTab(k);
              setOk("");
              setFout("");
            }}
            className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${tab === k ? "bg-schw-night text-schw-cream" : "bg-white ring-1 ring-schw-night/10"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <section role="tabpanel" className={KAART}>
        {tab === "reserveringen" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold">Mijn reserveringen</h2>
              <Link href={`${BASE}/reserveren`} className="rounded-full bg-schw-orange px-5 py-2.5 text-sm font-bold text-schw-night">
                + Nieuwe reservering
              </Link>
            </div>
            {komend.length === 0 && eerder.length === 0 && <p className="mt-4 text-schw-mute">Nog geen reserveringen.</p>}
            {komend.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-schw-mute">Komend</h3>
                <ul className="mt-3 space-y-3">{komend.map((b) => boekingRij(b))}</ul>
              </>
            )}
            {eerder.length > 0 && (
              <>
                <h3 className="mt-8 text-sm font-bold uppercase tracking-wide text-schw-mute">Eerder</h3>
                <ul className="mt-3 space-y-3">{eerder.map((b) => boekingRij(b))}</ul>
              </>
            )}
          </>
        )}

        {tab === "aanvragen" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-bold">Mijn aanvragen</h2>
              <Link href={`${BASE}/reserveren#aanvraag`} className="rounded-full bg-schw-night px-5 py-2.5 text-sm font-bold text-schw-cream">
                + Nieuwe aanvraag
              </Link>
            </div>
            <p className="mt-2 text-sm text-schw-mute">Voor themafeesten, bruiloften en grote groepen maakt het team een voorstel op maat.</p>
            {aanvragen.length === 0 ? (
              <p className="mt-4 text-schw-mute">Nog geen aanvragen.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {aanvragen.map((a) => {
                  const [label, kleur] = AANVRAAG_STATUS[a.status];
                  return (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-schw-cream p-4">
                      <div>
                        <p className="font-bold">{a.programma || a.gelegenheid || "Programma op maat"} · {a.personen} personen</p>
                        <p className="text-sm text-schw-mute">
                          {a.datum ? `Voor ${dagNaam(a.datum)}` : "Datum nog open"} · aangevraagd op {dagNaam(a.aangemaakt.slice(0, 10), { day: "numeric", month: "long" })}
                        </p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${kleur}`}>{label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === "berichten" && (
          <>
            <h2 className="font-display text-2xl font-bold">Berichten met Het Schwarzwald</h2>
            <ol className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {berichten.length === 0 && <li className="text-schw-mute">Nog geen berichten. Stel gerust je vraag of deel je wens.</li>}
              {[...berichten].reverse().map((m) => (
                <li key={m.id} className={`flex ${m.soort === "bericht-klant" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.soort === "bericht-klant" ? "bg-schw-orange text-schw-night" : "bg-schw-sand"}`}>
                    <p className="whitespace-pre-line">{m.tekst}</p>
                    <p className="mt-1 text-xs opacity-70">
                      {m.soort === "bericht-team" ? `${m.door} · Het Schwarzwald` : "Jij"} · {dagNaam(m.datum.slice(0, 10), { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void actie({ actie: "bericht", tekst: bericht }, "Bericht verstuurd. Het team antwoordt hier.").then((gelukt) => gelukt && setBericht(""));
              }}
              className="mt-5 flex flex-col gap-3 sm:flex-row"
            >
              <label className="sr-only" htmlFor="schw-bericht">Je bericht</label>
              <textarea id="schw-bericht" rows={2} required value={bericht} onChange={(e) => setBericht(e.target.value)} placeholder="Typ je bericht…" className={`${VELD} mt-0 flex-1`} />
              <button type="submit" disabled={bezig} className="rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream disabled:opacity-50 sm:self-end">
                Versturen
              </button>
            </form>
          </>
        )}

        {tab === "wensen" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void actie({ actie: "wensen", wensen }, "Je wensen zijn opgeslagen. Het team ziet ze bij je reserveringen.");
            }}
          >
            <h2 className="font-display text-2xl font-bold">Mijn wensen</h2>
            <p className="mt-2 text-schw-mute">Dieetwensen, allergieën of andere voorkeuren. De keuken en de begeleiding zien dit bij elke reservering van jou.</p>
            <textarea rows={5} maxLength={1000} value={wensen} onChange={(e) => setWensen(e.target.value)} placeholder="Bijvoorbeeld: 2 personen vegetarisch, 1 notenallergie, graag een rustige tafel." className={VELD} />
            <button type="submit" disabled={bezig} className="mt-4 rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream disabled:opacity-50">
              Opslaan
            </button>
          </form>
        )}

        {tab === "gegevens" && (
          <div className="grid gap-8 lg:grid-cols-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
                void actie({ ...d, actie: "profiel" }, "Je gegevens zijn opgeslagen.");
              }}
            >
              <h2 className="font-display text-2xl font-bold">Mijn gegevens</h2>
              <p className="mt-1 text-sm text-schw-mute">
                {account.email}
                {account.google && <span className="ml-2 rounded-full bg-schw-sand px-2 py-0.5 text-xs font-semibold">gekoppeld met Google</span>}
              </p>
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold">Naam</span>
                  <input name="naam" required defaultValue={account.naam} className={VELD} />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">Telefoonnummer</span>
                  <input name="telefoon" type="tel" required defaultValue={account.telefoon} className={VELD} />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold">{account.google ? "Wachtwoord instellen (mag leeg)" : "Nieuw wachtwoord (mag leeg)"}</span>
                  <input name="nieuwWachtwoord" type="password" minLength={8} autoComplete="new-password" className={VELD} />
                </label>
              </div>
              <button type="submit" disabled={bezig} className="mt-5 rounded-full bg-schw-night px-6 py-3 font-bold text-schw-cream disabled:opacity-50">
                Opslaan
              </button>
            </form>
            <div className="space-y-4">
              <h2 className="font-display text-2xl font-bold">Account</h2>
              <div className="flex flex-wrap gap-3">
                {account.rol === "beheerder" && (
                  <Link href={`${BASE}/beheer`} className="rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
                    Naar beheer
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => void post({ actie: "uitloggen" }).then(() => router.refresh()).catch(() => setFout("Uitloggen is niet gelukt."))}
                  className="rounded-full px-6 py-3 font-semibold ring-1 ring-schw-night/15"
                >
                  Uitloggen
                </button>
              </div>
              <MijnGegevens heeftWachtwoord={account.heeftWachtwoord} gewist={() => setGewist(true)} />
              <p className="text-sm text-schw-mute">Vragen over je gegevens? Stuur een bericht of bel {CONTACT.telefoon}.</p>
            </div>
          </div>
        )}
        <Melding fout={fout} ok={ok} />
      </section>

      {ontdek.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold">Nog niet gedaan</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {ontdek.map((s) => (
              <Link key={s.slug} href={`${BASE}/activiteiten/${s.slug}`} className="group overflow-hidden rounded-xl3 bg-white shadow-[0_1px_2px_rgba(10,18,14,0.06)]">
                <div className="relative aspect-[16/10] overflow-hidden bg-schw-forest">
                  {s.foto && <Image src={s.foto} alt="" fill sizes="(max-width: 640px) 100vw, 360px" className="object-cover transition-transform duration-700 group-hover:scale-105" />}
                </div>
                <div className="p-4">
                  <p className="font-display text-lg font-bold">{s.naam}</p>
                  <p className="text-sm text-schw-mute">{s.kort}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
