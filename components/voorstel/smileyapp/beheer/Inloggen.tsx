"use client";

import { useState, type FormEvent } from "react";
import { API, KNOP, LABEL, Melding, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// De kaart vóór het beheer: inloggen met e-mailadres en wachtwoord, of (met de
// link uit de uitnodigingsmail) een wachtwoord kiezen. Er is geen registratie:
// je komt alleen binnen met een uitnodiging van een beheerder. Wachtwoord
// vergeten: je vult je adres in en krijgt (als het bekend is) een mail met een
// link; het scherm zegt altijd hetzelfde, dus het verraadt niets over een adres.

/** De vaste zin als de server geen eigen melding meestuurt (gelijk aan HERSTEL_ANTWOORD op de server). */
const VERGETEN_KLAAR = "Als dit adres bij ons bekend is, staat er zo een mail in je postvak.";

/** Na inloggen of een wachtwoord kiezen: het beheer laden, zonder het token in de adresbalk. */
function naarBeheer() {
  window.location.replace(window.location.pathname);
}

export function Inlogkaart() {
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [vergeten, setVergeten] = useState(false);
  const [klaar, setKlaar] = useState("");

  async function vraagLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    setFout("");
    try {
      const d = await vraag<{ melding?: string }>(`${API}/account`, { method: "POST", body: { actie: "vergeten", email } });
      setKlaar(d.melding ?? VERGETEN_KLAAR);
    } catch (err) {
      setFout(foutTekst(err, "Dat lukte niet. Probeer het opnieuw."));
    } finally {
      setBezig(false);
    }
  }

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    setFout("");
    try {
      await vraag(`${API}/account`, { method: "POST", body: { actie: "inloggen", email, wachtwoord } });
      naarBeheer();
    } catch (err) {
      setFout(foutTekst(err, "Inloggen lukte niet."));
      setBezig(false);
    }
  }

  if (vergeten) {
    return (
      <form onSubmit={(e) => void vraagLink(e)} className="mt-6 space-y-4 text-left">
        <p className="text-sm leading-relaxed text-smiley-mute">Vul je e-mailadres in. Je krijgt een mail met een link om een nieuw wachtwoord te kiezen. De link werkt een uur.</p>
        <div>
          <label htmlFor="sm-vergeten-email" className={LABEL}>
            E-mailadres
          </label>
          <input id="sm-vergeten-email" type="email" autoComplete="username" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={`mt-1.5 ${VELD}`} />
        </div>
        <Melding fout={fout} ok={klaar} />
        <button type="submit" disabled={bezig} className={`w-full py-3.5 ${KNOP}`}>
          {bezig ? "Bezig…" : klaar ? "Stuur de mail opnieuw" : "Stuur mij een link"}
        </button>
        <button
          type="button"
          onClick={() => {
            setVergeten(false);
            setFout("");
            setKlaar("");
          }}
          className="mx-auto block text-sm font-semibold text-smiley-leaf underline underline-offset-4"
        >
          Terug naar inloggen
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => void login(e)} className="mt-6 space-y-4 text-left">
      <div>
        <label htmlFor="sm-login-email" className={LABEL}>
          E-mailadres
        </label>
        <input id="sm-login-email" type="email" autoComplete="username" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className={`mt-1.5 ${VELD}`} />
      </div>
      <div>
        <label htmlFor="sm-login-wachtwoord" className={LABEL}>
          Wachtwoord
        </label>
        <input id="sm-login-wachtwoord" type="password" autoComplete="current-password" required maxLength={200} value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} className={`mt-1.5 ${VELD}`} />
      </div>
      <Melding fout={fout} />
      <button type="submit" disabled={bezig} className={`w-full py-3.5 ${KNOP}`}>
        {bezig ? "Bezig…" : "Inloggen"}
      </button>
      <button
        type="button"
        onClick={() => {
          setVergeten(true);
          setFout("");
        }}
        className="mx-auto block text-sm font-semibold text-smiley-leaf underline underline-offset-4"
      >
        Wachtwoord vergeten?
      </button>
      <p className="text-center text-sm leading-relaxed text-smiley-mute">Nog geen account? Je komt alleen binnen met een uitnodiging van een beheerder van SmileyApp.</p>
    </form>
  );
}

/** `herstel`: de link komt uit "wachtwoord vergeten" in plaats van uit een uitnodiging. */
export function WachtwoordKiezen({ token, email, minimaal, herstel = false }: { token: string; email: string; minimaal: number; herstel?: boolean }) {
  const [wachtwoord, setWachtwoord] = useState("");
  const [herhaal, setHerhaal] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  async function kies(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bezig) return;
    if (wachtwoord.length < minimaal) return setFout(`Kies een wachtwoord van minimaal ${minimaal} tekens.`);
    if (wachtwoord !== herhaal) return setFout("De twee wachtwoorden zijn niet gelijk.");
    setBezig(true);
    setFout("");
    try {
      if (herstel) await vraag(`${API}/account`, { method: "POST", body: { actie: "nieuw-wachtwoord", token, wachtwoord } });
      else await vraag(`${API}/account`, { method: "POST", body: { actie: "aannemen", token, wachtwoord } });
      naarBeheer();
    } catch (err) {
      setFout(foutTekst(err, "Opslaan lukte niet."));
      setBezig(false);
    }
  }

  return (
    <form onSubmit={(e) => void kies(e)} className="mt-6 space-y-4 text-left">
      {/* het adres staat erbij voor de wachtwoordmanager van de browser */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div>
        <label htmlFor="sm-kies-wachtwoord" className={LABEL}>
          Nieuw wachtwoord
        </label>
        <input
          id="sm-kies-wachtwoord"
          type="password"
          autoComplete="new-password"
          required
          minLength={minimaal}
          maxLength={200}
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
          aria-describedby="sm-kies-uitleg"
          className={`mt-1.5 ${VELD}`}
        />
        <p id="sm-kies-uitleg" className="mt-1.5 text-sm text-smiley-mute">
          Minimaal {minimaal} tekens.
        </p>
      </div>
      <div>
        <label htmlFor="sm-kies-herhaal" className={LABEL}>
          Herhaal het wachtwoord
        </label>
        <input id="sm-kies-herhaal" type="password" autoComplete="new-password" required maxLength={200} value={herhaal} onChange={(e) => setHerhaal(e.target.value)} className={`mt-1.5 ${VELD}`} />
      </div>
      <Melding fout={fout} />
      <button type="submit" disabled={bezig} className={`w-full py-3.5 ${KNOP}`}>
        {bezig ? "Bezig…" : "Wachtwoord opslaan en inloggen"}
      </button>
    </form>
  );
}
