"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoMockups } from "@/components/marketing/studio/Mockups";
import { VoorbeeldBeeld } from "@/components/marketing/studio/VoorbeeldBeeld";
import { BEWAAR_DAGEN } from "@/lib/advertentie/regels";
import { THEMAS, VARIANTEN, VARIANT_IDS, type Logo, type LogoNr, type ThemaId, type VariantId } from "@/lib/logo/regels";

// De eigen pagina van de logo maker: het resultaat is de held. Een donker podium met de logo's in een raster met
// haarlijnen (wit op zwart; met de schakelaar ook op wit of in de gekozen kleur), daaronder hoe het gekozen logo eruitziet
// op een kaartje, een website, een shirt, en dan pas het formulier. De beelden komen van de server
// (GET /api/logo-maker/<id>/beeld); zolang een logo niet is vrijgegeven, is dat altijd een klein beeld met ingebakken
// watermerk. Slepen, het contextmenu en selecteren staan uit, maar dat is alleen gemak: de echte bescherming is dat de
// schone versie hier niet bestaat. Elk vak heeft een vaste verhouding, zodat er tijdens het laden niets verspringt.

const VLAK: Record<ThemaId, string> = { donker: "#0B0B0C", licht: "#FFFFFF", kleur: "#FFFFFF" };
/** De ondergrond waarop een variant na vrijgave getoond wordt: wit logo op donker, de rest op licht. */
const ONDERGROND: Record<VariantId, string> = { "kleur-wit": "#FFFFFF", kleur: "#F3F1EA", wit: "#17211C", zwart: "#F3F1EA", icoon: "#F3F1EA" };

export interface LogoKeuze {
  nr: LogoNr;
  naam: string;
  uitleg: string;
}

export function LogoResultaat({ id, naam: bedrijf, kleur, status: beginStatus, gekozen, prijs, logos, themas }: { id: string; naam: string; kleur: string; status: Logo["status"]; gekozen: LogoNr | null; prijs: string; logos: LogoKeuze[]; themas: boolean }) {
  const [status, setStatus] = useState(beginStatus);
  const [logo, setLogo] = useState<LogoNr | null>(gekozen);
  const [thema, setThema] = useState<ThemaId>("donker");
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [lokveld, setLokveld] = useState("");
  const [bezig, setBezig] = useState(false);
  const [verstuurd, setVerstuurd] = useState(false);
  const [fout, setFout] = useState<{ tekst: string; veld?: "naam" | "email" } | null>(null);
  const vrijgegeven = status === "vrijgegeven" && gekozen !== null;
  const metWatermerk = logos.filter((l) => !(vrijgegeven && l.nr === gekozen));
  const beeld = (nr: number, t: ThemaId = thema, extra = "") => `/api/logo-maker/${id}/beeld?logo=${nr}${themas ? `&thema=${t}` : ""}${extra}`;
  const toon = logo ?? metWatermerk[0]?.nr ?? 1;
  const gekozenNaam = logos.find((l) => l.nr === logo)?.naam;

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (!logo) return setFout({ tekst: "Kies eerst een van de logo's." });
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
      <section className="bg-[#0B0B0C] text-white">
        <div className="shell pb-10 pt-10 md:pb-16 md:pt-14">
          <p className="eyebrow text-brand-mint">Logo maker</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="min-w-0 max-w-3xl">
              <h1 className="text-balance break-words font-display text-4xl font-bold leading-[1.05] md:text-6xl">{vrijgegeven ? `Het logo van ${bedrijf} staat klaar` : bedrijf}</h1>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/65">
                {vrijgegeven ? "Bedankt voor je betaling. Hieronder download je de bestanden zonder watermerk." : `${logos.length} logo's, gemaakt voor jouw naam. Dit zijn voorbeelden met watermerk; je betaalt pas als je er een wilt hebben.`}
              </p>
            </div>
            {themas && (
              <div role="group" aria-label="Ondergrond van de voorbeelden" className="flex flex-shrink-0 rounded-full border border-white/15 bg-white/[0.06] p-1">
                {THEMAS.map((t) => (
                  <button key={t.id} type="button" aria-pressed={thema === t.id} onClick={() => setThema(t.id)} className={`rounded-full px-4 py-2 text-sm font-semibold transition motion-reduce:transition-none ${thema === t.id ? "bg-white text-ink" : "text-white/70 hover:text-white"}`}>
                    {t.naam}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul className="mt-9 grid grid-cols-3 overflow-hidden rounded-2xl border border-white/10" style={{ background: "rgba(255,255,255,0.1)", gap: 1 }}>
            {metWatermerk.map((l) => {
              const aan = logo === l.nr && !vrijgegeven;
              return (
                <li key={l.nr} className="relative" style={{ background: VLAK[thema] }}>
                  <button type="button" onClick={() => !vrijgegeven && setLogo(l.nr)} aria-pressed={aan} disabled={vrijgegeven} className="group relative block w-full focus-visible:outline-none">
                    <span className="relative block aspect-[4/3] w-full">
                      <span className="absolute inset-0 animate-pulse motion-reduce:animate-none" style={{ background: thema === "donker" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }} aria-hidden />
                      <VoorbeeldBeeld
                        src={beeld(l.nr)}
                        alt={`Voorbeeld van logo ${l.nr} (${l.naam}) voor ${bedrijf}, met watermerk`}
                        width={400}
                        height={300}
                        className="absolute inset-0 h-full w-full select-none object-cover transition duration-300 motion-reduce:transition-none motion-safe:group-hover:scale-[1.03]"
                      />
                    </span>
                    <span className={`pointer-events-none absolute inset-0 border-2 transition motion-reduce:transition-none ${aan ? "border-brand-mint" : "border-transparent group-focus-visible:border-white/70"}`} aria-hidden />
                    {aan && <span className="absolute left-2 top-2 rounded-full bg-brand-mint px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-ink">Gekozen</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {!vrijgegeven && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-white/65">{logo ? `Je koos logo ${logo}: ${gekozenNaam ?? ""}.` : "Tik op het logo dat je het mooist vindt."}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/logo-maker#maken" className="btn-ghost-invert px-5 py-2.5 text-sm">
                  Opnieuw maken
                </Link>
                <a href="#logo-wil-ik" className="btn-mint px-5 py-2.5 text-sm">
                  Deze wil ik
                </a>
              </div>
            </div>
          )}
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
                  <div style={{ background: ONDERGROND[v], aspectRatio: "4 / 3" }} className="flex items-center justify-center p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/logo-maker/${id}/beeld?logo=${gekozen}&variant=${v}`} alt={`Je logo: ${VARIANTEN[v].naam.toLowerCase()}`} width={VARIANTEN[v].breedte} height={VARIANTEN[v].hoogte} loading="lazy" className={`block h-auto ${v === "icoon" ? "w-1/2" : "w-full"}`} />
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg font-bold text-ink">{VARIANTEN[v].naam}</h3>
                    <p className="mt-1 text-sm text-neutralx-600">
                      {VARIANTEN[v].uitleg}. {VARIANTEN[v].breedte} × {VARIANTEN[v].hoogte} beeldpunten.
                    </p>
                    <a href={`/api/logo-maker/${id}/beeld?logo=${gekozen}&variant=${v}&download=1`} download className="btn-ghost mt-4 w-full justify-center px-4 py-2.5 text-sm">
                      Download
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {!vrijgegeven && themas && (
        <section className="border-b border-hair bg-paper" aria-labelledby="logo-mockup-kop">
          <div className="shell py-10 md:py-14">
            <p className="eyebrow">Zo ziet het eruit</p>
            <h2 id="logo-mockup-kop" className="mt-3 font-display text-2xl font-bold text-ink md:text-3xl">
              Jouw logo op een kaartje, een website en een shirt
            </h2>
            <p className="mt-2 max-w-2xl text-neutralx-600">Schetsen met het logo dat je hierboven aantikt. Het watermerk verdwijnt zodra het logo van jou is.</p>
            <div className="mt-8">
              <LogoMockups donker={beeld(toon, "donker")} licht={beeld(toon, "licht")} kleur={beeld(toon, "kleur")} accent={kleur} />
            </div>
          </div>
        </section>
      )}

      {!vrijgegeven && (
        <section id="logo-wil-ik" className="scroll-mt-24 bg-paper-soft" aria-labelledby="logo-wil-ik-kop">
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
                    {logos.map((l) => (
                      <label key={l.nr} className={`relative flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-ink ${logo === l.nr ? "border-brand-600 bg-brand-50" : "border-hair"}`}>
                        <input type="radio" name="logo-keuze" value={l.nr} checked={logo === l.nr} onChange={() => setLogo(l.nr)} className="h-4 w-4 flex-shrink-0 accent-brand-600" />
                        <span className="min-w-0 truncate">
                          {l.nr}. {l.naam}
                        </span>
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
