"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { FairPayMeter } from "@/components/app/FairPayMeter";
import { fmt } from "@/lib/i18n/dictionaries";
import { createShiftAction, type NewShiftState } from "@/app/werkgever/diensten/nieuw/actions";
import { ANNULEER_TERMIJNEN, annuleerTermijnLabel, STANDAARD_ANNULEER_UREN } from "@/lib/shifts/annuleertermijn";
import { conceptCost, conceptHours, naarSnelFormulier } from "@/lib/klusconcept/concept";
import { euroCents, euroWhole } from "@/lib/rekentools/invoer";
import { useT } from "@/components/i18n/I18nProvider";
import { useKlusConcept } from "@/components/werkgever/useKlusConcept";
import { pauzeKeuzes, snelSamenvatting, type SnelTeksten } from "@/components/werkgever/snel-teksten";

// Klus plaatsen in drie stappen (20 nov 2026, eigenaar: "wat, wanneer, tarief; de rest standaard ingevuld"). Dezelfde
// server-actie en dezelfde regels als het uitgebreide formulier (components/app/NewShiftForm.tsx): één vestiging, één
// dag, één persoon tenzij je meer kiest, geen pauze, geen sjabloontekst behalve als je een sjabloon kiest. Wie meer wil
// (meerdere dagen, eenmalige locatie, pools, dresscode) opent eronder het uitgebreide formulier.
// 22 nov 2026 (gebruikersonderzoek B25): bij "Plaats de klus" dezelfde kostenregel als /klus-plaatsen (loon + platform =
// totaal excl. btw, conceptCost) en een pauzekeuze; de teksten staan in components/werkgever/snel-teksten.ts.

export interface SnelSjabloon {
  key: string;
  label: string;
  hourlyRateCents: number;
  description: string;
  dresscode?: string | undefined;
}

const vul = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

function PlaatsKnop({ tekst, bezig }: { tekst: string; bezig: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? bezig : tekst}
    </button>
  );
}

/** Een bestaande klus als vertrekpunt ("Klus dupliceren", naar YoungOnes): alles behalve de datum komt mee. */
export interface SnelVoorinvulling {
  titel: string;
  van: string;
  tot: string;
  personen: number;
  tariefCents: number;
  branchId: string;
  annuleerUren: number;
  omschrijving: string;
  dresscode: string;
}

export function SnelPlaatsen({ branches, sjablonen, minRateCents, t, locale = "nl", voorinvulling, kostenplaatsen = [] }: { branches: { id: string; name: string; city: string | null }[]; sjablonen: SnelSjabloon[]; minRateCents: number; t: SnelTeksten; locale?: "nl" | "en"; voorinvulling?: SnelVoorinvulling; /** kostenplaatsen/PO-nummers van het bedrijf (OrgProfileExtra.costCentres); leeg = geen keuze */ kostenplaatsen?: string[] }) {
  const [stap, setStap] = useState<1 | 2 | 3>(1);
  const [annuleerUren, setAnnuleerUren] = useState(String(voorinvulling?.annuleerUren ?? STANDAARD_ANNULEER_UREN));
  // dezelfde uitleg als het uitgebreide formulier (woordenlijst, NL/EN)
  const n = useT().newShiftForm;
  const annuleerUitleg = n.annuleerTermijnUitleg;
  // vervullingskans en tariefadvies (lib/pricing/advice via /api/werkgever/pricing), zoals het uitgebreide formulier
  const [forecast, setForecast] = useState<{ marketRateCents: number; fillChance: number; suggestedRateCents: number; suggestedFillChance: number; sample: number } | null>(null);
  const [titel, setTitel] = useState(voorinvulling?.titel ?? "");
  const [sjabloon, setSjabloon] = useState<SnelSjabloon | null>(null);
  const [datum, setDatum] = useState("");
  const [van, setVan] = useState(voorinvulling?.van ?? "09:00");
  const [tot, setTot] = useState(voorinvulling?.tot ?? "17:00");
  const [personen, setPersonen] = useState(voorinvulling?.personen ?? 1);
  const minEuro = Math.ceil(minRateCents / 100);
  const [tarief, setTarief] = useState(voorinvulling ? (Math.max(minRateCents, voorinvulling.tariefCents) / 100).toFixed(2) : String(minEuro));
  const [branchId, setBranchId] = useState(voorinvulling?.branchId && branches.some((b) => b.id === voorinvulling.branchId) ? voorinvulling.branchId : (branches[0]?.id ?? ""));
  // eigen omschrijving (een gedupliceerde klus of het concept van de website); null = die van het gekozen voorbeeld
  const [omschrijving, setOmschrijving] = useState<string | null>(voorinvulling?.omschrijving ?? null);
  // standaard geen pauze; het concept van de website kan er een meebrengen (die telt niet als gewerkte tijd)
  const [pauze, setPauze] = useState(0);
  const [vanWebsite, setVanWebsite] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [state, formAction] = useFormState<NewShiftState, FormData>(createShiftAction, { error: null });

  // De klus die het bedrijf vóór het aanmelden op /klus-plaatsen samenstelde (deze browser of de server): één keer
  // invullen en meteen de laatste stap tonen. Niet bij "Klus dupliceren": dan is de gekozen klus het vertrekpunt.
  const concept = useKlusConcept({ aan: !voorinvulling, wis: true });
  useEffect(() => {
    if (!concept) return;
    const v = naarSnelFormulier(concept, minRateCents);
    setTitel(v.titel);
    setSjabloon(sjablonen.find((s) => s.label === v.titel) ?? null);
    setOmschrijving(v.omschrijving);
    setDatum(v.datum);
    setVan(v.van);
    setTot(v.tot);
    setPersonen(v.personen);
    setPauze(v.pauze);
    setTarief(v.tarief);
    setVanWebsite(true);
    setStap(v.stap);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen als het concept binnenkomt
  }, [concept]);

  // de pauze mag niet de hele klus beslaan: er moet gewerkte tijd overblijven
  const tijdOk = datum !== "" && van !== "" && tot !== "" && tot > van && conceptHours({ start: van, end: tot, breakMinutes: pauze }) > 0;
  const tariefCent = Math.round((Number(tarief.replace(",", ".")) || 0) * 100);
  const tariefOk = tariefCent >= minRateCents;
  // wat de klus kost, met hetzelfde rekenhulpje als /klus-plaatsen (de staffel komt uit lib/pricing/tiers.ts)
  const kosten = conceptCost({ start: van, end: tot, breakMinutes: pauze, positions: personen, rateCents: tariefCent });
  const urenTekst = (u: number) => u.toLocaleString(locale === "nl" ? "nl-NL" : "en-GB", { maximumFractionDigits: 2 });

  useEffect(() => {
    if (stap !== 3 || titel.trim().length < 2 || !datum || !van || tariefCent <= 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/werkgever/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titel, startsAt: `${datum}T${van}`, rateCents: tariefCent }),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d && typeof d.fillChance === "number") setForecast(d); })
        .catch(() => undefined);
    }, 400);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [stap, titel, datum, van, tariefCent]);

  // "Bereikt ±N werkers" (naar YoungOnes): geverifieerde werkers binnen 40 km van de vestiging (api/werkgever/bereik)
  const [bereik, setBereik] = useState<number | null>(null);
  useEffect(() => {
    if (!branchId) return;
    const ctrl = new AbortController();
    fetch(`/api/werkgever/bereik?branchId=${encodeURIComponent(branchId)}`, { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.bereik === "number") setBereik(d.bereik); })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [branchId]);

  // het voorbeeld rechts: wat de werker straks ziet
  const vestiging = branches.find((b) => b.id === branchId) ?? branches[0];
  const datumLabel = datum
    ? new Date(`${datum}T12:00:00`).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" })
    : "";
  const tariefLabel = `€ ${locale === "nl" ? (tariefCent / 100).toFixed(2).replace(".", ",") : (tariefCent / 100).toFixed(2)}`;

  const kies = (s: SnelSjabloon) => {
    setSjabloon(s);
    setOmschrijving(null);
    setTitel(s.label);
    setTarief(String(Math.max(minEuro, Math.ceil(s.hourlyRateCents / 100))));
  };
  const naar2 = () => {
    if (titel.trim().length < 3) return setMelding(t.titelHint);
    setMelding(null);
    setStap(2);
  };
  const naar3 = () => {
    if (!tijdOk) return setMelding(t.fout);
    setMelding(null);
    setStap(3);
  };

  const stappen = [t.stap1, t.stap2, t.stap3];
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_19rem]">
    <form action={formAction} className="surface p-6" aria-labelledby="snel-kop">
      <h2 id="snel-kop" className="font-display text-lg font-bold text-ink">{t.kop}</h2>
      <ol className="mt-3 flex gap-2" aria-label={t.kop}>
        {stappen.map((naam, i) => (
          <li key={naam} aria-current={stap === i + 1 ? "step" : undefined} className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${stap === i + 1 ? "bg-ink text-white" : stap > i + 1 ? "bg-mintwash text-brand-700" : "bg-paper-soft text-neutralx-500"}`}>
            <span className="num">{i + 1}</span> {naam}
          </li>
        ))}
      </ol>
      {vanWebsite && (
        <p role="status" className="mt-4 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-700">
          {n.vanWebsiteSnel}
        </p>
      )}

      {/* alles wat de server nodig heeft, altijd mee (ook als een stap verborgen is) */}
      <input type="hidden" name="branchId" value={branchId} />
      <input type="hidden" name="templateKey" value={sjabloon?.key ?? ""} />
      <input type="hidden" name="title" value={titel} />
      <input type="hidden" name="description" value={omschrijving ?? sjabloon?.description ?? ""} />
      <input type="hidden" name="dresscode" value={sjabloon?.dresscode ?? voorinvulling?.dresscode ?? ""} />
      <input type="hidden" name="startsAt" value={datum && van ? `${datum}T${van}` : ""} />
      <input type="hidden" name="endsAt" value={datum && tot ? `${datum}T${tot}` : ""} />
      <input type="hidden" name="breakMinutes" value={String(pauze)} />
      <input type="hidden" name="hourlyRateCents" value={String(tariefCent)} />
      <input type="hidden" name="positions" value={String(personen)} />
      <input type="hidden" name="annuleerUren" value={annuleerUren} />

      {stap === 1 && (
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-ink">
            {t.titel}
            <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={120} placeholder={t.titelHint} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 text-base font-normal" autoFocus />
          </label>
          {sjablonen.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{t.sjabloon}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sjablonen.slice(0, 10).map((s) => (
                  <button key={s.key} type="button" onClick={() => kies(s)} className={`rounded-full border px-3 py-1 text-sm ${sjabloon?.key === s.key ? "border-ink bg-ink text-white" : "border-hair bg-white text-ink hover:border-brand-300"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stap === 2 && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            {t.datum}
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal" required />
          </label>
          <label className="block text-sm font-semibold text-ink">
            {t.personen}
            <input type="number" min={1} max={50} value={personen} onChange={(e) => setPersonen(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal" />
          </label>
          <label className="block text-sm font-semibold text-ink">
            {t.van}
            <input type="time" value={van} onChange={(e) => setVan(e.target.value)} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal" required />
          </label>
          <label className="block text-sm font-semibold text-ink">
            {t.tot}
            <input type="time" value={tot} onChange={(e) => setTot(e.target.value)} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal" required />
          </label>
          <label className="block text-sm font-semibold text-ink">
            {t.pauze}
            <select value={pauze} onChange={(e) => setPauze(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal">
              {pauzeKeuzes(pauze).map((m) => (
                <option key={m} value={m}>{m === 0 ? t.geenPauze : vul(t.minuten, { m })}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {stap === 3 && (
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-ink">
            {t.tarief}
            <input type="number" inputMode="decimal" min={minEuro} step="0.5" value={tarief} onChange={(e) => setTarief(e.target.value)} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal" required />
            <span className="mt-1 block text-xs font-normal text-neutralx-500">{vul(t.tariefHint, { min: minEuro })}</span>
          </label>
          {kostenplaatsen.length > 0 && (
            <label className="block text-sm font-semibold text-ink">
              {n.kostenplaats}
              <select name="kostenplaats" defaultValue="" className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal">
                <option value="">{n.kostenplaatsGeen}</option>
                {kostenplaatsen.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-neutralx-500">{n.kostenplaatsUitleg}</span>
            </label>
          )}
          <label className="flex items-start gap-2 rounded-xl bg-paper-soft p-3 text-sm">
            <input type="checkbox" name="autoAcceptFavorieten" value="on" className="mt-0.5 h-4 w-4 accent-brand-500" />
            <span>
              <span className="block font-semibold text-ink">{n.autoAcceptFav}</span>
              <span className="block text-xs text-neutralx-500">{n.autoAcceptFavUitleg}</span>
            </span>
          </label>
          <label className="block text-sm font-semibold text-ink">
            {t.annuleer}
            <select value={annuleerUren} onChange={(e) => setAnnuleerUren(e.target.value)} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal">
              {ANNULEER_TERMIJNEN.map((u) => (
                <option key={u} value={u}>{annuleerTermijnLabel(u, locale)}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-normal text-neutralx-500">{annuleerUitleg}</span>
          </label>
          {branches.length > 1 && (
            <label className="block text-sm font-semibold text-ink">
              {t.vestiging}
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-1 w-full rounded-xl border border-hair px-3 py-2 font-normal">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.city ? `, ${b.city}` : ""}</option>
                ))}
              </select>
            </label>
          )}
          {forecast && forecast.sample >= 8 && tariefCent > 0 && (
            <>
              <FairPayMeter
                rateCents={tariefCent}
                marketRateCents={forecast.marketRateCents}
                fillChance={forecast.fillChance}
                suggestedRateCents={forecast.suggestedRateCents}
                suggestedFillChance={forecast.suggestedFillChance}
                sample={forecast.sample}
                onApplySuggested={(c) => setTarief((c / 100).toFixed(2))}
              />
              {forecast.fillChance < 0.5 && (
                <p role="status" className="rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-neutralx-700">{n.voorbeeldKansLaag}</p>
              )}
            </>
          )}
          <p className="rounded-xl bg-paper-soft p-3 text-sm text-neutralx-700">
            {snelSamenvatting(t, { titel, datum, van, tot, personen, pauze, tarief }, locale)}
          </p>
          {/* wat de klus kost, vlak boven "Plaats de klus" (zoals /klus-plaatsen) */}
          {tijdOk && tariefCent > 0 && (
            <div className="rounded-xl border border-hair p-3 text-sm">
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5">
                <dt className="text-neutralx-600">{personen === 1 ? t.kostenLoon : t.kostenLoonMeer}</dt>
                <dd className="num text-right font-semibold text-ink">{euroCents(kosten.grossTotalCents)}</dd>
                <dt className="text-neutralx-600">{vul(t.kostenPlatform, { u: urenTekst(kosten.totalHours) })}</dt>
                <dd className="num text-right font-semibold text-ink">{euroCents(kosten.feeTotalCents)}</dd>
                <dt className="border-t border-hair pt-1.5 font-semibold text-ink">{t.kostenTotaal}</dt>
                <dd className="num border-t border-hair pt-1.5 text-right font-display text-lg font-bold text-ink">{euroWhole(kosten.totalCents)}</dd>
              </dl>
              <p className="mt-2 text-xs text-neutralx-500">{t.kostenUitleg}</p>
            </div>
          )}
        </div>
      )}

      {(melding || state.error) && (
        <p role="alert" className="mt-4 text-sm font-semibold text-warn">{melding ?? state.error}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {stap > 1 && (
          <button type="button" className="btn-ghost" onClick={() => { setMelding(null); setStap((s) => (s === 3 ? 2 : 1)); }}>
            {t.terug}
          </button>
        )}
        {stap === 1 && <button type="button" className="btn-primary" onClick={naar2}>{t.volgende}</button>}
        {stap === 2 && <button type="button" className="btn-primary" onClick={naar3}>{t.volgende}</button>}
        {stap === 3 && (tariefOk ? <PlaatsKnop tekst={t.plaats} bezig={t.bezig} /> : <button type="button" className="btn-primary" disabled>{t.plaats}</button>)}
      </div>
    </form>

    {/* live voorbeeld (naar YoungOnes' "Zo zien freelancers jouw klus"): de kaart zoals een werker hem straks ziet */}
    <aside className="lg:sticky lg:top-24 lg:self-start" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">{n.voorbeeldKop}</p>
      <div className="mt-2 overflow-hidden rounded-2xl border border-hair bg-white shadow-soft">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-600 to-ink">
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink">{vestiging?.name ?? ""}</span>
          <p className="absolute inset-x-3 bottom-3 line-clamp-2 font-display text-lg font-bold text-white drop-shadow">{titel.trim() || n.voorbeeldTitel}</p>
        </div>
        <div className="space-y-1.5 p-4 text-sm text-neutralx-700">
          <p className="flex items-center gap-2"><span aria-hidden>📅</span>{datum && van && tot ? `${datumLabel} · ${van}–${tot}` : n.voorbeeldDatum}</p>
          <p className="flex items-center gap-2"><span aria-hidden>📍</span>{vestiging ? `${vestiging.name}${vestiging.city ? `, ${vestiging.city}` : ""}` : n.voorbeeldPlaats}</p>
          <p className="flex items-center gap-2"><span aria-hidden>👥</span>{personen === 1 ? n.voorbeeldPersoon : fmt(n.voorbeeldPersonen, { n: personen })}</p>
          <p className="flex items-center gap-2 text-xs text-neutralx-500"><span aria-hidden>⊘</span>{fmt(n.voorbeeldAfzeg, { label: annuleerTermijnLabel(Number(annuleerUren), locale) })}</p>
          <p className="num pt-1 text-xl font-bold text-ink">{tariefCent > 0 ? `${tariefLabel}/u` : "€ –"}</p>
        </div>
      </div>
      {bereik !== null && bereik > 0 && (
        <p className="mt-2 text-xs font-semibold text-ink">{bereik === 1 ? n.voorbeeldBereikEen : fmt(n.voorbeeldBereik, { n: bereik })}</p>
      )}
      <p className="mt-2 text-xs text-neutralx-400">{n.voorbeeldUitleg}</p>
    </aside>
    </div>
  );
}
