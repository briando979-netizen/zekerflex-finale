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
import { bedrijfAlIngevuld, formulierMist, ibanVoorOpslag, toonWerkvormKeuze } from "@/lib/fiscal/formulier";

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
}

export function FiscalForm({ initial, defaultKind, profiel }: { initial: FiscalProfile; defaultKind: WorkerKind | null; profiel?: ProfielBedrijf | undefined }) {
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
  const [bsn, setBsn] = useState("");
  const [lhk, setLhk] = useState(initial.loonheffingskorting);
  const [iban, setIban] = useState(initial.iban ?? "");
  const [ibanCode, setIbanCode] = useState("");
  const [codeNodig, setCodeNodig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // de werkvorm en het bedrijfsdeel staan als samenvatting zolang ze al ingevuld zijn; "wijzigen" toont de invoer
  const [wijzigKind, setWijzigKind] = useState(false);
  const [wijzigBedrijf, setWijzigBedrijf] = useState(false);
  const [result, setResult] = useState<(FiscalProfile & { resolvedInvoiceMode: string }) | null>(
    initial.workerKind ? { ...initial, resolvedInvoiceMode: "reverse-billing" } : null,
  );

  async function submit() {
    setBusy(true);
    try {
      // het IBAN alleen als er iets staat: het is hier optioneel (bevestigen kan later bij Verificatie)
      const body: Record<string, unknown> = { workerKind: kind, ...ibanVoorOpslag(iban), korApplies: kor, vatRequested, loonheffingskorting: lhk };
      if (vatNumber.trim()) body.vatNumber = vatNumber.trim();
      if (kvkNumber.trim()) body.kvkNumber = kvkNumber.trim();
      if (kind === "uitzendkracht" && bsn.trim()) body.bsn = bsn.trim();
      if (ibanCode.trim()) body.ibanCode = ibanCode.trim();

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
        toast.success(
          f.opgeslagen,
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
  };
  const toonKeuze = toonWerkvormKeuze(savedKind, wijzigKind);
  const toonBedrijfOverzicht = !wijzigBedrijf && !switching && bedrijfAlIngevuld(kind, opgeslagenBedrijf);

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
        <h2 className="font-display text-lg font-semibold">{f.stap2}</h2>

        {toonBedrijfOverzicht && (
          <div className="rounded-lg border border-hair bg-paper-soft p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-ink">{f.alIngevuld}</p>
              <button type="button" onClick={() => setWijzigBedrijf(true)} className="btn-ghost text-sm">
                {f.wijzigen}
              </button>
            </div>
            <dl className="mt-2 divide-y divide-hair">
              {opgeslagenBedrijf.kvk && <Row k={f.kvk} v={opgeslagenBedrijf.kvk} />}
              {opgeslagenBedrijf.btw && <Row k={f.btw} v={opgeslagenBedrijf.btw} />}
              {kind === "flexwerker" && opgeslagenBedrijf.kor && <Row k={f.korNaam} v={f.ja} />}
            </dl>
          </div>
        )}

        {kind === "zzp" && !toonBedrijfOverzicht && (
          <>
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lhk} onChange={(e) => setLhk(e.target.checked)} />
              {f.lhk}
            </label>
          </>
        )}

        {/* het rekeningnummer is hier optioneel: bevestigen kan later bij Verificatie, vóór je eerste betaalde klus */}
        <Field label={`${f.iban} (${f.optioneel})`} hint={f.ibanHint}>
          <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL00 BANK 0000 0000 00" className="field-input" />
        </Field>
        <p className="-mt-2 text-xs leading-relaxed text-neutralx-500">
          {f.ibanLater}{" "}
          <Link href="/dashboard/verificatie#bankrekening" className="font-semibold text-brand-700 underline">
            {f.ibanLink}
          </Link>
        </p>
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
