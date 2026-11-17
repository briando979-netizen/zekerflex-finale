"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { FiscalProfile, WorkerKind } from "@/lib/fiscal/store";
import { KorHulp } from "@/components/app/KorHulp";
import { useFT } from "@/components/i18n/useFT";
import { vulIn } from "@/lib/i18n/vul-in";
import type { FreelancerDict } from "@/lib/i18n/freelancer";
import {
  BEDRIJFSNAAM_MAX,
  KOR_SINDS_VROEGST,
  bedrijfAlIngevuld,
  bedrijfsnaamVooraf,
  dagKort,
  formulierMist,
  korSindsGeldig,
  korSindsVooraf,
  maskeerIban,
  opslagBody,
  toonWerkvormKeuze,
  zakelijkeWerkvorm,
} from "@/lib/fiscal/formulier";

/** De tekst van de gekozen facturatiewijze (de sleutel komt van de server: reverse-billing, self-invoice of payroll). */
function factuurTekst(f: FreelancerDict["fiscaalForm"], modus: string): string {
  return modus === "reverse-billing" ? f.factuur.reverseBilling : modus === "self-invoice" ? f.factuur.selfInvoice : modus === "payroll" ? f.factuur.payroll : modus;
}

const KIND_SLEUTELS: WorkerKind[] = ["zzp", "flexwerker", "uitzendkracht"];

/**
 * Wat uit het profiel al bekend is (de aanmelding bewaart KVK en btw bij het profiel). Alleen om te kunnen zeggen "al ingevuld"
 * en om de velden vooraf te vullen; zonder dit prop gedraagt het formulier zich als voorheen.
 */
export interface ProfielBedrijf {
  kvkNumber: string;
  vatNumber: string;
  /** de naam uit een gecontroleerde KVK-inschrijving: vult de bedrijfsnaam voor zolang de werker er nooit een invulde */
  kvkNaam?: string | undefined;
}

export function FiscalForm({
  initial,
  defaultKind,
  profiel,
  facturatie,
  vandaag,
}: {
  initial: FiscalProfile;
  defaultKind: WorkerKind | null;
  profiel?: ProfielBedrijf | undefined;
  /** de facturatiewijze zoals de server hem bepaalt (invoiceModeFor); zonder dit prop "reverse-billing" zoals voorheen */
  facturatie?: string | undefined;
  /** vandaag als Nederlandse dag (YYYY-MM-DD, van de server): de grens van "KOR sinds" */
  vandaag?: string | undefined;
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<WorkerKind>(initial.workerKind ?? defaultKind ?? "flexwerker");
  const [vatNumber, setVatNumber] = useState(initial.vatNumber ?? profiel?.vatNumber ?? "");
  const [vatRequested, setVatRequested] = useState(initial.vatRequested);
  const [kvkNumber, setKvkNumber] = useState(initial.kvkNumber ?? profiel?.kvkNumber ?? "");
  // KOR: al (bevestigd), nog niet maar wel aanvragen (KorHulp), of geen
  const [korKeuze, setKorKeuze] = useState<"heb" | "aanvragen" | "geen">(
    initial.korApplies ? "heb" : initial.korAanvraag ? "aanvragen" : "geen",
  );
  const kor = korKeuze === "heb";
  const korIngediend = initial.korAanvraag?.stand === "ingediend";
  const ft = useFT();
  const tk = ft.kor;
  const f = ft.fiscaalForm;
  // Zakelijke gegevens (17 nov 2026): de bedrijfsnaam (voorgevuld uit de KVK zolang er nooit een is ingevuld) en "KOR sinds"
  const bedrijfsnaamStart = bedrijfsnaamVooraf(initial.bedrijfsnaam, profiel?.kvkNaam);
  const [bedrijfsnaam, setBedrijfsnaam] = useState(bedrijfsnaamStart);
  const [korSinds, setKorSinds] = useState(korSindsVooraf(initial.korSinds, initial.korApplies ? initial.korAanvraag?.ingang : null, vandaag));
  const korSindsFout = Boolean(korSinds && vandaag) && !korSindsGeldig(korSinds, vandaag);
  const [bsn, setBsn] = useState("");
  const [iban, setIban] = useState(initial.iban ?? "");
  // een bewaard IBAN staat gemaskeerd; "Wijzig IBAN" toont het veld (de bevestigingscode van de route blijft gelden)
  const [wijzigIban, setWijzigIban] = useState(false);
  const [ibanCode, setIbanCode] = useState("");
  const [codeNodig, setCodeNodig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // de werkvorm en het bedrijfsdeel staan als samenvatting zolang ze al ingevuld zijn; "wijzigen" toont de invoer
  const [wijzigKind, setWijzigKind] = useState(false);
  const [wijzigBedrijf, setWijzigBedrijf] = useState(false);
  const [result, setResult] = useState<(FiscalProfile & { resolvedInvoiceMode: string }) | null>(
    // 16 nov 2026: stond vast op "reverse-billing", ook voor een uitzendkracht (die krijgt een loonstrook)
    initial.workerKind ? { ...initial, resolvedInvoiceMode: facturatie ?? "reverse-billing" } : null,
  );

  async function submit() {
    setBusy(true);
    try {
      // het IBAN alleen als er iets staat (optioneel, bevestigen kan later bij Verificatie); de loonheffingskorting niet:
      // die kies je pas na de getekende uitzendovereenkomst, in het uitzendpaneel (lib/fiscal/formulier.ts, opslagBody)
      // de bedrijfsnaam en "KOR sinds" alleen bij een zzp'er of flexwerker (opslagBody beslist wat er meegaat)
      const body = opslagBody({ kind, iban, kor, vatRequested, vatNumber, kvkNumber, bsn, ibanCode, bedrijfsnaam, bedrijfsnaamWas: (result ?? initial).bedrijfsnaam, korSinds });

      const res = await fetch("/api/me/fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        // Een gewijzigd IBAN vraagt een bevestigingscode (mail of verificatie-app): toon het codeveld.
        if (res.status === 423 && typeof data?.error?.code === "string" && data.error.code.startsWith("IBAN_")) {
          setCodeNodig(data.error.message ?? f.vulCode);
        }
        toast.error(data?.error?.message ?? f.opslaanMislukt);
      } else {
        setCodeNodig(null);
        setIbanCode("");
        // de teruggegeven serverversie vervangt wat we hadden; de samenvattingen lezen daaruit
        setResult(data);
        setWijzigKind(false);
        setWijzigBedrijf(false);
        setWijzigIban(false);
        setIban(data.iban ?? "");
        toast.success(
          zakelijkeWerkvorm(kind) ? f.opgeslagenZakelijk : f.opgeslagen,
          data.vatNumber ? (data.vatValid ? f.btwGevalideerd : f.btwOpgeslagen) : undefined,
        );
        router.refresh();
      }
    } catch {
      toast.error(f.opslaanMislukt);
    } finally {
      setBusy(false);
    }
  }

  // Werkvorm wisselen: vergelijk de gekozen werkvorm met de opgeslagen werkvorm (de serverversie na een opslag)
  // en bereken precies wat er nog ontbreekt voor de nieuwe keuze - zodat iemand
  // die overstapt alleen de dingen hoeft in te vullen die echt nodig zijn.
  const savedKind = result?.workerKind ?? initial.workerKind;
  const kindLabel = f.kinds[kind].label;
  const savedLabel = savedKind ? f.kinds[savedKind].label : "";
  const switching = Boolean(savedKind) && kind !== savedKind;
  const hasBsnOnFile = Boolean(initial.bsnHash);

  // al ingevuld (uit de serverversie, aangevuld met het profiel): dan alleen een samenvatting met wijzigen
  const opgeslagenBedrijf = {
    kvk: result?.kvkNumber ?? profiel?.kvkNumber ?? "",
    btw: result?.vatNumber ?? profiel?.vatNumber ?? "",
    kor: Boolean(result?.korApplies),
    btwAangevraagd: Boolean(result?.vatRequested),
    korIngediend: result?.korAanvraag?.stand === "ingediend",
    korSinds: result?.korSinds ?? "",
  };
  const toonKeuze = toonWerkvormKeuze(savedKind, wijzigKind);
  const toonBedrijfOverzicht = !wijzigBedrijf && !switching && bedrijfAlIngevuld(kind, opgeslagenBedrijf);
  const zakelijk = zakelijkeWerkvorm(kind);
  // het IBAN zoals de server het bewaarde (na een opslag de teruggegeven versie)
  const opgeslagenIban = (result ?? initial).iban;
  const bedrijfsnaamUitKvk = initial.bedrijfsnaam === undefined && Boolean(profiel?.kvkNaam) && bedrijfsnaam === bedrijfsnaamStart;
  // een element, geen onderdeel: zzp'er en flexwerker delen hetzelfde veld bovenaan hun blok
  const bedrijfsnaamVeld = (
    <Field label={f.bedrijfsnaam} hint={bedrijfsnaamUitKvk ? f.bedrijfsnaamUitKvk : f.bedrijfsnaamHint}>
      <input
        value={bedrijfsnaam}
        onChange={(e) => setBedrijfsnaam(e.target.value)}
        maxLength={BEDRIJFSNAAM_MAX}
        autoComplete="organization"
        placeholder={f.optioneel}
        className="field-input"
      />
    </Field>
  );

  const mistSleutels = formulierMist({ kind, vatNumber, vatRequested, kvkNumber, kor, korIngediend, hasBsn: hasBsnOnFile, bsn });
  const missing: string[] = mistSleutels.map((s) => (s === "btwZzp" ? f.mistBtwZzp : s === "btwFlex" ? f.mistBtwFlex : f.mistBsn));

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold">{f.stap1}</h2>
        {toonKeuze ? (
          <>
            <p className="mt-1 text-sm text-neutralx-500">
              {f.stap1Uitleg}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {KIND_SLEUTELS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-xl border p-4 text-left transition ${
                    kind === k ? "border-brand-500 bg-brand-50" : "border-hairstrong hover:border-brand-500"
                  }`}
                >
                  <p className="font-semibold text-ink">{f.kinds[k].label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-neutralx-600">{f.kinds[k].blurb}</p>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink">{vulIn(f.gekozen, { werkvorm: savedLabel })}</p>
            <button type="button" onClick={() => setWijzigKind(true)} className="btn-ghost text-sm">
              {f.wijzigen}
            </button>
          </div>
        )}
        {switching && (
          <div className="mt-4 rounded-xl border border-brand-300 bg-brand-50 p-4 text-sm">
            <p className="font-semibold text-ink">
              {vulIn(f.overstap, { van: savedLabel, naar: kindLabel })}
            </p>
            {missing.length > 0 ? (
              <>
                <p className="mt-1 text-neutralx-700">{f.vulNogIn}</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-neutralx-700">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-neutralx-700">
                {f.alCompleet}
              </p>
            )}
            <p className="mt-2 text-xs text-neutralx-500">
              {f.oudeBlijven}
            </p>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">{zakelijk ? f.stap2Zakelijk : f.stap2}</h2>

        {toonBedrijfOverzicht && (
          <div className="rounded-lg border border-hair bg-paper-soft p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-ink">{f.alIngevuld}</p>
              <button type="button" onClick={() => setWijzigBedrijf(true)} className="btn-ghost text-sm">
                {f.wijzigen}
              </button>
            </div>
            <dl className="mt-2 divide-y divide-hair">
              {bedrijfsnaam.trim() && <Row k={f.bedrijfsnaam} v={bedrijfsnaam.trim()} />}
              {opgeslagenBedrijf.kvk && <Row k={f.kvk} v={opgeslagenBedrijf.kvk} />}
              {opgeslagenBedrijf.btw && <Row k={f.btw} v={opgeslagenBedrijf.btw} />}
              {kind === "flexwerker" && opgeslagenBedrijf.kor && (
                <Row k={f.korNaam} v={opgeslagenBedrijf.korSinds ? vulIn(f.jaSinds, { datum: dagKort(opgeslagenBedrijf.korSinds) }) : f.ja} />
              )}
            </dl>
          </div>
        )}

        {kind === "zzp" && !toonBedrijfOverzicht && (
          <>
            {bedrijfsnaamVeld}
            <Field label={f.kvk}>
              <input value={kvkNumber} onChange={(e) => setKvkNumber(e.target.value)} placeholder="12345678" className="field-input" />
            </Field>
            <Field label={f.btw} hint={f.btwHintLive}>
              <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="NL123456789B01" className="field-input" />
            </Field>
          </>
        )}

        {kind === "flexwerker" && !toonBedrijfOverzicht && (
          <>
            {bedrijfsnaamVeld}
            <div className="rounded-lg border border-hair bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
              {f.flexUitleg1} <b>{f.korNaam}</b> {f.flexUitleg2}
            </div>
            <fieldset className="grid gap-2 text-sm">
              <legend className="sr-only">{f.korLegend}</legend>
              {(["heb", "aanvragen", "geen"] as const).map((k) => (
                <label key={k} className="flex items-start gap-2">
                  <input type="radio" name="kor" checked={korKeuze === k} onChange={() => setKorKeuze(k)} className="mt-1" />
                  {k === "heb" ? tk.keuzeHeb : k === "aanvragen" ? tk.keuzeAanvragen : tk.keuzeGeen}
                </label>
              ))}
            </fieldset>
            {korKeuze === "heb" && (
              <>
                <Field label={f.korSinds} hint={f.korSindsHint}>
                  <input
                    type="date"
                    value={korSinds}
                    onChange={(e) => setKorSinds(e.target.value)}
                    min={KOR_SINDS_VROEGST}
                    max={vandaag}
                    aria-invalid={korSindsFout}
                    className="field-input"
                  />
                </Field>
                {korSindsFout && <p role="alert" className="-mt-2 text-xs text-crit">{f.korSindsFout}</p>}
              </>
            )}
            {korKeuze === "aanvragen" && <KorHulp initial={initial.korAanvraag ?? null} />}
            {!kor && (
              <>
                <Field label={f.btw} hint={f.btwHintOptioneel}>
                  <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="NL123456789B01" className="field-input" />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={vatRequested} onChange={(e) => setVatRequested(e.target.checked)} />
                  {f.btwAangevraagd}
                </label>
              </>
            )}
            <Field label={f.kvk} hint={f.kvkHintFlex}>
              <input value={kvkNumber} onChange={(e) => setKvkNumber(e.target.value)} placeholder={f.optioneel} className="field-input" />
            </Field>
          </>
        )}

        {kind === "uitzendkracht" && (
          <>
            <div className="rounded-lg border border-hair bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
              {f.uitzendUitleg}
            </div>
            <Field
              label={f.bsn}
              hint={hasBsnOnFile ? vulIn(f.bsnOpBestand, { laatste4: initial.bsnLast4 ?? "" }) : f.bsnHint}
            >
              <input
                value={bsn}
                onChange={(e) => setBsn(e.target.value)}
                inputMode="numeric"
                placeholder={hasBsnOnFile ? f.bsnOngewijzigd : "123456782"}
                className="field-input"
              />
            </Field>
          </>
        )}

        {/* het rekeningnummer is hier optioneel: bevestigen kan later bij Verificatie, vóór je eerste betaalde klus */}
        {opgeslagenIban && !wijzigIban ? (
          // een bewaard IBAN gemaskeerd (alleen weergave); "Wijzig IBAN" toont een leeg veld, de route vraagt dan de code
          <div className="relative rounded-lg border border-hair bg-paper-soft p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-neutralx-500">{f.iban}</p>
                <p className="mt-0.5 font-semibold tracking-wide text-ink">
                  <span aria-hidden="true">{maskeerIban(opgeslagenIban)}</span>
                  <span className="sr-only">{vulIn(f.ibanEindigt, { laatste4: opgeslagenIban.slice(-4) })}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIban("");
                  setWijzigIban(true);
                }}
                className="btn-ghost text-sm"
              >
                {f.wijzigIban}
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutralx-500">{f.wijzigIbanUitleg}</p>
          </div>
        ) : (
          <>
            <Field label={`${f.iban} (${f.optioneel})`} hint={f.ibanHint}>
              <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL00 BANK 0000 0000 00" className="field-input" />
            </Field>
            {opgeslagenIban ? (
              <div className="-mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs leading-relaxed text-neutralx-500">{f.wijzigIbanUitleg}</p>
                <button
                  type="button"
                  onClick={() => {
                    setIban(opgeslagenIban);
                    setIbanCode("");
                    setCodeNodig(null);
                    setWijzigIban(false);
                  }}
                  className="btn-ghost text-sm"
                >
                  {f.annuleren}
                </button>
              </div>
            ) : (
              <p className="-mt-2 text-xs leading-relaxed text-neutralx-500">
                {f.ibanLater}{" "}
                <Link href="/dashboard/verificatie#bankrekening" className="font-semibold text-brand-700 underline">
                  {f.ibanLink}
                </Link>
              </p>
            )}
          </>
        )}
        {codeNodig && (
          <Field label={f.ibanCode}>
            <input
              value={ibanCode}
              onChange={(e) => setIbanCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={f.ibanCodePlaceholder}
              className="field-input"
            />
            <p role="alert" className="mt-1 text-xs text-neutralx-600">{codeNodig} {f.daarnaOpslaan}</p>
          </Field>
        )}
      </section>

      {!switching && missing.length > 0 && (
        <p className="text-xs text-neutralx-500">{vulIn(f.nogNodig, { lijst: missing.join(" · ") })}</p>
      )}

      <button type="button" onClick={submit} disabled={busy} className="btn-primary">
        {busy ? f.bezig : switching ? f.overstappen : f.opslaan}
      </button>

      {result && result.workerKind && (
        <section className="card p-6">
          <h2 className="font-display text-base font-semibold">{f.samenvatting}</h2>
          <dl className="mt-3 divide-y divide-hair text-sm">
            <Row k={f.werkvorm} v={f.kinds[result.workerKind].label} />
            {zakelijkeWerkvorm(result.workerKind) && result.bedrijfsnaam && <Row k={f.bedrijfsnaam} v={result.bedrijfsnaam} />}
            {result.vatNumber && (
              <Row
                k={f.btw}
                v={
                  <>
                    {result.vatNumber}{" "}
                    <span className={result.vatValid ? "pill-ok" : "pill-warn"}>
                      {result.vatValid ? f.gevalideerd : result.vatStatus ?? f.nietBevestigd}
                    </span>
                  </>
                }
              />
            )}
            {result.workerKind === "uitzendkracht" && result.bsnLast4 && (
              <Row k={f.bsn} v={vulIn(f.bsnVersleuteld, { laatste4: result.bsnLast4 })} />
            )}
            <Row k={f.facturatie} v={factuurTekst(f, result.resolvedInvoiceMode)} />
            <Row
              k={f.status}
              v={
                result.completedAt ? (
                  <span className="pill-ok">{f.compleet}</span>
                ) : mistSleutels.length === 0 ? (
                  // alles ingevuld behalve het rekeningnummer: dat volgt vóór de eerste betaalde klus
                  <span className="pill-ok">{f.statusIbanLater}</span>
                ) : (
                  <span className="pill-warn">{f.onvolledig}</span>
                )
              }
            />
          </dl>
        </section>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutralx-400">{hint}</span>}
    </label>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-neutralx-500">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
