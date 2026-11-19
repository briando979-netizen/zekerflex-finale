"use client";

import { useState, type FormEvent } from "react";
import { API, KNOP, LABEL, Melding, VELD, foutTekst, vraag } from "@/components/voorstel/smileyapp/beheer/api";

// De kaart vóór het beheer: inloggen met e-mailadres en wachtwoord, of (met de
// link uit de uitnodigingsmail) een wachtwoord kiezen. Er is geen registratie:
// je komt alleen binnen met een uitnodiging van een beheerder.

/** Na inloggen of een wachtwoord kiezen: het beheer laden, zonder het token in de adresbalk. */
function naarBeheer() {
  window.location.replace(window.location.pathname);
}

export function Inlogkaart() {
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

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
      <p className="text-center text-sm leading-relaxed text-smiley-mute">Nog geen account? Je komt alleen binnen met een uitnodiging van een beheerder van SmileyApp.</p>
    </form>
  );
}

export function WachtwoordKiezen({ token, email, minimaal }: { token: string; email: string; minimaal: number }) {
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
      await vraag(`${API}/account`, { method: "POST", body: { actie: "aannemen", token, wachtwoord } });
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
