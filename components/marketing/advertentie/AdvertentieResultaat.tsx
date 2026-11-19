"use client";

import { useState } from "react";
import Link from "next/link";
import { BEWAAR_DAGEN, FORMATEN, FORMAAT_IDS, GRENS, ONTWERPEN, PAKKETTEN, PAKKET_NAAM, PAKKET_UITLEG, prijsTekst, type AdTekst, type OntwerpNr, type Pakket, type Prijzen, type Status } from "@/lib/advertentie/regels";

// De eigen pagina van een advertentie op maat. De beelden komen van de server (GET /api/advertentie/<id>/beeld); zolang
// een ontwerp niet is vrijgegeven, is dat altijd een klein beeld met ingebakken watermerk. Slepen, het contextmenu en
// selecteren staan uit, maar dat is alleen gemak: de echte bescherming is dat de schone versie hier niet bestaat.

const beeld = (id: string, ontwerp: number, extra = "") => `/api/advertentie/${id}/beeld?ontwerp=${ontwerp}${extra}`;
const geenMenu = (e: React.MouseEvent) => e.preventDefault();

type Veld = "ontwerp" | "pakket" | "naam" | "email";

export function AdvertentieResultaat({
  id,
  bedrijf,
  tekst,
  status: beginStatus,
  keuze: beginKeuze,
  vrij,
  prijzen,
}: {
  id: string;
  bedrijf: string;
  tekst: AdTekst;
  status: Status;
  keuze: { ontwerp: OntwerpNr; pakket: Pakket } | null;
  vrij: OntwerpNr[];
  prijzen: Prijzen;
}) {
  const [status, setStatus] = useState<Status>(beginStatus);
  const [ontwerp, setOntwerp] = useState<OntwerpNr | null>(beginKeuze?.ontwerp ?? null);
  const [pakket, setPakket] = useState<Pakket>(beginKeuze?.pakket ?? "een");
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [lokveld, setLokveld] = useState("");
  const [bezig, setBezig] = useState(false);
  const [verstuurd, setVerstuurd] = useState(false);
  const [fout, setFout] = useState<{ tekst: string; veld?: Veld } | null>(null);
  const vrijgegeven = status === "vrijgegeven";
  const nogMetWatermerk = ONTWERPEN.filter((o) => !vrij.includes(o.nr));

  function kies(nr: OntwerpNr) {
    setOntwerp(nr);
    setFout(null);
    document.getElementById("adv-wil-ik")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (!ontwerp) return setFout({ tekst: "Kies eerst een van de drie ontwerpen.", veld: "ontwerp" });
    if (naam.trim().length < 2) return setFout({ tekst: "Vul je naam in.", veld: "naam" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setFout({ tekst: "Vul een geldig e-mailadres in.", veld: "email" });
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch(`/api/advertentie/${id}/aanvraag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ontwerp, pakket, naam, email, telefoon, website2: lokveld }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const veld = data?.error?.details?.veld;
        setFout({ tekst: data?.error?.message ?? "Het versturen is niet gelukt. Probeer het opnieuw.", ...(veld === "ontwerp" || veld === "pakket" || veld === "naam" || veld === "email" ? { veld } : {}) });
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
          <p className="eyebrow text-brand-mint">Advertentie op maat</p>
          <h1 className="mt-3 max-w-3xl text-balance break-words font-display text-3xl font-bold leading-tight md:text-[2.6rem]">{vrijgegeven ? `Je advertentie voor ${bedrijf} staat klaar` : `Je advertentie voor ${bedrijf}`}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
            {vrijgegeven
              ? "Bedankt voor je betaling. Hieronder download je de bestanden zonder watermerk."
              : "Dit zijn je drie ontwerpen, als voorbeeld met watermerk. Je betaalt pas als je hem wilt hebben."}
          </p>
        </div>
      </section>

      {vrijgegeven && vrij.length > 0 && (
        <section className="bg-paper" aria-labelledby="adv-download-kop">
          <div className="shell py-10 md:py-14">
            <h2 id="adv-download-kop" className="font-display text-2xl font-bold text-ink md:text-3xl">
              Download je advertentie
            </h2>
            <p className="mt-2 max-w-2xl text-neutralx-600">
              Elk ontwerp in drie formaten, als PNG zonder watermerk. De bestanden blijven {BEWAAR_DAGEN} dagen staan: bewaar ze op je eigen computer of telefoon.
            </p>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {ONTWERPEN.filter((o) => vrij.includes(o.nr)).map((o) => (
                <li key={o.nr} className="card overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={beeld(id, o.nr, "&formaat=vierkant")} alt={`Ontwerp ${o.nr} (${o.naam}): ${tekst.kop}`} width={1080} height={1080} className="block aspect-square h-auto w-full" />
                  <div className="p-5">
                    <h3 className="font-display text-lg font-bold text-ink">
                      Ontwerp {o.nr}: {o.naam}
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {FORMAAT_IDS.map((f) => (
                        <li key={f}>
                          <a href={beeld(id, o.nr, `&formaat=${f}&download=1`)} download className="btn-ghost w-full justify-between px-4 py-2.5 text-sm">
                            <span>
                              {FORMATEN[f].naam} <span className="text-neutralx-500">{FORMATEN[f].maat}</span>
                            </span>
                            <span aria-hidden>Download</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {nogMetWatermerk.length > 0 && (
        <section className="bg-paper" aria-labelledby="adv-ontwerpen-kop">
          <div className="shell py-10 md:py-14">
            <h2 id="adv-ontwerpen-kop" className="font-display text-2xl font-bold text-ink md:text-3xl">
              {vrijgegeven ? "De andere ontwerpen" : "Kies het ontwerp dat bij je past"}
            </h2>
            {vrijgegeven && <p className="mt-2 max-w-2xl text-neutralx-600">Deze ontwerpen zitten niet in je keuze en houden hun watermerk. Wil je ze er toch bij? Mail ons dan even.</p>}
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {nogMetWatermerk.map((o) => {
                const gekozen = ontwerp === o.nr && !vrijgegeven;
                return (
                  <li key={o.nr} className={`relative overflow-hidden rounded-3xl border-2 bg-white shadow-card transition ${gekozen ? "border-brand-600" : "border-hair"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={beeld(id, o.nr)}
                      alt={`Voorbeeld van ontwerp ${o.nr} (${o.naam}) met watermerk: ${tekst.kop}`}
                      width={600}
                      height={600}
                      draggable={false}
                      onContextMenu={geenMenu}
                      onDragStart={geenMenu}
                      className="pointer-events-auto block aspect-square h-auto w-full select-none"
                      style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}
                    />
                    <div className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="font-display text-base font-bold text-ink">
                          Ontwerp {o.nr}: {o.naam}
                        </p>
                        <p className="text-sm text-neutralx-500">{o.uitleg}</p>
                      </div>
                      {!vrijgegeven && (
                        <button type="button" onClick={() => kies(o.nr)} aria-pressed={gekozen} className={`${gekozen ? "btn-primary" : "btn-ghost"} flex-shrink-0 px-4 py-2 text-sm`}>
                          {gekozen ? "Gekozen" : "Deze wil ik"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 max-w-3xl rounded-2xl border border-hair bg-white p-5">
              <h3 className="text-sm font-semibold text-ink">De tekst in je advertentie</h3>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
                <dt className="text-neutralx-500">Kop</dt>
                <dd className="break-words text-ink">{tekst.kop}</dd>
                <dt className="text-neutralx-500">Onderregel</dt>
                <dd className="break-words text-ink">{tekst.onderregel}</dd>
                <dt className="text-neutralx-500">Knop</dt>
                <dd className="break-words text-ink">{tekst.knop}</dd>
              </dl>
              {!vrijgegeven && (
                <p className="mt-4 text-sm text-neutralx-600">
                  Niet wat je zoekt?{" "}
                  <Link href="/advertentie-op-maat#maken" className="font-semibold text-brand-700 underline underline-offset-2">
                    Opnieuw maken
                  </Link>
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {!vrijgegeven && (
        <section id="adv-wil-ik" className="scroll-mt-24 border-t border-hair bg-paper-soft" aria-labelledby="adv-wil-ik-kop">
          <div className="shell py-10 md:py-14">
            <div className="max-w-2xl">
              <h2 id="adv-wil-ik-kop" className="font-display text-2xl font-bold text-ink md:text-3xl">
                Deze wil ik
              </h2>
              <p className="mt-2 text-neutralx-600">
                Je betaalt pas als je hem wilt hebben. Na je betaling krijg je hem zonder watermerk in drie formaten: {FORMAAT_IDS.map((f) => `${FORMATEN[f].naam.toLowerCase()} (${FORMATEN[f].maat})`).join(", ")}.
              </p>

              {(verstuurd || status === "aangevraagd") && (
                <p role="status" className="mt-5 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-[0.975rem] leading-relaxed text-ink">
                  <strong>{verstuurd ? "Gelukt, je aanvraag is binnen." : "Je hebt deze advertentie aangevraagd."}</strong> We nemen contact met je op, je betaalt pas daarna. Wil je toch iets anders kiezen? Vul het formulier dan opnieuw in.
                </p>
              )}

              <form onSubmit={verstuur} noValidate className="mt-6 rounded-3xl border border-hair bg-white p-5 shadow-card sm:p-7">
                <fieldset>
                  <legend className="field-label">Welk ontwerp?</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {ONTWERPEN.map((o) => (
                      <label key={o.nr} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-ink ${ontwerp === o.nr ? "border-brand-600 bg-brand-50" : "border-hair"}`}>
                        <input type="radio" name="adv-ontwerp" value={o.nr} checked={ontwerp === o.nr} onChange={() => setOntwerp(o.nr)} className="h-4 w-4 accent-brand-600" />
                        {o.nr}. {o.naam}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="mt-5">
                  <legend className="field-label">Wat wil je hebben?</legend>
                  <div className="mt-2 grid gap-2">
                    {PAKKETTEN.map((p) => (
                      <label key={p} className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 ${pakket === p ? "border-brand-600 bg-brand-50" : "border-hair"}`}>
                        <input type="radio" name="adv-pakket" value={p} checked={pakket === p} onChange={() => setPakket(p)} className="mt-1 h-4 w-4 accent-brand-600" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink">
                            {p === "een" ? "Alleen dit ontwerp" : PAKKET_NAAM[p]}: {prijsTekst(prijzen, p)}
                          </span>
                          <span className="block text-sm text-neutralx-600">{PAKKET_UITLEG[p]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="adv-naam" className="field-label">
                      Je naam
                    </label>
                    <input id="adv-naam" className="field-input" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={GRENS.naam} autoComplete="name" required aria-invalid={fout?.veld === "naam"} aria-describedby={fout?.veld === "naam" ? "adv-aanvraag-fout" : undefined} />
                  </div>
                  <div>
                    <label htmlFor="adv-email" className="field-label">
                      E-mailadres
                    </label>
                    <input id="adv-email" type="email" className="field-input" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={GRENS.email} autoComplete="email" required aria-invalid={fout?.veld === "email"} aria-describedby={fout?.veld === "email" ? "adv-aanvraag-fout" : undefined} />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="adv-telefoon" className="field-label">
                      Telefoon <span className="font-normal text-neutralx-500">(mag leeg)</span>
                    </label>
                    <input id="adv-telefoon" type="tel" className="field-input" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} maxLength={GRENS.telefoon} autoComplete="tel" />
                  </div>
                </div>
                <div className="hidden" aria-hidden>
                  <label htmlFor="adv-aanvraag-website2">Laat dit veld leeg</label>
                  <input id="adv-aanvraag-website2" tabIndex={-1} autoComplete="off" value={lokveld} onChange={(e) => setLokveld(e.target.value)} />
                </div>
                {fout && (
                  <p id="adv-aanvraag-fout" role="alert" className="mt-4 rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
                    {fout.tekst}
                  </p>
                )}
                <button type="submit" disabled={bezig} className="btn-primary mt-5 w-full justify-center px-6 py-3 text-base disabled:opacity-60">
                  {bezig ? "Bezig…" : status === "aangevraagd" ? "Aanvraag wijzigen" : "Deze wil ik"}
                </button>
                <p className="mt-3 text-xs leading-relaxed text-neutralx-500">
                  We gebruiken je gegevens alleen om contact met je op te nemen over deze advertentie en om hem na betaling aan je te leveren. Meer in onze{" "}
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
