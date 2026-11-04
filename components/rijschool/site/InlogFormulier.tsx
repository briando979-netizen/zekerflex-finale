"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { sitePad } from "@/lib/rijschool/domein-pad";

// Inloggen in de app van de rijschool, als leerling of instructeur. Met een
// uitnodigingslink (?uitnodiging=…) kies je eerst je wachtwoord.

type Soort = "leerling" | "instructeur";

export function InlogFormulier({ slug, basis, uitnodiging, beginSoort }: { slug: string; basis: string; uitnodiging: string | null; beginSoort: Soort }) {
  const router = useRouter();
  const api = `/api/rijschool/site/${slug}/account`;
  const [soort, setSoort] = useState<Soort>(beginSoort);
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [herhaal, setHerhaal] = useState("");
  const [vergeten, setVergeten] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    setOk(null);
    if (uitnodiging && wachtwoord !== herhaal) return setFout("De twee wachtwoorden zijn niet gelijk.");
    setBezig(true);
    try {
      if (vergeten) {
        await stuur(api, "POST", { actie: "vergeten", soort, email });
        setOk("Als dit adres bij ons bekend is, krijg je binnen een paar minuten een mail met een link om een nieuw wachtwoord te kiezen.");
        return;
      }
      const r = uitnodiging
        ? await stuur<{ soort: Soort }>(api, "POST", { actie: "wachtwoord", token: uitnodiging, wachtwoord })
        : await stuur<{ soort: Soort }>(api, "POST", { actie: "inloggen", soort, email, wachtwoord });
      router.replace(sitePad(basis, `/${r.soort}`));
      router.refresh();
    } catch (err) {
      setFout(foutVan(err));
    } finally {
      setBezig(false);
    }
  }

  if (uitnodiging) {
    return (
      <form onSubmit={verstuur} className="space-y-4 rounded-2xl border border-hair bg-white p-6">
        <h1 className="font-display text-2xl font-bold">Kies je wachtwoord</h1>
        <p className="text-sm text-neutralx-600">Minstens 10 tekens. Daarna ben je meteen ingelogd.</p>
        <Veld label="Wachtwoord">
          <input className="field-input" type="password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} required minLength={10} maxLength={200} autoComplete="new-password" />
        </Veld>
        <Veld label="Nog een keer">
          <input className="field-input" type="password" value={herhaal} onChange={(e) => setHerhaal(e.target.value)} required minLength={10} maxLength={200} autoComplete="new-password" />
        </Veld>
        <Melding fout={fout} />
        <button type="submit" disabled={bezig} className="w-full rounded-full px-6 py-3 font-semibold text-white disabled:opacity-60" style={{ background: "var(--rs-kleur)" }}>
          {bezig ? "Bezig…" : "Wachtwoord opslaan"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verstuur} className="space-y-4 rounded-2xl border border-hair bg-white p-6">
      <h1 className="font-display text-2xl font-bold">{vergeten ? "Wachtwoord vergeten" : "Inloggen"}</h1>
      <div role="radiogroup" aria-label="Ik ben" className="grid grid-cols-2 gap-1 rounded-full bg-paper-soft p-1">
        {(["leerling", "instructeur"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={soort === s}
            onClick={() => setSoort(s)}
            className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${soort === s ? "bg-white shadow-sm" : "text-neutralx-600"}`}
          >
            {s}
          </button>
        ))}
      </div>
      <Veld label="E-mail">
        <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" />
      </Veld>
      {!vergeten && (
        <Veld label="Wachtwoord">
          <input className="field-input" type="password" value={wachtwoord} onChange={(e) => setWachtwoord(e.target.value)} required maxLength={200} autoComplete="current-password" />
        </Veld>
      )}
      <Melding fout={fout} ok={ok} />
      <button type="submit" disabled={bezig} className="w-full rounded-full px-6 py-3 font-semibold text-white disabled:opacity-60" style={{ background: "var(--rs-kleur)" }}>
        {bezig ? "Bezig…" : vergeten ? "Stuur een link" : "Inloggen"}
      </button>
      <button
        type="button"
        className="w-full text-center text-sm font-semibold underline underline-offset-2"
        onClick={() => {
          setVergeten(!vergeten);
          setFout(null);
          setOk(null);
        }}
      >
        {vergeten ? "Terug naar inloggen" : "Wachtwoord vergeten of nog geen wachtwoord?"}
      </button>
    </form>
  );
}
