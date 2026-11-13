"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { API, foutVan, useStudio } from "@/components/studio/context";
import { Card, btn, input } from "@/components/studio/ui";
import { IdeeKaart } from "@/components/studio/IdeeKaart";
import type { Company } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Webshop openen, stap voor stap: kies een startpunt, controleer je
// bedrijfsgegevens en maak de webshop aan (POST /api/werkgever/sites?soort=webshop).
// Daarna staan de eerste pagina's en de wettelijke teksten klaar. Vanuit Studio →
// Ontwerpen (`?ontwerp=<id>`) staat dat ontwerp al gekozen.
// ---------------------------------------------------------------------------

const VELDEN: { key: keyof Company; label: string; type?: string; max: number; breed?: boolean; hint?: string }[] = [
  { key: "naam", label: "Bedrijfsnaam", max: 100 },
  { key: "kvk", label: "KVK-nummer (8 cijfers)", max: 8, hint: "Staat onderaan elke pagina, zoals de wet vraagt." },
  { key: "straat", label: "Straat en huisnummer", max: 120 },
  { key: "postcode", label: "Postcode", max: 10 },
  { key: "plaats", label: "Plaats", max: 80 },
  { key: "telefoon", label: "Telefoon", type: "tel", max: 30 },
  { key: "email", label: "E-mail voor bestellingen en vragen van klanten", type: "email", max: 200, breed: true },
];

export default function WebshopStart() {
  const { data, reload, base } = useStudio();
  const templates = data?.templates ?? [];
  // gekozen in Ontwerpen: dan begint de webshop precies in de stijl van dat ontwerp
  const gekozen = useSearchParams()?.get("ontwerp") ?? null;
  const uitGalerij = gekozen !== null && templates.some((t) => t.id === gekozen) ? gekozen : null;
  const [templateId, setTemplateId] = useState(uitGalerij ?? templates[0]?.id ?? "algemeen");
  const [bedrijf, setBedrijf] = useState<Company>(data?.defaults ?? { naam: "", kvk: "", straat: "", postcode: "", plaats: "", telefoon: "", email: "" });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const maak = async () => {
    setBezig(true);
    setFout(null);
    const res = await fetch(`${API}?soort=webshop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId, bedrijf, ...(templateId === uitGalerij ? { ontwerp: true } : {}) }) }).catch(() => null);
    if (!res?.ok) {
      setBezig(false);
      return setFout(await foutVan(res, "Maken lukte niet. Probeer het opnieuw."));
    }
    await reload();
    setBezig(false);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-[#1a1a1a] px-6 py-10 text-white sm:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Webshop openen</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight">Je eigen webwinkel, met alles erin</h1>
        <p className="mt-3 max-w-xl text-white/75">Producten, bestellingen, klanten, kortingen en verzending in één plek. Kies hieronder een startpunt; je kunt alles daarna aanpassen.</p>
      </section>

      {/* vertel je idee: kiest het startpunt en vult naam en plaats in, alleen waar nog niets stond */}
      <IdeeKaart soort="webshop" templates={templates} onKeuze={(u) => { setTemplateId(u.templateId); setBedrijf((b) => ({ ...b, naam: b.naam.trim() ? b.naam : u.naam, plaats: b.plaats.trim() ? b.plaats : u.plaats })); }} />

      <Card title="1. Kies een startpunt" actions={<Link href={`${base}/ontwerpen`} className="text-sm font-semibold text-[#005bd3] hover:underline">Bekijk alle ontwerpen met voorbeeld</Link>}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTemplateId(t.id)}
                aria-pressed={templateId === t.id}
                className={`h-full w-full rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a1a] ${templateId === t.id ? "border-[#1a1a1a] ring-2 ring-black/10" : "border-[#d4d4d4] hover:border-[#8a8a8a]"}`}
              >
                <span className="flex gap-1.5" aria-hidden>
                  <span className="h-5 w-10 rounded-full" style={{ background: t.theme.kleur }} />
                  <span className="h-5 w-5 rounded-full" style={{ background: t.theme.accent }} />
                </span>
                <span className="mt-3 block text-sm font-semibold text-[#1a1a1a]">{t.naam}</span>
                <span className="mt-0.5 block text-sm text-[#616161]">{t.omschrijving}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="2. Controleer je bedrijfsgegevens">
        <p className="mb-4 text-sm text-[#616161]">Al ingevuld met wat we van je weten. Een webwinkel moet deze gegevens tonen; ze komen in de voettekst en op de pagina&apos;s over verzenden en voorwaarden.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {VELDEN.map((v) => (
            <div key={v.key} className={v.breed ? "sm:col-span-2" : ""}>
              <label htmlFor={`ws-${v.key}`} className="mb-1 block text-sm font-medium text-[#303030]">{v.label}</label>
              <input id={`ws-${v.key}`} className={input} type={v.type ?? "text"} maxLength={v.max} value={String(bedrijf[v.key] ?? "")} onChange={(e) => setBedrijf({ ...bedrijf, [v.key]: e.target.value })} />
              {v.hint && <p className="mt-1 text-xs text-[#707070]">{v.hint}</p>}
            </div>
          ))}
        </div>
        {fout && <p role="alert" className="mt-4 rounded-xl bg-[#fed1d7] px-4 py-2.5 text-sm text-[#8e0b21]">{fout}</p>}
        <div className="mt-5 flex justify-end">
          <button type="button" disabled={bezig || !bedrijf.naam.trim()} onClick={() => void maak()} className={btn.primary}>
            {bezig ? "Bezig…" : "Open mijn webshop"}
          </button>
        </div>
      </Card>
    </div>
  );
}
