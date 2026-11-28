"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Kaart } from "@/components/werkgever/Kaart";
import { fmt } from "@/lib/i18n/dictionaries";
import {
  BELGIE_BRONNEN,
  BELGIE_CHECKLIST,
  BELGISCHE_CONTRACTEN,
  DIMONA_TYPE,
  LATERE_CONTRACTEN,
  SJABLONEN_PER_SOORT,
  checklistStand,
  type BelgieKlus,
  type BelgieVinkje,
  type BelgischContract,
  type ContractSjabloon,
} from "@/lib/belgie/klus-kern";
import { bevestigBelgieWerkgeverAction, zetBelgieDimonaAction, zetBelgieSoortAction, zetBelgieVinkjeAction } from "@/app/werkgever/diensten/[shiftId]/belgie-actions";

// Het paneel "Klus in België" op de kluspagina van het bedrijf (28 nov 2026, lib/belgie/klus-kern.ts). Van boven naar beneden:
// het soort contract (te wijzigen tot er iemand gekozen is), de eigen stap "Ik bevestig dit" (het bedrijf is de werkgever en doet
// de Dimona; pas daarna kan het iemand kiezen), de checklist met vinkjes en bronnen, de contractsjablonen en (niet verplicht) het
// Dimona-nummer per gekozen werker. Elke actie geeft de stand van de server terug; die nemen we over.

export interface BelgieWerker {
  userId: string;
  naam: string;
  dimona: string | null;
}

export function BelgieKlusPaneel({
  shiftId,
  begin,
  bevestigdOp,
  soortVast,
  werkers,
}: {
  shiftId: string;
  begin: BelgieKlus;
  /** de dag van de bevestiging, al als tekst (Nederlandse tijd); null = nog niet bevestigd */
  bevestigdOp: string | null;
  /** er is al iemand gekozen: dan ligt de soort contract vast */
  soortVast: boolean;
  werkers: BelgieWerker[];
}) {
  const { locale, t } = useI18n();
  const b = t.belgie;
  const [klus, setKlus] = useState<BelgieKlus>(begin);
  const [datum, setDatum] = useState(bevestigdOp);
  const [wijzig, setWijzig] = useState(!begin.soort);
  const [keuze, setKeuze] = useState<BelgischContract | null>(begin.soort);
  const [horeca, setHoreca] = useState(begin.horeca);
  const [melding, setMelding] = useState<{ fout: boolean; tekst: string } | null>(null);
  const [bezig, start] = useTransition();

  const soortTitel: Record<BelgischContract, string> = { student: b.soortStudent, flexi: b.soortFlexi };
  const laterTitel: Record<(typeof LATERE_CONTRACTEN)[number], string> = { uitzend: b.soortUitzend, zelfstandige: b.soortZelfstandige };
  const sjabloonTitel: Record<ContractSjabloon, string> = { student: b.sjabloonStudent, "flexi-raam": b.sjabloonRaam, "flexi-arbeid": b.sjabloonFlexi };
  const stand = checklistStand(klus);

  function neem(r: { ok: boolean; message: string; klus?: BelgieKlus }) {
    if (r.klus) setKlus(r.klus);
    setMelding(r.ok ? (r.message ? { fout: false, tekst: r.message } : null) : { fout: true, tekst: r.message || b.mislukt });
  }

  function slaSoortOp() {
    if (!keuze) {
      setMelding({ fout: true, tekst: b.kiesSoort });
      return;
    }
    start(async () => {
      const r = await zetBelgieSoortAction(shiftId, keuze, horeca).catch(() => ({ ok: false, message: b.mislukt }));
      neem(r);
      if (r.ok) setWijzig(false);
    });
  }

  function bevestig() {
    start(async () => {
      const r = await bevestigBelgieWerkgeverAction(shiftId).catch(() => ({ ok: false, message: b.mislukt }));
      neem(r);
      const op = "klus" in r ? r.klus?.bevestiging?.op : undefined;
      if (r.ok && op) {
        setDatum(new Date(op).toLocaleDateString(locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }));
      }
    });
  }

  function vink(id: BelgieVinkje, aan: boolean) {
    start(async () => {
      neem(await zetBelgieVinkjeAction(shiftId, id, aan).catch(() => ({ ok: false, message: b.mislukt })));
    });
  }

  return (
    <Kaart titel={b.paneelTitel} uitleg={b.paneelUitleg}>
      <div className="space-y-6">
        {melding && (
          <p role={melding.fout ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${melding.fout ? "border border-crit/40 bg-crit/10 text-ink" : "border border-ok/30 bg-ok/10 text-ink"}`}>
            {melding.tekst}
          </p>
        )}

        {/* 1. het soort contract */}
        <section aria-labelledby="belgie-soort">
          <h3 id="belgie-soort" className="text-sm font-semibold text-ink">
            {b.soortKop}
          </h3>
          {!wijzig && klus.soort ? (
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-neutralx-700">
              <span className="pill-neutral">
                {soortTitel[klus.soort]} · Dimona {DIMONA_TYPE[klus.soort]}
                {klus.horeca ? ` · ${b.horecaJa}` : ""}
              </span>
              {soortVast ? (
                <span className="text-xs text-neutralx-500">{b.soortVast}</span>
              ) : (
                <button type="button" onClick={() => setWijzig(true)} className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 hover:underline sm:min-h-0">
                  {b.soortWijzigen}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              {!klus.soort && <p className="text-sm text-warn">{b.soortNogNiet}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {BELGISCHE_CONTRACTEN.map((s) => (
                  <label key={s} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${keuze === s ? "border-brand-500 bg-brand-50" : "border-hair bg-white"}`}>
                    <input type="radio" name={`belgie-soort-${shiftId}`} value={s} checked={keuze === s} onChange={() => setKeuze(s)} className="accent-brand-500" />
                    <span className="font-semibold text-ink">{soortTitel[s]}</span>
                  </label>
                ))}
                {LATERE_CONTRACTEN.map((s) => (
                  <label key={s} className="flex min-h-[44px] items-center gap-3 rounded-xl border border-hair bg-paper-soft p-3 text-sm text-neutralx-500">
                    <input type="radio" name={`belgie-soort-${shiftId}`} value={s} disabled />
                    <span>
                      {laterTitel[s]} <span className="text-xs">({b.volgtLater})</span>
                    </span>
                  </label>
                ))}
              </div>
              {keuze === "flexi" && (
                <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={horeca} onChange={(e) => setHoreca(e.target.checked)} className="accent-brand-500" />
                  {b.horecaLabel}
                </label>
              )}
              <button type="button" onClick={slaSoortOp} disabled={bezig} className="btn-primary min-h-[44px] disabled:opacity-50">
                {b.soortOpslaan}
              </button>
            </div>
          )}
        </section>

        {/* 2. de eigen stap: het bedrijf is de werkgever en doet de Dimona */}
        {klus.soort && (
          <section aria-labelledby="belgie-bevestig">
            <h3 id="belgie-bevestig" className="text-sm font-semibold text-ink">
              {b.bevestigKop}
            </h3>
            {klus.bevestiging ? (
              <p className="mt-1 rounded-xl border border-ok/30 bg-ok/10 p-3 text-sm text-ink">
                {fmt(b.bevestigd, { datum: datum ?? "", type: klus.bevestiging.dimona })}
              </p>
            ) : (
              <div className="mt-2 rounded-xl border border-warn/40 bg-warn/10 p-4">
                <p className="text-sm text-ink">{fmt(b.bevestigTekst, { type: DIMONA_TYPE[klus.soort] })}</p>
                <button type="button" onClick={bevestig} disabled={bezig} className="btn-primary mt-3 min-h-[44px] disabled:opacity-50">
                  {b.bevestigKnop}
                </button>
              </div>
            )}
          </section>
        )}

        {/* 3. de checklist */}
        {klus.soort && (
          <section aria-labelledby="belgie-checklist">
            <h3 id="belgie-checklist" className="text-sm font-semibold text-ink">
              {fmt(b.checklistKop, { klaar: stand.klaar, totaal: stand.totaal })}
            </h3>
            <p className="mt-0.5 text-xs text-neutralx-500">{b.checklistUitleg}</p>
            <ul className="mt-3 space-y-3">
              {BELGIE_CHECKLIST[klus.soort].map((v) => {
                const aan = klus.vinkjes.includes(v.id);
                const tekst = b.vinkjes[v.id];
                return (
                  <li key={v.id} className="flex items-start gap-3">
                    <input
                      id={`belgie-vinkje-${v.id}`}
                      type="checkbox"
                      checked={aan}
                      disabled={bezig}
                      onChange={(e) => vink(v.id, e.target.checked)}
                      className="mt-1 h-5 w-5 flex-shrink-0 accent-brand-500"
                    />
                    <div className="min-w-0 text-sm">
                      <label htmlFor={`belgie-vinkje-${v.id}`} className="font-semibold text-ink">
                        {tekst.titel}
                      </label>
                      <p className="mt-0.5 text-neutralx-600">{tekst.uitleg}</p>
                      <a href={BELGIE_BRONNEN[v.bron]} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex min-h-[44px] items-center text-xs font-semibold text-brand-600 hover:underline sm:min-h-0">
                        {b.bron}
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 4. de contractsjablonen, met de gegevens van de klus (en van een gekozen werker) al ingevuld */}
        {klus.soort && (
          <section aria-labelledby="belgie-sjablonen">
            <h3 id="belgie-sjablonen" className="text-sm font-semibold text-ink">
              {b.sjablonenKop}
            </h3>
            <p className="mt-0.5 text-xs text-neutralx-500">{b.sjablonenUitleg}</p>
            <ul className="mt-3 space-y-2">
              {SJABLONEN_PER_SOORT[klus.soort].map((sj) => (
                <li key={sj} className="text-sm">
                  <span className="font-semibold text-ink">{sjabloonTitel[sj]}</span>
                  <span className="mt-1 flex flex-wrap gap-2">
                    <a href={`/api/werkgever/diensten/${shiftId}/belgie/contract?sjabloon=${sj}`} download className="btn-ghost min-h-[44px] text-xs">
                      {b.sjabloonZonderWerker}
                    </a>
                    {werkers.map((w) => (
                      <a
                        key={w.userId}
                        href={`/api/werkgever/diensten/${shiftId}/belgie/contract?sjabloon=${sj}&werker=${encodeURIComponent(w.userId)}`}
                        download
                        className="btn-ghost min-h-[44px] text-xs"
                      >
                        {fmt(b.sjabloonVoor, { naam: w.naam })}
                      </a>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 5. het Dimona-nummer per gekozen werker (niet verplicht; nooit een rijksregisternummer) */}
        {klus.soort && (
          <section aria-labelledby="belgie-dimona">
            <h3 id="belgie-dimona" className="text-sm font-semibold text-ink">
              {b.dimonaKop}
            </h3>
            <p className="mt-0.5 text-xs text-neutralx-500">{b.dimonaUitleg}</p>
            {werkers.length === 0 ? (
              <p className="mt-2 text-sm text-neutralx-600">{b.dimonaGeenWerkers}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {werkers.map((w) => (
                  <DimonaRij key={w.userId} shiftId={shiftId} werker={w} />
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="text-sm">
          <Link href="/belgie/voorwaarden" className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 hover:underline sm:min-h-0">
            {b.voorwaardenLink}
          </Link>
        </p>
      </div>
    </Kaart>
  );
}

/** Eén regel voor het Dimona-nummer van een werker. Een losse component: het veld houdt zijn focus. */
function DimonaRij({ shiftId, werker }: { shiftId: string; werker: BelgieWerker }) {
  const b = useI18n().t.belgie;
  const [waarde, setWaarde] = useState(werker.dimona ?? "");
  const [melding, setMelding] = useState<{ fout: boolean; tekst: string } | null>(null);
  const [bezig, start] = useTransition();
  const veld = `belgie-dimona-${werker.userId}`;

  function bewaar(nummer: string) {
    start(async () => {
      const r = await zetBelgieDimonaAction(shiftId, werker.userId, nummer).catch(() => ({ ok: false, message: b.mislukt, dimona: undefined }));
      if (r.ok) setWaarde(r.dimona ?? "");
      setMelding(r.ok ? { fout: false, tekst: r.dimona ? b.dimonaOpgeslagen : "" } : { fout: true, tekst: r.message || b.mislukt });
    });
  }

  return (
    <li>
      <label htmlFor={veld} className="field-label">
        {fmt(b.dimonaLabel, { naam: werker.naam })}
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={veld}
          value={waarde}
          onChange={(e) => setWaarde(e.target.value)}
          autoComplete="off"
          inputMode="text"
          maxLength={40}
          aria-describedby={melding?.fout ? `${veld}-fout` : undefined}
          className="field-input min-w-0 flex-1"
        />
        <button type="button" onClick={() => bewaar(waarde)} disabled={bezig} className="btn-primary min-h-[44px] disabled:opacity-50">
          {b.dimonaOpslaan}
        </button>
        {werker.dimona !== null || waarde ? (
          <button type="button" onClick={() => bewaar("")} disabled={bezig} className="btn-ghost min-h-[44px] disabled:opacity-50">
            {b.dimonaWissen}
          </button>
        ) : null}
      </div>
      {melding?.tekst && (
        <p id={`${veld}-fout`} role={melding.fout ? "alert" : "status"} className={`mt-1 text-xs ${melding.fout ? "font-medium text-crit" : "text-ok"}`}>
          {melding.tekst}
        </p>
      )}
    </li>
  );
}
