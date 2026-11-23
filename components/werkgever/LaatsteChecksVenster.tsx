"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { vraagControleAanAction } from "@/app/werkgever/onboarding/controle-actions";
import { KvkZoeker, type KvkZoekerTeksten } from "@/components/kvk/KvkZoeker";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { BUITEN_LANDEN, EU_LANDEN, landSoort } from "@/lib/onboarding/buitenland";
import {
  controleerControleInvoer,
  maakControleInvoer,
  type ControleFout,
  type ControleFouten,
  type ControleVeld,
} from "@/lib/company/gecontroleerd";

// ---------------------------------------------------------------------------
// "Nog een paar laatste checks" (23 nov 2026, eigenaar: de controle van een bedrijf komt pas als het iemand wil inplannen, niet
// in de onboarding). Dit venster verschijnt als een bedrijf dat nog niet is gecontroleerd een freelancer kiest. Het vraagt wat
// we nodig hebben (KVK-nummer, of buiten Nederland een btw- of registratienummer; de bedrijfsnaam zoals geregistreerd; een
// contactpersoon met functie en telefoon; wie de overeenkomst tekent), bewaart de keuze en laat de reactie openstaan. Klopt alles
// en hoort de aanmelder bij het bedrijf, dan is het bedrijf meteen gecontroleerd en gaat de keuze door; anders wacht het op
// Beheer en krijgt het bericht. De regels staan op de server (lib/company/controle-aanvraag.ts); de veldcontrole is dezelfde.
// ---------------------------------------------------------------------------

export function LaatsteChecksVenster({
  naam,
  keuzes,
  onSluit,
  onGecontroleerd,
}: {
  /** de naam van de gekozen freelancer */
  naam: string;
  /** de reacties die bewaard moeten worden (id van de reactie en van de klus) */
  keuzes: { offerId: string; shiftId: string }[];
  onSluit: () => void;
  /** het bedrijf is meteen gecontroleerd: de aanroeper plant de keuze nu in */
  onGecontroleerd: () => void;
}) {
  const t = useT().laatsteChecks;
  const router = useRouter();
  const id = useId();
  const titelId = `${id}-titel`;
  const eersteRef = useRef<HTMLSelectElement>(null);

  const [land, setLand] = useState("NL");
  const [kvkNumber, setKvkNumber] = useState("");
  const [btwNummer, setBtwNummer] = useState("");
  const [registratieNummer, setRegistratieNummer] = useState("");
  const [bedrijfsnaam, setBedrijfsnaam] = useState("");
  const [contactNaam, setContactNaam] = useState("");
  const [contactFunctie, setContactFunctie] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [tekentZelf, setTekentZelf] = useState(true);
  const [tekenaarNaam, setTekenaarNaam] = useState("");
  const [fouten, setFouten] = useState<ControleFouten>({});
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [bewaard, setBewaard] = useState(false);
  const soort = landSoort(land) ?? "NL";

  useEffect(() => {
    eersteRef.current?.focus();
  }, []);

  const zoekTeksten: KvkZoekerTeksten = {
    zoekPlaceholder: t.zoekPlaceholder,
    laden: t.zoekLaden,
    nietGevonden: t.zoekNietGevonden,
    zoekOsm: t.zoekOsm,
    bezet: t.zoekBezet,
    aantal: t.zoekAantal,
    nietActief: t.zoekNietActief,
  };

  const veldTekst = (veld: ControleVeld, code: ControleFout): string => {
    if (code === "leeg") return t.foutLeeg;
    if (veld === "kvkNumber") return t.foutKvk;
    if (veld === "telefoon") return t.foutTelefoon;
    return t.foutOngeldig;
  };
  const attrs = (veld: ControleVeld) => (fouten[veld] ? { "aria-invalid": true as const, "aria-describedby": `${id}-${veld}-fout` } : {});
  const melding = (veld: ControleVeld): ReactNode => {
    const code = fouten[veld];
    if (!code) return null;
    return (
      <span id={`${id}-${veld}-fout`} role="alert" className="mt-1 block text-xs font-medium text-crit">
        {veldTekst(veld, code)}
      </span>
    );
  };

  async function opslaan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (bezig) return;
    const velden = { land, kvkNumber, btwNummer, registratieNummer, bedrijfsnaam, contactNaam, contactFunctie, telefoon, tekentZelf, tekenaarNaam };
    // eerst in de browser, met dezelfde regels als de server
    const c = controleerControleInvoer(maakControleInvoer(velden));
    if (!c.ok) {
      setFouten(c.fouten);
      setFout(null);
      return;
    }
    setFouten({});
    setFout(null);
    setBezig(true);
    try {
      const r = await vraagControleAanAction({ velden, keuzes });
      if (!r.ok) {
        // de server zegt het in gewoon Nederlands (bijv. een KVK-nummer dat niet bestaat); bij een veld staat de markering erbij
        setFouten(r.fouten ?? {});
        setFout(r.error ?? t.foutAlgemeen);
        return;
      }
      router.refresh();
      if (r.status === "gecontroleerd") onGecontroleerd();
      else setBewaard(true);
    } catch {
      setFout(t.foutAlgemeen);
    } finally {
      setBezig(false);
    }
  }

  const veldKlasse = "field-input";
  return (
    <div className="fixed inset-0 z-[2100] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onSluit}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lift sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onSluit();
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titelId} className="font-display text-lg font-bold text-ink">
            {bewaard ? t.aangevraagdTitel : t.titel}
          </h2>
          <button type="button" onClick={onSluit} aria-label={t.sluiten} className="rounded-lg px-2 py-1 text-neutralx-500 hover:bg-paper-soft">
            ✕
          </button>
        </div>

        {bewaard ? (
          <div className="mt-3 space-y-4">
            <p role="status" className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">
              {t.aangevraagdTekst}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onSluit} className="btn-ghost text-sm">
                {t.sluiten}
              </button>
              <Link href="/werkgever/diensten" className="btn-primary text-sm">
                {t.naarKlussen}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={opslaan} className="mt-3 space-y-3" noValidate>
            <p className="text-sm text-neutralx-600">{t.intro}</p>
            <p className="rounded-lg bg-paper-soft px-3 py-2 text-sm font-semibold text-ink">{fmt(t.gekozen, { naam })}</p>

            <div>
              <label htmlFor={`${id}-land`} className="field-label">
                {t.land}
              </label>
              <select id={`${id}-land`} ref={eersteRef} value={land} onChange={(e) => setLand(e.target.value)} className={veldKlasse} {...attrs("land")}>
                <option value="NL">{t.nederland}</option>
                <optgroup label={t.landEu}>
                  {EU_LANDEN.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.naam}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t.landBuiten}>
                  {BUITEN_LANDEN.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.naam}
                    </option>
                  ))}
                </optgroup>
              </select>
              {melding("land")}
            </div>

            {soort === "NL" && (
              <>
                <KvkZoeker
                  label={t.zoekLabel}
                  teksten={zoekTeksten}
                  vulFormulier={{ kvk: `${id}-kvk`, name: `${id}-bedrijfsnaam` }}
                  alleenAlsLeeg={["name"]}
                />
                <div>
                  <label htmlFor={`${id}-kvk`} className="field-label">
                    {t.kvk}
                  </label>
                  <input
                    id={`${id}-kvk`}
                    name={`${id}-kvk`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="12345678"
                    value={kvkNumber}
                    onChange={(e) => setKvkNumber(e.target.value)}
                    className={veldKlasse}
                    {...attrs("kvkNumber")}
                  />
                  <span className="mt-1 block text-xs text-neutralx-500">{t.kvkHint}</span>
                  {melding("kvkNumber")}
                </div>
              </>
            )}
            {soort === "EU" && (
              <div>
                <label htmlFor={`${id}-btw`} className="field-label">
                  {t.btw}
                </label>
                <input id={`${id}-btw`} autoCapitalize="characters" autoComplete="off" placeholder="DE123456789" value={btwNummer} onChange={(e) => setBtwNummer(e.target.value)} className={veldKlasse} {...attrs("btwNummer")} />
                <span className="mt-1 block text-xs text-neutralx-500">{t.btwHint}</span>
                {melding("btwNummer")}
              </div>
            )}
            {soort === "BUITEN" && (
              <div>
                <label htmlFor={`${id}-reg`} className="field-label">
                  {t.reg}
                </label>
                <input id={`${id}-reg`} autoComplete="off" value={registratieNummer} onChange={(e) => setRegistratieNummer(e.target.value)} className={veldKlasse} {...attrs("registratieNummer")} />
                <span className="mt-1 block text-xs text-neutralx-500">{t.regHint}</span>
                {melding("registratieNummer")}
              </div>
            )}

            <div>
              <label htmlFor={`${id}-bedrijfsnaam`} className="field-label">
                {t.bedrijfsnaam}
              </label>
              <input
                id={`${id}-bedrijfsnaam`}
                name={`${id}-bedrijfsnaam`}
                autoComplete="organization"
                value={bedrijfsnaam}
                onChange={(e) => setBedrijfsnaam(e.target.value)}
                className={veldKlasse}
                {...attrs("bedrijfsnaam")}
              />
              {melding("bedrijfsnaam")}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-contactNaam`} className="field-label">
                  {t.contactNaam}
                </label>
                <input id={`${id}-contactNaam`} autoComplete="name" value={contactNaam} onChange={(e) => setContactNaam(e.target.value)} className={veldKlasse} {...attrs("contactNaam")} />
                {melding("contactNaam")}
              </div>
              <div>
                <label htmlFor={`${id}-contactFunctie`} className="field-label">
                  {t.contactFunctie}
                </label>
                <input id={`${id}-contactFunctie`} autoComplete="organization-title" value={contactFunctie} onChange={(e) => setContactFunctie(e.target.value)} className={veldKlasse} {...attrs("contactFunctie")} />
                {melding("contactFunctie")}
              </div>
            </div>

            <div>
              <label htmlFor={`${id}-telefoon`} className="field-label">
                {t.telefoon}
              </label>
              <input id={`${id}-telefoon`} type="tel" autoComplete="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} className={veldKlasse} {...attrs("telefoon")} />
              <span className="mt-1 block text-xs text-neutralx-500">{t.telefoonHint}</span>
              {melding("telefoon")}
            </div>

            <fieldset>
              <legend className="field-label">{t.tekent}</legend>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink">
                <label className="flex items-center gap-2">
                  <input type="radio" name={`${id}-tekent`} checked={tekentZelf} onChange={() => setTekentZelf(true)} />
                  {t.tekentZelf}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name={`${id}-tekent`} checked={!tekentZelf} onChange={() => setTekentZelf(false)} />
                  {t.tekentAnder}
                </label>
              </div>
              {!tekentZelf && (
                <div className="mt-2">
                  <label htmlFor={`${id}-tekenaarNaam`} className="field-label">
                    {t.tekenaarNaam}
                  </label>
                  <input id={`${id}-tekenaarNaam`} value={tekenaarNaam} onChange={(e) => setTekenaarNaam(e.target.value)} className={veldKlasse} {...attrs("tekenaarNaam")} />
                  {melding("tekenaarNaam")}
                </div>
              )}
            </fieldset>

            <p className="text-xs text-neutralx-500">{t.privacy}</p>
            {fout && (
              <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">
                {fout}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" onClick={onSluit} className="btn-ghost text-sm">
                {t.sluiten}
              </button>
              <button type="submit" disabled={bezig} className="btn-primary text-sm disabled:opacity-60">
                {bezig ? t.bezig : t.opslaan}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
