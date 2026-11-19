"use client";

import { useState } from "react";
import Link from "next/link";
import { BEWAAR_DAGEN } from "@/lib/advertentie/regels";
import { LOGOS, VARIANTEN, VARIANT_IDS, type Logo, type LogoNr, type VariantId } from "@/lib/logo/regels";

// De eigen pagina van de logo maker. De beelden komen van de server (GET /api/logo-maker/<id>/beeld); zolang een logo
// niet is vrijgegeven, is dat altijd een klein beeld met ingebakken watermerk. Slepen, het contextmenu en selecteren
// staan uit, maar dat is alleen gemak: de echte bescherming is dat de schone versie hier niet bestaat.

const beeld = (id: string, nr: number, extra = "") => `/api/logo-maker/${id}/beeld?logo=${nr}${extra}`;
const geenMenu = (e: React.MouseEvent) => e.preventDefault();
/** De ondergrond waarop een variant getoond wordt: wit logo op donker, de rest op licht. */
const ONDERGROND: Record<VariantId, string> = { "kleur-wit": "#FFFFFF", kleur: "#F3F1EA", wit: "#17211C", zwart: "#F3F1EA", icoon: "#F3F1EA" };

export function LogoResultaat({ id, naam: bedrijf, status: beginStatus, gekozen, prijs }: { id: string; naam: string; status: Logo["status"]; gekozen: LogoNr | null; prijs: string }) {
  const [status, setStatus] = useState(beginStatus);
  const [logo, setLogo] = useState<LogoNr | null>(gekozen);
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [lokveld, setLokveld] = useState("");
  const [bezig, setBezig] = useState(false);
  const [verstuurd, setVerstuurd] = useState(false);
  const [fout, setFout] = useState<{ tekst: string; veld?: "naam" | "email" } | null>(null);
  const vrijgegeven = status === "vrijgegeven" && gekozen !== null;
  const metWatermerk = LOGOS.filter((l) => !(vrijgegeven && l.nr === gekozen));

  function kies(nr: LogoNr) {
    setLogo(nr);
    setFout(null);
    document.getElementById("logo-wil-ik")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (!logo) return setFout({ tekst: "Kies eerst een van de zes logo's." });
    if (naam.trim().length < 2) return setFout({ tekst: "Vul je naam in.", veld: "naam" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setFout({ tekst: "Vul een geldig e-mailadres in.", veld: "email" });
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch(`/api/logo-maker/${id}/aanvraag`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logo, naam, email, telefoon, website2: lokveld }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const veld = data?.error?.details?.veld;
        setFout({ tekst: data?.error?.message ?? "Het versturen is niet gelukt. Probeer het opnieuw.", ...(veld === "naam" || veld === "email" ? { veld } : {}) });
        return;
      }
      if (data?.status === "aangevraagd") setStatus("aangevraagd");
      setVerstuurd(true);
    } catch {
      setFout({ tekst: "Geen verbinding. Probeer het opnieuw." });
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      <section className="hero-ink text-white">
        <div className="shell py-10 md:py-14">
          <p className="eyebrow text-brand-mint">Logo maker</p>
          <h1 className="mt-3 max-w-3xl text-balance break-words font-display text-3xl font-bold leading-tight md:text-[2.6rem]">{vrijgegeven ? `Het logo van ${bedrijf} staat klaar` : `Zes logo's voor ${bedrijf}`}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
            {vrijgegeven ? "Bedankt voor je betaling. Hieronder download je de bestanden zonder watermerk." : "Dit zijn voorbeelden met watermerk. Je betaalt pas als je er een wilt hebben."}
          </p>
        </div>
      </section>

      {vrijgegeven && gekozen !== null && (
        <section className="bg-paper" aria-labelledby="logo-download-kop">
          <div className="shell py-10 md:py-14">
            <h2 id="logo-download-kop" className="font-display text-2xl font-bold text-ink md:text-3xl">
              Download je logo
            </h2>
            <p className="mt-2 max-w-2xl text-neutralx-600">
              Vijf bestanden als PNG in hoge resolutie. Ze blijven {BEWAAR_DAGEN} dagen staan: bewaar ze op je eigen computer of telefoon.
            </p>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {VARIANT_IDS.map((v) => (
                <li key={v} className="card overflow-hidden">
                  <div style={{ background: ONDERGROND[v] }} className="flex items-center justify-center p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={beeld(id, gekozen, `&variant=${v}`)} alt={`Je logo: ${VARIANTEN[v].naam.toLowerCase()}`} width={VARIANTEN[v].breedte} height={VARIANTEN[v].hoogte} loading="lazy" className={`block h-auto ${v === "icoon" ? "w-1/2" : "w-full"}`} />
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg font-bold text-ink">{VARIANTEN[v].naam}</h3>
                    <p className="mt-1 text-sm text-neutralx-600">
                      {VARIANTEN[v].uitleg}. {VARIANTEN[v].breedte} × {VARIANTEN[v].hoogte} beeldpunten.
                    </p>
                    <a href={beeld(id, gekozen, `&variant=${v}&download=1`)} download className="btn-ghost mt-4 w-full justify-center px-4 py-2.5 text-sm">
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="bg-paper" aria-labelledby="logo-keuze-kop">
        <div className="shell py-10 md:py-14">
          <h2 id="logo-keuze-kop" className="font-display text-2xl font-bold text-ink md:text-3xl">
            {vrijgegeven ? "De andere logo's" : "Kies het logo dat bij je past"}
          </h2>
          {vrijgegeven && <p className="mt-2 max-w-2xl text-neutralx-600">Deze logo&apos;s zitten niet in je keuze en houden hun watermerk. Wil je er nog een bij? Mail ons dan even.</p>}
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {metWatermerk.map((l) => {
              const aan = logo === l.nr && !vrijgegeven;
              return (
                <li key={l.nr} className={`relative overflow-hidden rounded-3xl border-2 bg-white shadow-card transition ${aan ? "border-brand-600" : "border-hair"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={beeld(id, l.nr)}
                    alt={`Voorbeeld van logo ${l.nr} (${l.naam}) voor ${bedrijf}, met watermerk`}
                    width={360}
                    height={270}
                    draggable={false}
                    onContextMenu={geenMenu}
                    onDragStart={geenMenu}
                    className="block aspect-[4/3] h-auto w-full select-none"
                    style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
                  />
                  <div className="flex items-center justify-between gap-3 border-t border-hair p-4">
                    <div className="min-w-0">
                      <p className="font-display text-base font-bold text-ink">
                        {l.nr}. {l.naam}
                      </p>
                      <p className="text-sm text-neutralx-500">{l.uitleg}</p>
                    </div>
                    {!vrijgegeven && (
                      <button type="button" onClick={() => kies(l.nr)} aria-pressed={aan} className={`${aan ? "btn-primary" : "btn-ghost"} flex-shrink-0 px-4 py-2 text-sm`}>
                        {aan ? "Gekozen" : "Deze wil ik"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {!vrijgegeven && (
            <p className="mt-6 text-sm text-neutralx-600">
              Andere kleur of sfeer proberen?{" "}
              <Link href="/logo-maker#maken" className="font-semibold text-brand-700 underline underline-offset-2">
                Opnieuw maken
              </Link>
            </p>
          )}
        </div>
      </section>

      {!vrijgegeven && (
        <section id="logo-wil-ik" className="scroll-mt-24 border-t border-hair bg-paper-soft" aria-labelledby="logo-wil-ik-kop">
          <div className="shell py-10 md:py-14">
            <div className="max-w-2xl">
              <h2 id="logo-wil-ik-kop" className="font-display text-2xl font-bold text-ink md:text-3xl">
                Deze wil ik
              </h2>
              <p className="mt-2 text-neutralx-600">
                Eén logo kost {prijs}. Je betaalt pas als je het wilt hebben. Na je betaling krijg je het zonder watermerk, als PNG in hoge resolutie: {VARIANT_IDS.map((v) => VARIANTEN[v].naam.toLowerCase()).join(", ")}.
              </p>
              {(verstuurd || status === "aangevraagd") && (
                <p role="status" className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-[0.975rem] leading-relaxed text-ink">
                  <strong>{verstuurd ? "Gelukt, je aanvraag is binnen." : "Je hebt een logo aangevraagd."}</strong> We nemen contact met je op, je betaalt pas daarna. Wil je toch een ander logo? Vul het formulier dan opnieuw in.
                </p>
              )}
              <form onSubmit={verstuur} noValidate className="mt-6 rounded-3xl border border-hair bg-white p-5 shadow-card sm:p-7">
                <fieldset>
                  <legend className="field-label">Welk logo?</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {LOGOS.map((l) => (
                      <label key={l.nr} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-ink ${logo === l.nr ? "border-brand-600 bg-brand-50" : "border-hair"}`}>
                        <input type="radio" name="logo-keuze" value={l.nr} checked={logo === l.nr} onChange={() => setLogo(l.nr)} className="h-4 w-4 accent-brand-600" />
                        {l.nr}. {l.naam}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="logo-aanvraag-naam" className="field-label">
                      Je naam
                    </label>
                    <input id="logo-aanvraag-naam" className="field-input" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={80} autoComplete="name" required aria-invalid={fout?.veld === "naam"} aria-describedby={fout?.veld === "naam" ? "logo-aanvraag-fout" : undefined} />
                  </div>
                  <div>
                    <label htmlFor="logo-aanvraag-email" className="field-label">
                      E-mailadres
                    </label>
                    <input id="logo-aanvraag-email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" required aria-invalid={fout?.veld === "email"} aria-describedby={fout?.veld === "email" ? "logo-aanvraag-fout" : undefined} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="logo-aanvraag-telefoon" className="field-label">
                      Telefoon <span className="font-normal text-neutralx-500">(mag leeg)</span>
                    </label>
                    <input id="logo-aanvraag-telefoon" type="tel" className="field-input" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} maxLength={30} autoComplete="tel" />
                  </div>
                </div>
                <div className="hidden" aria-hidden>
                  <label htmlFor="logo-aanvraag-website2">Laat dit veld leeg</label>
                  <input id="logo-aanvraag-website2" tabIndex={-1} autoComplete="off" value={lokveld} onChange={(e) => setLokveld(e.target.value)} />
                </div>
                {fout && (
                  <p id="logo-aanvraag-fout" role="alert" className="mt-4 rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
                    {fout.tekst}
                  </p>
                )}
                <button type="submit" disabled={bezig} className="btn-primary mt-5 w-full justify-center px-6 py-3 text-base disabled:opacity-60">
                  {bezig ? "Bezig…" : status === "aangevraagd" ? "Aanvraag wijzigen" : "Deze wil ik"}
                </button>
                <p className="mt-3 text-xs leading-relaxed text-neutralx-500">
                  We gebruiken je gegevens alleen om contact met je op te nemen over dit logo en om het na betaling aan je te leveren. Meer in onze{" "}
                  <Link href="/privacy" className="underline underline-offset-2">
                    privacyverklaring
                  </Link>
                  .
                </p>
              </form>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
