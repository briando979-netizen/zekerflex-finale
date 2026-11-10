"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useStudio } from "@/components/studio/context";
import { EuroInvoer, OpslaanBalk, Veld, veldProps } from "@/components/studio/WinkelVelden";
import { Card, IPin, IPlus, ITruck, PageHead, Pill, btn, input } from "@/components/studio/ui";
import type { VerzendGebied } from "@/lib/sites/types";
import { leesVerzendConcepten, nieuwVerzendConcept, verzendNaarConcept, verzendSamenvatting, type VerzendConcept, type VerzendVeld } from "@/lib/sites/studio-concepten";
import { GEBIED_TEKST, leveringVan, nieuwVerzendId, verzendmethodenVan } from "@/lib/sites/winkel-verzending";

// ---------------------------------------------------------------------------
// Webshop → Verzending: hoe klanten hun bestelling krijgen. Afhaalpunten (met
// adres, standaard dat van het bedrijf) en bezorgmethoden (tarief, gratis vanaf
// een bedrag, alleen Nederland of ook de EU of daarbuiten, levertijd). Een
// winkel van vóór 10 nov 2026 begint met zijn afhalen en bezorgen van toen.
// Opslaan zet het meteen live (PATCH …/sites/winkel), met `levering` mee voor
// de onderdelen die alleen dat lezen (lib/sites/winkel-verzending.ts leveringVan).
// ---------------------------------------------------------------------------

const GEBIEDEN: VerzendGebied[] = ["nl", "eu", "overal"];

export default function Verzending() {
  const { winkel, saveWinkelDeel, data } = useStudio();
  const b = data?.site?.bedrijf;
  const bedrijfAdres = b ? [b.straat.trim(), `${b.postcode.trim()} ${b.plaats.trim()}`.trim()].filter(Boolean).join(", ") : "";
  const [basis, setBasis] = useState<VerzendConcept[]>(() => verzendmethodenVan(winkel).map(verzendNaarConcept));
  const [lijst, setLijst] = useState<VerzendConcept[]>(basis);
  const [open, setOpen] = useState<string | null>(null);
  const [fouten, setFouten] = useState<Record<string, Partial<Record<VerzendVeld, string>>>>({});
  const [balkFout, setBalkFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const gewijzigd = JSON.stringify(lijst) !== JSON.stringify(basis);
  const afhalen = lijst.filter((m) => m.soort === "afhalen");
  const bezorgen = lijst.filter((m) => m.soort === "bezorgen");
  const geenAan = !lijst.some((m) => m.actief);

  useEffect(() => {
    if (!gewijzigd) return;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [gewijzigd]);

  const zet = (id: string, patch: Partial<VerzendConcept>) => {
    setLijst((l) => l.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    setMelding(null);
  };
  const voegToe = (soort: VerzendConcept["soort"]) => {
    const m = nieuwVerzendConcept(nieuwVerzendId(), soort);
    setLijst((l) => [...l, m]);
    setOpen(m.id);
    setMelding(null);
  };

  const opslaan = async () => {
    const r = leesVerzendConcepten(lijst);
    const eerste = Object.keys(r.fouten)[0];
    if (eerste) {
      setFouten(r.fouten);
      setOpen(eerste);
      return setBalkFout("Niet alles klopt nog: kijk bij de rode velden.");
    }
    if (winkel.bestellen && !r.methoden.some((m) => m.actief)) {
      return setBalkFout("Zet minstens één manier van afhalen of bezorgen aan, of zet online bestellen uit bij Instellingen.");
    }
    setBezig(true);
    const fout = await saveWinkelDeel({ verzendmethoden: r.methoden, levering: leveringVan(r.methoden) });
    setBezig(false);
    if (fout) return setBalkFout(fout);
    const nieuw = r.methoden.map(verzendNaarConcept);
    setBasis(nieuw);
    setLijst(nieuw);
    setFouten({});
    setBalkFout(null);
    setOpen(null);
    setMelding("Opgeslagen. Klanten zien dit meteen bij het afrekenen.");
  };
  const verwerp = () => {
    setLijst(basis);
    setFouten({});
    setBalkFout(null);
    setOpen(null);
  };

  const rij = (m: VerzendConcept) => (
    <MethodeRij
      key={m.id}
      m={m}
      bedrijfAdres={bedrijfAdres}
      open={open === m.id}
      fouten={fouten[m.id] ?? {}}
      onOpen={() => setOpen((o) => (o === m.id ? null : m.id))}
      onZet={(patch) => zet(m.id, patch)}
      onWeg={() => {
        setLijst((l) => l.filter((x) => x.id !== m.id));
        setOpen(null);
      }}
    />
  );

  return (
    <>
      <OpslaanBalk gewijzigd={gewijzigd} fout={balkFout} bezig={bezig} onOpslaan={() => void opslaan()} onVerwerp={verwerp} />
      <PageHead
        title="Verzending"
        sub={melding ? <span role="status" className="font-medium text-[#0c5132]">{melding}</span> : "Hoe klanten hun bestelling krijgen. Bedragen zijn zoals je webshop rekent: met of zonder btw, zie Betalen."}
      />

      {geenAan && winkel.bestellen && (
        <p role="alert" className="mb-4 rounded-xl border border-[#f1c4c4] bg-[#fff5f5] px-4 py-3 text-sm text-[#8e0b21]">
          Er staat nu geen enkele manier van afhalen of bezorgen aan. Zet er een aan, anders kunnen klanten niet bestellen.
        </p>
      )}

      <div className="space-y-4">
        <Card
          title="Bezorgen"
          actions={
            <button type="button" onClick={() => voegToe("bezorgen")} className={btn.quiet}>
              <IPlus width={16} height={16} /> Bezorgmethode
            </button>
          }
        >
          {bezorgen.length === 0 ? (
            <Leeg icon={<ITruck />} tekst="Je bezorgt nog niet. Voeg een bezorgmethode toe, bijvoorbeeld PostNL of je eigen bezorger, met een tarief en eventueel gratis vanaf een bedrag." />
          ) : (
            <ul className="-mx-5 -mb-5 divide-y divide-[#f1f1f1] border-t border-[#f1f1f1]">{bezorgen.map(rij)}</ul>
          )}
        </Card>

        <Card
          title="Afhalen"
          actions={
            <button type="button" onClick={() => voegToe("afhalen")} className={btn.quiet}>
              <IPlus width={16} height={16} /> Afhaalpunt
            </button>
          }
        >
          {afhalen.length === 0 ? (
            <Leeg icon={<IPin />} tekst="Klanten kunnen nu niet afhalen. Voeg een afhaalpunt toe; zonder eigen adres geldt het adres van je bedrijf." />
          ) : (
            <ul className="-mx-5 -mb-5 divide-y divide-[#f1f1f1] border-t border-[#f1f1f1]">{afhalen.map(rij)}</ul>
          )}
        </Card>
      </div>
      <p className="mt-3 text-xs text-[#707070]">
        Klanten kiezen bij het afrekenen uit wat hier aan staat. Gratis vanaf telt het bedrag aan producten na korting. Online bestellen zet je aan of uit bij{" "}
        <Link href="/studio/webshop/instellingen" className="font-semibold text-[#005bd3] hover:underline">
          Instellingen
        </Link>
        .
      </p>
    </>
  );
}

function Leeg({ icon, tekst }: { icon: ReactNode; tekst: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-[#616161]">
      <span className="mt-0.5 text-[#707070]">{icon}</span>
      <p>{tekst}</p>
    </div>
  );
}

function MethodeRij({
  m,
  bedrijfAdres,
  open,
  fouten,
  onOpen,
  onZet,
  onWeg,
}: {
  m: VerzendConcept;
  bedrijfAdres: string;
  open: boolean;
  fouten: Partial<Record<VerzendVeld, string>>;
  onOpen: () => void;
  onZet: (patch: Partial<VerzendConcept>) => void;
  onWeg: () => void;
}) {
  const id = (veld: string) => `verzend-${m.id}-${veld}`;
  const heeftFout = Object.keys(fouten).length > 0;
  const bezorg = m.soort === "bezorgen";
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="break-words font-semibold text-[#1a1a1a]">{m.naam.trim() || (bezorg ? "Nieuwe bezorgmethode" : "Nieuw afhaalpunt")}</span>
            {m.actief ? <Pill tone="ok">Aan</Pill> : <Pill>Uit</Pill>}
            {heeftFout && <Pill tone="crit">Controleer</Pill>}
          </p>
          <p className="mt-0.5 break-words text-sm text-[#616161]">{verzendSamenvatting(m, bedrijfAdres)}</p>
        </div>
        <button type="button" onClick={onOpen} aria-expanded={open} aria-controls={id("velden")} className={btn.secondary}>
          {open ? "Klaar" : "Wijzigen"}
          <span className="sr-only"> {m.naam || (bezorg ? "bezorgmethode" : "afhaalpunt")}</span>
        </button>
      </div>
      {open && (
        <div id={id("velden")} className="border-t border-[#f1f1f1] bg-[#fafafa] px-4 py-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Veld id={id("naam")} label="Naam die de klant ziet" fout={fouten.naam} className="sm:col-span-2">
              <input {...veldProps(id("naam"), fouten.naam, Boolean(fouten.naam))} className={input} value={m.naam} maxLength={60} placeholder={bezorg ? "PostNL pakket" : "Afhalen in de winkel"} onChange={(e) => onZet({ naam: e.target.value })} />
            </Veld>
            <Veld id={id("prijs")} label="Prijs" uitleg="Leeg is gratis." fout={fouten.prijs}>
              <EuroInvoer id={id("prijs")} waarde={m.prijs} onWaarde={(prijs) => onZet({ prijs })} placeholder="0,00" fout={fouten.prijs} />
            </Veld>
            <Veld id={id("gratis")} label="Gratis vanaf (mag leeg)" uitleg="Het bedrag aan producten, na korting." fout={fouten.gratisVanaf}>
              <EuroInvoer id={id("gratis")} waarde={m.gratisVanaf} onWaarde={(gratisVanaf) => onZet({ gratisVanaf })} placeholder="nooit gratis" fout={fouten.gratisVanaf} />
            </Veld>
            {bezorg ? (
              <Veld id={id("gebied")} label="Waar bezorg je?">
                <select id={id("gebied")} className={input} value={m.gebied} onChange={(e) => onZet({ gebied: GEBIEDEN.find((g) => g === e.target.value) ?? "nl" })}>
                  {GEBIEDEN.map((g) => (
                    <option key={g} value={g}>
                      {GEBIED_TEKST[g]}
                    </option>
                  ))}
                </select>
              </Veld>
            ) : (
              <Veld id={id("adres")} label="Afhaaladres (mag leeg)" uitleg={bedrijfAdres ? `Leeg is het adres van je bedrijf: ${bedrijfAdres}.` : "Leeg is het adres van je bedrijf (vul het in bij Instellingen)."}>
                <input {...veldProps(id("adres"), undefined)} className={input} value={m.adres} maxLength={200} placeholder={bedrijfAdres || "Straat 1, 1234 AB Plaats"} onChange={(e) => onZet({ adres: e.target.value })} />
              </Veld>
            )}
            <Veld id={id("levertijd")} label={bezorg ? "Levertijd (mag leeg)" : "Wanneer klaar (mag leeg)"} uitleg="Staat bij het afrekenen onder de naam.">
              <input {...veldProps(id("levertijd"), undefined)} className={input} value={m.levertijd} maxLength={60} placeholder={bezorg ? "1 tot 2 werkdagen" : "Morgen vanaf 10:00 klaar"} onChange={(e) => onZet({ levertijd: e.target.value })} />
            </Veld>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-[#303030]">
              <input type="checkbox" checked={m.actief} onChange={(e) => onZet({ actief: e.target.checked })} className="h-4 w-4 accent-[#1a1a1a]" />
              {bezorg ? "Klanten kunnen dit kiezen" : "Klanten kunnen hier afhalen"}
            </label>
            <button type="button" onClick={onWeg} className={btn.danger}>
              {bezorg ? "Bezorgmethode verwijderen" : "Afhaalpunt verwijderen"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
