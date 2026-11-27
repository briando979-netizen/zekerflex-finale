"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PartnerModel } from "@/lib/sales-partners/model";
import { vulIn, type FormulierTeksten } from "@/lib/sales-partners/teksten";

/**
 * Partnerdashboard → "Nieuw bedrijf registreren" (POST /api/partner/bedrijven, lib/sales-partners). Het model (A of B) is
 * verplicht. De knop blijft altijd aan: ontbreekt er iets, dan zegt de melding welk veld (role="alert"). Na het opslaan
 * vernieuwt de pagina, zodat de tabel de lijst van de server toont. De teksten (Nederlands of Engels) komen van de pagina.
 */
const VELDEN = [
  { naam: "bedrijfsnaam", type: "text", verplicht: true, autoComplete: "organization" },
  { naam: "kvk", type: "text", verplicht: false, autoComplete: "off" },
  { naam: "contactnaam", type: "text", verplicht: true, autoComplete: "name" },
  { naam: "email", type: "email", verplicht: true, autoComplete: "email" },
  { naam: "telefoon", type: "tel", verplicht: true, autoComplete: "tel" },
] as const;

type VeldNaam = (typeof VELDEN)[number]["naam"];
const LEEG: Record<VeldNaam, string> = { bedrijfsnaam: "", kvk: "", contactnaam: "", email: "", telefoon: "" };

export function BedrijfRegistreren({ texts }: { texts: FormulierTeksten }) {
  const router = useRouter();
  const [waarden, setWaarden] = useState<Record<VeldNaam, string>>(LEEG);
  const [model, setModel] = useState<PartnerModel | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gelukt, setGelukt] = useState<string | null>(null);
  const label = (naam: VeldNaam) => texts.velden[naam];

  async function verstuur(e: FormEvent) {
    e.preventDefault();
    setGelukt(null);
    const mist: string[] = VELDEN.filter((v) => v.verplicht && waarden[v.naam].trim() === "").map((v) => label(v.naam).toLowerCase());
    if (!model) mist.push(texts.hetModel);
    if (mist.length) {
      setFout(vulIn(texts.vulNogIn, { velden: mist.join(", ") }));
      return;
    }
    setBezig(true);
    setFout(null);
    const r = await fetch("/api/partner/bedrijven", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...waarden, model }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } } } | null;
    if (r?.ok) {
      setGelukt(vulIn(texts.geregistreerd, { naam: waarden.bedrijfsnaam.trim() }));
      setWaarden(LEEG);
      setModel(null);
      router.refresh();
    } else if (r?.status === 409) {
      setFout(texts.dubbel);
    } else {
      const velden = Object.keys(d?.error?.details?.fieldErrors ?? {})
        .map((k) => VELDEN.find((v) => v.naam === k))
        .filter((v) => v !== undefined)
        .map((v) => label(v.naam).toLowerCase());
      setFout(velden.length ? vulIn(texts.controleer, { velden: velden.join(", ") }) : (d?.error?.message ?? texts.mislukt));
    }
    setBezig(false);
  }

  return (
    <form onSubmit={(e) => void verstuur(e)} noValidate className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {VELDEN.map((v) => (
          <div key={v.naam}>
            <label htmlFor={`bedrijf-${v.naam}`} className="block text-xs font-semibold text-neutralx-600">
              {label(v.naam)}
            </label>
            <input
              id={`bedrijf-${v.naam}`}
              name={v.naam}
              type={v.type}
              autoComplete={v.autoComplete}
              inputMode={v.naam === "kvk" ? "numeric" : undefined}
              required={v.verplicht}
              value={waarden[v.naam]}
              onChange={(e) => setWaarden((w) => ({ ...w, [v.naam]: e.target.value }))}
              className="mt-1 min-h-11 w-full rounded-lg border border-hairstrong bg-white px-3 text-sm text-ink"
            />
          </div>
        ))}
      </div>
      <fieldset>
        <legend className="text-xs font-semibold text-neutralx-600">{texts.modelLegend}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["A", "B"] as const).map((m) => (
            <label
              key={m}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${model === m ? "border-brand-500 bg-brand-500/5" : "border-hairstrong"}`}
            >
              <input type="radio" name="model" value={m} checked={model === m} onChange={() => setModel(m)} className="mt-1" />
              <span className="text-ink">{texts.modelLabel[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {fout && (
        <p role="alert" className="text-sm font-medium text-crit">
          {fout}
        </p>
      )}
      {gelukt && (
        <p role="status" className="text-sm font-medium text-brand-700">
          {gelukt}
        </p>
      )}
      <button type="submit" disabled={bezig} className="min-h-11 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white hover:bg-brand-600">
        {bezig ? texts.bezig : texts.knop}
      </button>
    </form>
  );
}
