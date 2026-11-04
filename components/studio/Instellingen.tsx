"use client";

import Link from "next/link";
import { useState } from "react";
import { useStudio } from "@/components/studio/context";
import { Card, IExternal, PageHead, btn, input } from "@/components/studio/ui";
import type { Company, Winkel } from "@/lib/sites/types";
import { leesBedrag } from "@/lib/sites/winkel";
import { DomeinZoeker } from "@/components/domeinen/DomeinZoeker";

// ---------------------------------------------------------------------------
// Websitestudio → Instellingen: hoe bestellen en bezorgen werkt (meteen live),
// de bedrijfsgegevens op de website (na Publiceren) en het webadres.
// ---------------------------------------------------------------------------

const bedrag = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export default function Instellingen() {
  const { data, winkel, saveWinkel, saveSite } = useStudio();
  const site = data!.site!;
  return (
    <>
      <PageHead title="Instellingen" sub="Bestellen, bezorgen en je bedrijfsgegevens." />
      <div className="space-y-4">
        <WinkelInstellingen winkel={winkel} onSave={saveWinkel} />
        <Bedrijf bedrijf={site.bedrijf} onSave={(bedrijf) => saveSite({ bedrijf })} />
        <Card title="Webadres">
          <p className="text-sm text-[#303030]">
            Je website staat op{" "}
            {data?.address ? (
              <a href={data.address} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-[#005bd3] hover:underline">
                {data.address.replace(/^https?:\/\//, "")} <IExternal width={14} height={14} />
              </a>
            ) : (
              "een ZekerFlex-adres"
            )}
            .
          </p>
          <p className="mt-2 text-sm text-[#616161]">Een eigen domeinnaam (zoals jouwwinkel.nl) koppel je in de paginabouwer onder Domein. Wij regelen het beveiligde slotje.</p>
          <Link href="/studio/website" className={`${btn.secondary} mt-3`}>Naar de paginabouwer</Link>
          <details className="mt-4 rounded-xl border border-[#ebebeb] p-3">
            <summary className="cursor-pointer text-sm font-semibold text-[#1a1a1a]">Nog geen domeinnaam? Zoek en bestel er één</summary>
            <div className="mt-3">
              <DomeinZoeker terugNaar="/studio/instellingen" smal />
            </div>
          </details>
        </Card>
      </div>
    </>
  );
}

function Melding({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return <p role={m.ok ? "status" : "alert"} className={`text-sm font-medium ${m.ok ? "text-[#0c5132]" : "text-[#b42318]"}`}>{m.text}</p>;
}

function WinkelInstellingen({ winkel, onSave }: { winkel: Winkel; onSave: (w: Winkel) => Promise<string | null> }) {
  const [w, setW] = useState(winkel);
  const [kosten, setKosten] = useState(bedrag(winkel.levering.bezorgkostenCents));
  const [gratis, setGratis] = useState(bedrag(winkel.levering.gratisVanafCents));
  const [bezig, setBezig] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  const opslaan = async () => {
    const k = kosten.trim() ? leesBedrag(kosten) : 0;
    const g = gratis.trim() ? leesBedrag(gratis) : null;
    if (k == null || (gratis.trim() && g == null)) return setM({ ok: false, text: "Vul geldige bedragen in, bijvoorbeeld 3,95." });
    if (w.bestellen && !w.levering.afhalen && !w.levering.bezorgen) return setM({ ok: false, text: "Kies afhalen, bezorgen of allebei." });
    setBezig(true);
    const fout = await onSave({ ...w, levering: { ...w.levering, bezorgkostenCents: k, gratisVanafCents: g } });
    setBezig(false);
    setM(fout ? { ok: false, text: fout } : { ok: true, text: "Opgeslagen en meteen online." });
  };
  return (
    <Card title="Bestellen en bezorgen" actions={<span className="text-xs text-[#707070]">meteen online</span>}>
      <div className="space-y-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={w.bestellen} onChange={(e) => setW({ ...w, bestellen: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#1a1a1a]" />
          <span>
            <span className="block text-sm font-semibold text-[#1a1a1a]">Klanten kunnen online bestellen</span>
            <span className="block text-sm text-[#616161]">Op elke productpagina staat een bestelknop; je krijgt elke bestelling per mail en in Bestellingen.</span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-xl border border-[#ebebeb] p-3">
            <input type="checkbox" checked={w.levering.afhalen} onChange={(e) => setW({ ...w, levering: { ...w.levering, afhalen: e.target.checked } })} className="h-4 w-4 accent-[#1a1a1a]" />
            <span className="text-sm font-semibold text-[#1a1a1a]">Afhalen</span>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-[#ebebeb] p-3">
            <input type="checkbox" checked={w.levering.bezorgen} onChange={(e) => setW({ ...w, levering: { ...w.levering, bezorgen: e.target.checked } })} className="h-4 w-4 accent-[#1a1a1a]" />
            <span className="text-sm font-semibold text-[#1a1a1a]">Bezorgen</span>
          </label>
        </div>
        {w.levering.bezorgen && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#303030]">Bezorgkosten</span>
              <input className={input} inputMode="decimal" value={kosten} placeholder="0,00 = gratis" onChange={(e) => setKosten(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[#303030]">Gratis bezorgen vanaf</span>
              <input className={input} inputMode="decimal" value={gratis} placeholder="leeg = nooit gratis" onChange={(e) => setGratis(e.target.value)} />
            </label>
          </div>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-[#303030]">Hoe betalen klanten?</span>
          <textarea className={`${input} min-h-[80px]`} maxLength={600} value={w.betaalTekst} onChange={(e) => setW({ ...w, betaalTekst: e.target.value })} />
          <span className="mt-1 block text-xs text-[#707070]">Dit staat bij elke bestelling. Online betalen met iDEAL komt eraan; tot dan regel je het zelf (bij afhalen, bezorgen of op factuur).</span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={bezig} onClick={() => void opslaan()} className={btn.primary}>{bezig ? "Opslaan…" : "Opslaan"}</button>
          <Melding m={m} />
        </div>
      </div>
    </Card>
  );
}

const VELDEN: { key: keyof Company; label: string; type?: string; max: number; hint?: string }[] = [
  { key: "naam", label: "Bedrijfsnaam", max: 100 },
  { key: "email", label: "E-mail voor bestellingen en berichten", type: "email", max: 200, hint: "Hier komen bestellingen en berichten van bezoekers binnen." },
  { key: "telefoon", label: "Telefoon", type: "tel", max: 30 },
  { key: "whatsapp", label: "WhatsApp (mobiel nummer, mag leeg)", type: "tel", max: 30 },
  { key: "straat", label: "Straat en huisnummer", max: 120 },
  { key: "postcode", label: "Postcode", max: 10 },
  { key: "plaats", label: "Plaats", max: 80 },
  { key: "kvk", label: "KVK-nummer (8 cijfers)", max: 8 },
];

function Bedrijf({ bedrijf, onSave }: { bedrijf: Company; onSave: (c: Company) => Promise<string | null> }) {
  const [c, setC] = useState<Company>(bedrijf);
  const [bezig, setBezig] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  const opslaan = async () => {
    setBezig(true);
    const fout = await onSave(c);
    setBezig(false);
    setM(fout ? { ok: false, text: fout } : { ok: true, text: "Opgeslagen. Klik bovenaan op Publiceren om het op je website te zetten." });
  };
  return (
    <Card title="Bedrijfsgegevens" actions={<span className="text-xs text-[#707070]">na Publiceren</span>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {VELDEN.map((v) => (
          <label key={v.key} className={`block ${v.key === "email" ? "sm:col-span-2" : ""}`}>
            <span className="mb-1 block text-sm font-medium text-[#303030]">{v.label}</span>
            <input className={input} type={v.type ?? "text"} maxLength={v.max} value={String(c[v.key] ?? "")} onChange={(e) => setC({ ...c, [v.key]: e.target.value })} />
            {v.hint && <span className="mt-1 block text-xs text-[#707070]">{v.hint}</span>}
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" disabled={bezig} onClick={() => void opslaan()} className={btn.primary}>{bezig ? "Opslaan…" : "Opslaan"}</button>
        <Melding m={m} />
      </div>
    </Card>
  );
}
