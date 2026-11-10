"use client";

import Link from "next/link";
import { useState } from "react";
import { useStudio, type WinkelDeel } from "@/components/studio/context";
import { Domein } from "@/components/studio/Domein";
import { Card, IExternal, PageHead, btn, input } from "@/components/studio/ui";
import type { Company, Winkel } from "@/lib/sites/types";
import { BETAAL_NAAM, betaalOpties } from "@/lib/sites/winkel-betalen";
import { actieveVerzendmethoden } from "@/lib/sites/winkel-verzending";
import { DomeinZoeker } from "@/components/domeinen/DomeinZoeker";
import { NietInIphone } from "@/components/app/NietInIphone";

// ---------------------------------------------------------------------------
// Websitestudio → Instellingen: of online bestellen aan staat (meteen live; verzending en betalen hebben een eigen pagina),
// de bedrijfsgegevens op de website (na Publiceren) en het webadres.
// ---------------------------------------------------------------------------

export default function Instellingen() {
  const { data, winkel, saveWinkelDeel, saveSite, soort, reload } = useStudio();
  const site = data!.site!;
  const shop = soort === "webshop";
  return (
    <>
      <PageHead title="Instellingen" sub={shop ? "Online bestellen, je bedrijfsgegevens en je webadres." : "Je bedrijfsgegevens en je webadres."} />
      <div className="space-y-4">
        {shop && <WinkelInstellingen winkel={winkel} onSave={saveWinkelDeel} />}
        <Bedrijf bedrijf={site.bedrijf} onSave={(bedrijf) => saveSite({ bedrijf })} soort={soort} />
        <Card title="Webadres">
          <p className="text-sm text-[#303030]">
            Je {shop ? "webshop" : "website"} staat op{" "}
            {data?.address ? (
              <a href={data.address} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-[#005bd3] hover:underline">
                {data.address.replace(/^https?:\/\//, "")} <IExternal width={14} height={14} />
              </a>
            ) : (
              "een ZekerFlex-adres"
            )}
            .
          </p>
          <div className="mt-4 border-t border-[#f1f1f1] pt-4">
            <h3 className="mb-2 text-sm font-semibold text-[#1a1a1a]">Eigen domeinnaam</h3>
            <Domein onChange={() => void reload()} />
          </div>
          {!shop && (
            <NietInIphone>
            <details className="mt-4 rounded-xl border border-[#ebebeb] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[#1a1a1a]">Nog geen domeinnaam? Zoek en bestel er één</summary>
              <div className="mt-3">
                <DomeinZoeker terugNaar="/studio/website/instellingen" smal />
              </div>
            </details>
            </NietInIphone>
          )}
        </Card>
      </div>
    </>
  );
}

function Melding({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return <p role={m.ok ? "status" : "alert"} className={`text-sm font-medium ${m.ok ? "text-[#0c5132]" : "text-[#b42318]"}`}>{m.text}</p>;
}

function WinkelInstellingen({ winkel, onSave }: { winkel: Winkel; onSave: (deel: WinkelDeel) => Promise<string | null> }) {
  const [bestellen, setBestellen] = useState(winkel.bestellen);
  const [bezig, setBezig] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  const methoden = actieveVerzendmethoden(winkel);
  const betaal = betaalOpties(winkel);
  const opslaan = async () => {
    if (bestellen && !methoden.length) return setM({ ok: false, text: "Zet eerst bij Verzending minstens één manier van afhalen of bezorgen aan." });
    setBezig(true);
    // alleen dit ene veld: de producten en hun voorraad blijven zoals ze op de server staan
    const fout = await onSave({ bestellen });
    setBezig(false);
    setM(fout ? { ok: false, text: fout } : { ok: true, text: "Opgeslagen en meteen online." });
  };
  return (
    <Card title="Bestellen" actions={<span className="text-xs text-[#707070]">meteen online</span>}>
      <div className="space-y-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={bestellen} onChange={(e) => setBestellen(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1a1a1a]" />
          <span>
            <span className="block text-sm font-semibold text-[#1a1a1a]">Klanten kunnen online bestellen</span>
            <span className="block text-sm text-[#616161]">Op elke productpagina staat een bestelknop; je krijgt elke bestelling per mail en in Bestellingen.</span>
          </span>
        </label>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-[#ebebeb] p-3">
            <dt className="font-semibold text-[#1a1a1a]">Verzending</dt>
            <dd className="mt-0.5 text-[#616161]">{methoden.length ? methoden.map((x) => x.naam).join(", ") : "Nog niets aan"}</dd>
            <dd className="mt-1">
              <Link href="/studio/webshop/verzending" className="font-semibold text-[#005bd3] hover:underline">Verzending instellen</Link>
            </dd>
          </div>
          <div className="rounded-xl border border-[#ebebeb] p-3">
            <dt className="font-semibold text-[#1a1a1a]">Betalen</dt>
            <dd className="mt-0.5 text-[#616161]">{betaal.length ? betaal.map((x) => BETAAL_NAAM[x]).join(", ") : "Alleen je uitleg bij betalen"}</dd>
            <dd className="mt-1">
              <Link href="/studio/webshop/betalen" className="font-semibold text-[#005bd3] hover:underline">Betalen en btw instellen</Link>
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={bezig || bestellen === winkel.bestellen} onClick={() => void opslaan()} className={btn.primary}>{bezig ? "Opslaan…" : "Opslaan"}</button>
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

function Bedrijf({ bedrijf, onSave, soort }: { bedrijf: Company; onSave: (c: Company) => Promise<string | null>; soort: "website" | "webshop" }) {
  const [c, setC] = useState<Company>(bedrijf);
  const [bezig, setBezig] = useState(false);
  const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  const opslaan = async () => {
    setBezig(true);
    const fout = await onSave(c);
    setBezig(false);
    setM(fout ? { ok: false, text: fout } : { ok: true, text: `Opgeslagen. Klik bovenaan op Publiceren om het op je ${soort === "webshop" ? "webshop" : "website"} te zetten.` });
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
