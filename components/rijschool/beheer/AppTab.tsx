"use client";

import { useState } from "react";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";

// De apps van de rijschool. De leerling- en instructeur-app werken nu al in
// de browser en zijn op het beginscherm te zetten. Indienen bij Google Play
// is de volgende stap; hier staat eerlijk wat er nu kan en hoe dat gaat.

const PLAY_STAPPEN = [
  { titel: "App klaarmaken", tekst: "ZekerFlex bouwt de app met je naam, logo en kleuren, en vult de winkelpagina met je teksten." },
  { titel: "Interne test", tekst: "Jij en je instructeurs installeren de testversie via een link." },
  { titel: "Gesloten test", tekst: "Google vraagt voor nieuwe accounts minstens 12 testers die de app 14 dagen gebruiken. Je leerlingen kunnen dat zijn." },
  { titel: "Beoordeling door Google", tekst: "Google controleert de app. Dat duurt meestal een paar dagen." },
  { titel: "Live in Google Play", tekst: "Je krijgt de link naar je app in de winkel, om op je website en in mails te zetten." },
];

export function AppTab({ data }: { data: BeheerWeergave }) {
  const r = data.rijschool;
  const leerlingUrl = `${r.url}/leerling`;
  const instructeurUrl = `${r.url}/instructeur`;
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);

  async function kopieer(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setGekopieerd(url);
    } catch {
      setGekopieerd(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card space-y-4 p-5">
        <div>
          <span className="pill-ok">Werkt nu</span>
          <h2 className="mt-2 font-display text-lg font-bold text-ink">De app op de telefoon</h2>
          <p className="mt-1 text-sm text-neutralx-600">
            Je leerlingen en instructeurs openen de app in hun browser en zetten hem op hun beginscherm. Dan staat hij tussen hun andere apps, met de naam van je rijschool.
          </p>
        </div>
        {[
          { label: "Leerling-app", url: leerlingUrl, tekst: "Lessen, voortgang per onderdeel, huiswerk, tegoed en theorie oefenen." },
          { label: "Instructeur-app", url: instructeurUrl, tekst: "Lesdag, leskaart invullen tijdens de les, volgende les plannen en betaling in de auto." },
        ].map((a) => (
          <div key={a.label} className="rounded-xl border border-hair p-4">
            <p className="font-semibold text-ink">{a.label}</p>
            <p className="text-sm text-neutralx-600">{a.tekst}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-paper-soft px-2 py-1 text-xs">{a.url}</code>
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => kopieer(a.url)}>
                {gekopieerd === a.url ? "Gekopieerd" : "Kopieer link"}
              </button>
              <a href={a.url} target="_blank" rel="noopener" className="btn-ghost !px-3 !py-1.5 text-xs">
                Openen
              </a>
            </div>
          </div>
        ))}
        <div className="rounded-xl bg-paper-soft p-4 text-sm text-ink">
          <p className="font-semibold">Op het beginscherm zetten</p>
          <p className="mt-1 text-neutralx-600">iPhone: open de link in Safari, tik op Delen en kies &quot;Zet op beginscherm&quot;.</p>
          <p className="text-neutralx-600">Android: open de link in Chrome, tik op het menu (drie puntjes) en kies &quot;Toevoegen aan startscherm&quot;.</p>
          <p className="mt-1 text-neutralx-600">Een leerling krijgt de link vanzelf in de mail waarmee hij zijn wachtwoord kiest.</p>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <span className="pill-warn">In voorbereiding</span>
          <h2 className="mt-2 font-display text-lg font-bold text-ink">Je eigen app in Google Play</h2>
          <p className="mt-1 text-sm text-neutralx-600">
            Straks dien je hier met één knop je eigen rijschool-app in. Daarna volg je hier dezelfde stappen als in Google Play, van test tot live, en krijg je de link naar je
            app in de winkel.
          </p>
        </div>
        <ol className="space-y-3">
          {PLAY_STAPPEN.map((s, i) => (
            <li key={s.titel} className="flex gap-3">
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-paper-soft text-sm font-semibold text-neutralx-600 ring-1 ring-hair">{i + 1}</span>
              <span>
                <span className="block text-sm font-semibold text-ink">{s.titel}</span>
                <span className="block text-sm text-neutralx-600">{s.tekst}</span>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn-primary w-full" disabled>
          Indienen voor beoordeling (binnenkort)
        </button>
      </section>
    </div>
  );
}
