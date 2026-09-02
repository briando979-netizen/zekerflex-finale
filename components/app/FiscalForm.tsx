"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { FiscalProfile, WorkerKind } from "@/lib/fiscal/store";

const KINDS: { k: WorkerKind; label: string; blurb: string }[] = [
  { k: "zzp", label: "ZZP'er", blurb: "Eigen onderneming met KVK-inschrijving en btw-nummer. Facturatie via reverse billing." },
  { k: "flexwerker", label: "Flexwerker", blurb: "Flexibel zelfstandig, vaak met kleineondernemersregeling. Btw optioneel." },
  { k: "uitzendkracht", label: "Uitzendkracht", blurb: "Geen eigen onderneming. Verloning loopt via de payroll (loonheffing, BSN)." },
];

const INVOICE_LABEL: Record<string, string> = {
  "reverse-billing": "Reverse billing — ZekerFlex maakt de factuur namens jou op.",
  "self-invoice": "Zelf-facturatie zonder btw — via de kleineondernemersregeling.",
  payroll: "Verloning via payroll — je krijgt een loonstrook, geen factuur.",
};

export function FiscalForm({ initial, defaultKind }: { initial: FiscalProfile; defaultKind: WorkerKind | null }) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<WorkerKind>(initial.workerKind ?? defaultKind ?? "flexwerker");
  const [vatNumber, setVatNumber] = useState(initial.vatNumber ?? "");
  const [vatRequested, setVatRequested] = useState(initial.vatRequested);
  const [kvkNumber, setKvkNumber] = useState(initial.kvkNumber ?? "");
  const [kor, setKor] = useState(initial.korApplies);
  const [bsn, setBsn] = useState("");
  const [lhk, setLhk] = useState(initial.loonheffingskorting);
  const [iban, setIban] = useState(initial.iban ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<(FiscalProfile & { resolvedInvoiceMode: string }) | null>(
    initial.workerKind ? { ...initial, resolvedInvoiceMode: "reverse-billing" } : null,
  );

  async function submit() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { workerKind: kind, iban, korApplies: kor, vatRequested, loonheffingskorting: lhk };
      if (vatNumber.trim()) body.vatNumber = vatNumber.trim();
      if (kvkNumber.trim()) body.kvkNumber = kvkNumber.trim();
      if (kind === "uitzendkracht" && bsn.trim()) body.bsn = bsn.trim();

      const res = await fetch("/api/me/fiscal", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error?.message ?? "Opslaan mislukt");
      } else {
        setResult(data);
        toast.success(
          "Fiscale gegevens opgeslagen",
          data.vatNumber ? (data.vatValid ? "Btw-nummer gevalideerd." : "Btw-nummer opgeslagen (nog niet bevestigd).") : undefined,
        );
        router.refresh();
      }
    } catch {
      toast.error("Opslaan mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold">1 · Wat is jouw werkvorm?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {KINDS.map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setKind(o.k)}
              className={`rounded-xl border p-4 text-left transition ${
                kind === o.k ? "border-brand-500 bg-brand-50" : "border-hairstrong hover:border-brand-500"
              }`}
            >
              <p className="font-semibold text-ink">{o.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutralx-600">{o.blurb}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">2 · Fiscale gegevens</h2>

        {kind === "zzp" && (
          <>
            <Field label="KVK-nummer">
              <input value={kvkNumber} onChange={(e) => setKvkNumber(e.target.value)} placeholder="12345678" className="field-input" />
            </Field>
            <Field label="Btw-nummer" hint="Wordt live gevalideerd (VIES).">
              <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="NL123456789B01" className="field-input" />
            </Field>
          </>
        )}

        {kind === "flexwerker" && (
          <>
            <div className="rounded-lg border border-hair bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
              Als flexwerker kun je met of zonder btw-nummer werken. Verdien je onder de € 20.000 per jaar, dan kun je de{" "}
              <b>kleineondernemersregeling (KOR)</b> gebruiken en factureer je zonder btw. Een btw-nummer vraag je gratis aan
              bij de Belastingdienst (aangifte omzetbelasting) — meestal binnen 5 werkdagen.
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={kor} onChange={(e) => setKor(e.target.checked)} />
              Ik gebruik de kleineondernemersregeling (factureren zonder btw)
            </label>
            {!kor && (
              <>
                <Field label="Btw-nummer" hint="Optioneel — wordt gevalideerd als je het invult.">
                  <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="NL123456789B01" className="field-input" />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={vatRequested} onChange={(e) => setVatRequested(e.target.checked)} />
                  Ik heb een btw-nummer aangevraagd bij de Belastingdienst
                </label>
              </>
            )}
            <Field label="KVK-nummer" hint="Optioneel voor flexwerkers.">
              <input value={kvkNumber} onChange={(e) => setKvkNumber(e.target.value)} placeholder="optioneel" className="field-input" />
            </Field>
          </>
        )}

        {kind === "uitzendkracht" && (
          <>
            <div className="rounded-lg border border-hair bg-paper-soft p-3 text-xs leading-relaxed text-neutralx-600">
              Je hebt geen btw-nummer nodig. Je uren worden verloond via de payroll: je krijgt een loonstrook, er wordt
              loonheffing ingehouden en je bouwt vakantiegeld op. Je BSN wordt alleen versleuteld opgeslagen.
            </div>
            <Field label="BSN" hint="9 cijfers — wordt gehasht opgeslagen, nooit als leesbaar nummer.">
              <input value={bsn} onChange={(e) => setBsn(e.target.value)} inputMode="numeric" placeholder="123456782" className="field-input" />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={lhk} onChange={(e) => setLhk(e.target.checked)} />
              Pas de loonheffingskorting toe (meestal aan bij je hoofdinkomen)
            </label>
          </>
        )}

        <Field label="IBAN voor uitbetaling / verloning">
          <input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL00 BANK 0000 0000 00" className="field-input" />
        </Field>
      </section>

      <button type="button" onClick={submit} disabled={busy} className="btn-primary">
        {busy ? "Opslaan & valideren…" : "Opslaan"}
      </button>

      {result && result.workerKind && (
        <section className="card p-6">
          <h2 className="font-display text-base font-semibold">Samenvatting</h2>
          <dl className="mt-3 divide-y divide-hair text-sm">
            <Row k="Werkvorm" v={KINDS.find((x) => x.k === result.workerKind)?.label ?? result.workerKind} />
            {result.vatNumber && (
              <Row
                k="Btw-nummer"
                v={
                  <>
                    {result.vatNumber}{" "}
                    <span className={result.vatValid ? "pill-ok" : "pill-warn"}>
                      {result.vatValid ? "gevalideerd" : result.vatStatus ?? "niet bevestigd"}
                    </span>
                  </>
                }
              />
            )}
            {result.workerKind === "uitzendkracht" && result.bsnLast4 && (
              <Row k="BSN" v={`•••••${result.bsnLast4} (versleuteld opgeslagen)`} />
            )}
            <Row k="Facturatie / verloning" v={INVOICE_LABEL[result.resolvedInvoiceMode] ?? result.resolvedInvoiceMode} />
            <Row k="Status" v={result.completedAt ? <span className="pill-ok">Compleet</span> : <span className="pill-warn">Onvolledig</span>} />
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
