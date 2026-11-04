"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { BEL_MOMENTEN, SOORT_LABEL, dealEuro, dealTotaal, type BelMoment, type DealOptie, type DealWeergave } from "@/lib/scans/model";

// ---------------------------------------------------------------------------
// Het voorstel op maat na een gratis scan: de opties die bij het bedrijf passen,
// aanbevolen opties vooraf aangevinkt, het totaal eenmalig en per maand, en
// "Ja, dit wil ik" (POST /api/deal/<id>). Er wordt niets automatisch afgeschreven.
// ---------------------------------------------------------------------------

function Prijs({ o }: { o: DealOptie }) {
  return (
    <span className="text-right">
      {o.eenmaligCent !== null && <span className="block font-display text-lg font-bold text-ink">{dealEuro(o.eenmaligCent)} <span className="text-xs font-medium text-neutralx-500">eenmalig</span></span>}
      {o.maandCent !== null && <span className="block font-display text-lg font-bold text-ink">{dealEuro(o.maandCent)} <span className="text-xs font-medium text-neutralx-500">per maand</span></span>}
      {o.prijsTekst && <span className="block text-xs text-neutralx-600">{o.prijsTekst}</span>}
    </span>
  );
}

function OptieKaart({ o, aan, onWissel, uit }: { o: DealOptie; aan: boolean; onWissel: () => void; uit: boolean }) {
  const id = useId();
  return (
    <li>
      <label htmlFor={id} className={`flex cursor-pointer gap-4 rounded-2xl border-2 bg-white p-4 transition sm:p-5 ${aan ? "border-brand-600 shadow-e1" : "border-hair hover:border-brand-500"} ${uit ? "cursor-default opacity-90" : ""}`}>
        <input id={id} type="checkbox" checked={aan} onChange={onWissel} disabled={uit} className="mt-1 h-5 w-5 flex-shrink-0 accent-brand-600" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block font-display text-lg font-bold text-ink">{o.naam}</span>
              {o.aanbevolen && <span className="pill-ok mt-1 inline-flex">Aanbevolen voor jou</span>}
            </span>
            <Prijs o={o} />
          </span>
          <span className="mt-2 block text-sm text-neutralx-600">{o.uitleg}</span>
          <span className="mt-2 block text-sm text-ink">
            <strong>Waarom voor jou:</strong> {o.waarom}
          </span>
        </span>
      </label>
    </li>
  );
}

/** "Bel me eerst terug": voor wie nog geen ja wil zeggen maar wel wil overleggen. Een eigen formulier, los van het akkoord. */
function Terugbellen({ dealId, al }: { dealId: string; al: boolean }) {
  const id = useId();
  const [f, setF] = useState<{ naam: string; telefoon: string; moment: BelMoment; vraag: string; consent: boolean }>({ naam: "", telefoon: "", moment: "maakt_niet_uit", vraag: "", consent: false });
  const [stand, setStand] = useState<"open" | "bezig" | "klaar">(al ? "klaar" : "open");
  const [fout, setFout] = useState<string | null>(null);

  const stuur = async (e: FormEvent) => {
    e.preventDefault();
    setStand("bezig");
    setFout(null);
    const res = await fetch(`/api/deal/${dealId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "terugbellen", naam: f.naam, telefoon: f.telefoon, moment: f.moment, ...(f.vraag.trim() ? { vraag: f.vraag } : {}), consent: f.consent }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setFout(body?.error?.message ?? "Versturen lukte niet. Probeer het opnieuw.");
      setStand("open");
      return;
    }
    setStand("klaar");
  };

  if (stand === "klaar") {
    return (
      <p role="status" className="mt-6 rounded-2xl border border-hair bg-white p-5 text-sm text-ink">
        <strong className="block font-display text-lg">We bellen je terug</strong>
        <span className="mt-1 block text-neutralx-600">Je verzoek is binnen. We bellen je op een werkdag op het moment dat je koos, en nemen het voorstel samen door.</span>
      </p>
    );
  }
  return (
    <details className="group mt-6 rounded-2xl border border-hair bg-white p-5">
      <summary className="cursor-pointer list-none font-display text-lg font-bold text-ink">
        Eerst even overleggen? <span className="font-sans text-sm font-semibold text-brand-700 group-open:hidden">Laat je bellen</span>
      </summary>
      <form onSubmit={stuur} className="mt-4">
        <p className="text-sm text-neutralx-600">Laat je nummer achter, dan bellen we je terug om je vragen te beantwoorden. Je zit nergens aan vast.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-neutralx-700" htmlFor={`${id}-naam`}>
            Naam
            <input id={`${id}-naam`} className="field-input mt-1" required maxLength={120} value={f.naam} onChange={(e) => setF({ ...f, naam: e.target.value })} autoComplete="name" />
          </label>
          <label className="text-sm text-neutralx-700" htmlFor={`${id}-tel`}>
            Telefoonnummer
            <input id={`${id}-tel`} className="field-input mt-1" type="tel" required minLength={8} maxLength={40} value={f.telefoon} onChange={(e) => setF({ ...f, telefoon: e.target.value })} autoComplete="tel" />
          </label>
          <label className="text-sm text-neutralx-700" htmlFor={`${id}-moment`}>
            Beste moment
            <select id={`${id}-moment`} className="field-input mt-1" value={f.moment} onChange={(e) => setF({ ...f, moment: e.target.value as BelMoment })}>
              {(Object.keys(BEL_MOMENTEN) as BelMoment[]).map((m) => (
                <option key={m} value={m}>
                  {BEL_MOMENTEN[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-neutralx-700" htmlFor={`${id}-vraag`}>
            Je vraag (mag leeg)
            <input id={`${id}-vraag`} className="field-input mt-1" maxLength={500} value={f.vraag} onChange={(e) => setF({ ...f, vraag: e.target.value })} />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-neutralx-700">
          <input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5" />
          <span>
            ZekerFlex mag me bellen over dit voorstel (zie de{" "}
            <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">
              privacyverklaring
            </Link>
            ).
          </span>
        </label>
        {fout && (
          <p role="alert" className="mt-3 text-sm text-crit">
            {fout}
          </p>
        )}
        <button type="submit" className="btn-ghost mt-4" disabled={stand === "bezig"}>
          {stand === "bezig" ? "Versturen…" : "Bel me terug"}
        </button>
      </form>
    </details>
  );
}

export function DealOpMaat({ deal }: { deal: DealWeergave }) {
  const id = useId();
  const [keuze, setKeuze] = useState<string[]>(deal.keuze);
  const [f, setF] = useState({ naam: "", email: "", telefoon: "", consent: false });
  const [stand, setStand] = useState<"open" | "bezig" | "klaar">(deal.status === "akkoord" ? "klaar" : "open");
  const [fout, setFout] = useState<string | null>(null);
  const totaal = useMemo(() => dealTotaal(deal.opties, keuze), [deal.opties, keuze]);
  const dicht = deal.verlopen || stand === "klaar";

  useEffect(() => {
    // "bekeken" vanuit de browser: een linkvoorbeeld in een mail of app telt zo niet mee
    if (deal.status === "open" && !deal.verlopen) void fetch(`/api/deal/${deal.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actie: "bekeken" }) }).catch(() => undefined);
  }, [deal.id, deal.status, deal.verlopen]);

  const wissel = (oid: string) =>
    setKeuze((k) => {
      if (k.includes(oid)) return k.filter((x) => x !== oid);
      // Basis en Pro sluiten elkaar uit
      const zonder = oid === "beheer-pro" ? k.filter((x) => x !== "beheer-basis") : oid === "beheer-basis" ? k.filter((x) => x !== "beheer-pro") : k;
      return [...zonder, oid];
    });

  const stuur = async (e: FormEvent) => {
    e.preventDefault();
    if (keuze.length === 0) {
      setFout("Kies minstens één optie.");
      return;
    }
    setStand("bezig");
    setFout(null);
    const res = await fetch(`/api/deal/${deal.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actie: "akkoord", naam: f.naam, email: f.email, ...(f.telefoon.trim() ? { telefoon: f.telefoon } : {}), keuze, consent: f.consent }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: { message?: string } } | null;
      setFout(body?.error?.message ?? "Versturen lukte niet. Probeer het opnieuw.");
      setStand("open");
      return;
    }
    setStand("klaar");
  };

  const geldig = new Date(deal.geldigTot).toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" });
  return (
    <div className="mx-auto max-w-4xl">
      <p className="eyebrow">Voorstel op maat</p>
      <h1 className="mt-2 break-words font-display text-3xl font-bold leading-tight text-ink md:text-4xl">Voor {deal.bedrijf.naam}</h1>
      <p className="mt-3 max-w-2xl text-neutralx-600">
        Op basis van je {SOORT_LABEL[deal.soort].toLowerCase()} (score {deal.score} van 100: {deal.samenvatting}) hebben we gekozen wat het meeste oplevert. Vink aan wat je wilt; je ziet meteen wat het kost.
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={deal.rapport} className="font-semibold text-brand-700 hover:underline">
          Bekijk je rapport
        </Link>
        {deal.siteSlug && (
          <a href={`/site/${deal.siteSlug}`} target="_blank" rel="noopener" className="font-semibold text-brand-700 hover:underline">
            Bekijk je nieuwe website ↗
          </a>
        )}
      </p>

      {deal.verlopen && (
        <p role="status" className="mt-6 rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm text-ink">
          Dit voorstel is verlopen. Doe de{" "}
          <Link href="/website-check" className="font-semibold text-brand-700 underline">
            gratis website-check
          </Link>{" "}
          opnieuw voor een nieuw voorstel met de prijzen van nu.
        </p>
      )}

      <ul className="mt-8 space-y-3" aria-label="Opties in je voorstel">
        {deal.opties.map((o) => (
          <OptieKaart key={o.id} o={o} aan={keuze.includes(o.id)} onWissel={() => wissel(o.id)} uit={dicht} />
        ))}
      </ul>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby={`${id}-totaal`} className="rounded-2xl bg-ink p-6 text-white">
          <h2 id={`${id}-totaal`} className="text-sm font-semibold uppercase tracking-wide text-white/70">
            Jouw keuze
          </h2>
          <p className="mt-3 font-display text-3xl font-bold" aria-live="polite">
            {dealEuro(totaal.eenmaligCent)} <span className="text-base font-medium text-white/70">eenmalig</span>
          </p>
          <p className="font-display text-2xl font-bold">
            + {dealEuro(totaal.maandCent)} <span className="text-base font-medium text-white/70">per maand</span>
          </p>
          <p className="mt-3 text-xs text-white/60">Alle bedragen exclusief btw. Website-beheer is maandelijks opzegbaar. Dit voorstel geldt tot {geldig}.</p>
        </section>

        {stand === "klaar" ? (
          <p role="status" className="rounded-2xl border border-hair bg-white p-6 text-ink">
            <strong className="block font-display text-xl">Bedankt, je keuze is binnen</strong>
            <span className="mt-2 block text-sm text-neutralx-600">We nemen binnen één werkdag contact met je op. Er wordt niets afgeschreven voordat we samen alles hebben doorgenomen.</span>
          </p>
        ) : (
          !deal.verlopen && (
            <form onSubmit={stuur} className="rounded-2xl border border-hair bg-white p-6">
              <h2 className="font-display text-xl font-bold text-ink">Ja, dit wil ik</h2>
              <p className="mt-1 text-sm text-neutralx-600">We bellen of mailen je om alles door te nemen. Pas daarna gaan we aan de slag.</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm text-neutralx-700" htmlFor={`${id}-naam`}>
                  Naam
                  <input id={`${id}-naam`} className="field-input mt-1" required maxLength={120} value={f.naam} onChange={(e) => setF({ ...f, naam: e.target.value })} autoComplete="name" />
                </label>
                <label className="text-sm text-neutralx-700" htmlFor={`${id}-mail`}>
                  E-mailadres
                  <input id={`${id}-mail`} className="field-input mt-1" type="email" required maxLength={200} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
                </label>
                <label className="text-sm text-neutralx-700 sm:col-span-2" htmlFor={`${id}-tel`}>
                  Telefoon (mag leeg)
                  <input id={`${id}-tel`} className="field-input mt-1" type="tel" maxLength={40} value={f.telefoon} onChange={(e) => setF({ ...f, telefoon: e.target.value })} autoComplete="tel" />
                </label>
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm text-neutralx-700">
                <input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5" />
                <span>
                  ZekerFlex mag contact met me opnemen over dit voorstel (zie de{" "}
                  <Link href="/privacy" className="font-semibold text-brand-700 hover:underline">
                    privacyverklaring
                  </Link>
                  ).
                </span>
              </label>
              {fout && (
                <p role="alert" className="mt-3 text-sm text-crit">
                  {fout}
                </p>
              )}
              <button type="submit" className="btn-primary mt-4 w-full" disabled={stand === "bezig"}>
                {stand === "bezig" ? "Versturen…" : "Ja, dit wil ik"}
              </button>
            </form>
          )
        )}
      </div>
      {!dicht && <Terugbellen dealId={deal.id} al={deal.terugbellenAt !== null} />}
    </div>
  );
}
