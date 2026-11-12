"use client";

import Link from "next/link";
import { useState } from "react";
import type { HuidigAbonnement, PlanRegel, UitbreidingGroep } from "@/lib/abonnement/overzicht";
import { REGEL_OP_WEBSITE } from "@/lib/abonnement/overzicht";

// Abonnement en uitbreidingen. Kleuren: geld = goud (money), "wacht op jou" = amber (warn).
// In de Android- en iPhone-app staat hier nooit een koopknop (Play en Apple hebben eigen betaalregels
// voor digitale abonnementen): alleen het overzicht en de regel dat je het op zekerflex.com regelt.

export function AbonnementScherm({ huidig, plannen, groepen, inApp }: { huidig: HuidigAbonnement; plannen: PlanRegel[]; groepen: UitbreidingGroep[]; inApp: boolean }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function koop(planKey: string) {
    setBezig(planKey);
    setFout(null);
    try {
      const res = await fetch("/api/werkgever/saas-subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      const d = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
      if (res.ok && d.url) {
        window.location.href = d.url;
        return;
      }
      setFout(d.error?.message ?? "Abonneren lukte niet. Probeer het later opnieuw.");
    } catch {
      setFout("Netwerkfout. Probeer het later opnieuw.");
    }
    setBezig(null);
  }

  const huidigNaam = plannen.find((p) => p.sleutel === huidig.plan)?.naam ?? "Starter";
  const tot = huidig.tot ? new Date(huidig.tot).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" }) : null;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">Abonnement en uitbreidingen</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutralx-600">Hier zie je wat je nu hebt en wat je erbij kunt nemen. Alles wat gratis is, blijft gratis; je betaalt alleen voor wat je zelf aanzet.</p>
      </header>

      {inApp && (
        <div role="note" className="rounded-2xl bg-white p-5 shadow-card">
          <p className="text-sm font-semibold text-warn">Regel dit op zekerflex.com</p>
          <p className="mt-1 text-sm text-neutralx-600">{REGEL_OP_WEBSITE}</p>
        </div>
      )}

      <section aria-labelledby="abo-nu" className="rounded-2xl bg-white p-6 shadow-card">
        <h2 id="abo-nu" className="font-display text-lg font-bold text-ink">Jouw abonnement</h2>
        <p className="mt-2 text-sm text-ink">
          Je hebt <strong>{huidigNaam}</strong>
          {huidig.status === "opgezegd" && tot ? `, je vorige abonnement liep tot ${tot}` : ""}.
        </p>
        {huidig.status === "betaling-mislukt" && (
          <p role="alert" className="mt-2 text-sm font-semibold text-warn">
            De laatste betaling is niet gelukt. Dat kun je oplossen op zekerflex.com, bij de betaalgegevens van je abonnement.
          </p>
        )}
        {huidig.status === "actief" && tot && huidig.plan !== "starter" && <p className="mt-1 text-sm text-neutralx-600">Lopende periode tot {tot}.</p>}
      </section>

      <section aria-labelledby="abo-plannen">
        <h2 id="abo-plannen" className="mb-4 font-display text-lg font-bold text-ink">Abonnementen</h2>
        {fout && <p role="alert" className="mb-3 text-sm font-semibold text-warn">{fout}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plannen.map((p) => (
            <article key={p.sleutel} className="relative flex flex-col rounded-2xl bg-white p-5 shadow-card" aria-current={p.actie === "huidig" ? "true" : undefined}>
              <h3 className="font-display text-base font-bold text-ink">
                {p.naam}
                {p.actie === "huidig" && <span className="ml-2 text-xs font-semibold text-money-ink">Dit heb je</span>}
              </h3>
              <p className="mt-1 text-lg font-bold text-money-ink">{p.prijs}</p>
              <p className="mt-2 text-sm text-neutralx-600">{p.tagline}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
                {p.punten.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <div className="mt-auto pt-4">
                {!inApp && p.actie === "kopen" && (
                  <button type="button" className="btn-primary w-full" disabled={bezig !== null} onClick={() => void koop(p.sleutel)}>
                    {bezig === p.sleutel ? "Even geduld…" : `Kies ${p.naam}`}
                  </button>
                )}
                {!inApp && p.actie === "contact" && (
                  <a className="btn-secondary block w-full text-center" href="mailto:sales@zekerflex.com?subject=Abonnement%20op%20maat">
                    Neem contact op
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="abo-uitbreidingen">
        <h2 id="abo-uitbreidingen" className="mb-1 font-display text-lg font-bold text-ink">Uitbreidingen</h2>
        <p className="mb-5 max-w-2xl text-sm text-neutralx-600">Onderdelen die je erbij kunt nemen. Een prijs staat er alleen als die vastligt; anders staat er &quot;Prijs volgt&quot;.</p>
        <div className="space-y-8">
          {groepen.map((g) => (
            <div key={g.pijler}>
              <h3 className="mb-3 font-display text-base font-bold text-ink">{g.naam}</h3>
              <ul className="grid gap-3 sm:grid-cols-2">
                {g.items.map((i) => (
                  <li key={i.slug} className="relative rounded-2xl bg-white p-4 shadow-card">
                    <p className="text-sm font-semibold text-ink">
                      <Link href={i.href} className="underline-offset-2 hover:underline">{i.naam}</Link>
                      {!i.beschikbaar && <span className="ml-2 text-xs font-semibold text-warn">Binnenkort</span>}
                    </p>
                    <p className="mt-1 text-sm text-neutralx-600">{i.kort}</p>
                    <p className="mt-2 text-sm font-semibold text-money-ink">{i.prijs}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
