"use client";

import { useEffect, useState } from "react";
import { useStudio } from "@/components/studio/context";
import { EuroInvoer, OpslaanBalk, Veld, veldProps } from "@/components/studio/WinkelVelden";
import { Card, Empty, IPercent, IPlus, PageHead, Pill, btn, input } from "@/components/studio/ui";
import type { Kortingscode } from "@/lib/sites/types";
import {
  kortingNaarConcept,
  kortingSamenvatting,
  leesKortingConcepten,
  nieuwKortingConcept,
  willekeurigeCode,
  type KortingConcept,
  type KortingVeld,
} from "@/lib/sites/studio-concepten";
import { kortingStand, nieuwKortingId, type KortingStand } from "@/lib/sites/winkel-korting";

// ---------------------------------------------------------------------------
// Webshop → Kortingen: kortingscodes die klanten bij het afrekenen invullen.
// Een percentage of een vast bedrag, met een minimum, een laatste dag en een
// maximum aantal keer. Per code staat hoe vaak hij gebruikt is (de server telt
// bij elke geplaatste bestelling, lib/sites/korting-gebruik.ts). Opslaan zet
// het meteen live; alleen de codes gaan mee (PATCH …/sites/winkel).
// ---------------------------------------------------------------------------

const STAND: Record<KortingStand, { label: string; tone: "ok" | "neutral" | "attn" }> = {
  actief: { label: "Actief", tone: "ok" },
  uit: { label: "Uit", tone: "neutral" },
  verlopen: { label: "Verlopen", tone: "neutral" },
  op: { label: "Op", tone: "attn" },
};

export default function Kortingen() {
  const { winkel, saveWinkelDeel } = useStudio();
  const opgeslagenCodes = winkel.kortingscodes ?? [];
  const [basis, setBasis] = useState<KortingConcept[]>(() => opgeslagenCodes.map(kortingNaarConcept));
  const [lijst, setLijst] = useState<KortingConcept[]>(basis);
  const [open, setOpen] = useState<string | null>(null);
  const [fouten, setFouten] = useState<Record<string, Partial<Record<KortingVeld, string>>>>({});
  const [balkFout, setBalkFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [gebruik, setGebruik] = useState<Record<string, number> | null>(null);

  const gewijzigd = JSON.stringify(lijst) !== JSON.stringify(basis);
  const opgeslagen = new Map(opgeslagenCodes.map((k) => [k.id, k]));

  // hoe vaak elke code gebruikt is
  useEffect(() => {
    void fetch("/api/werkgever/sites/kortingen", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { gebruik: Record<string, number> } | null) => setGebruik(d?.gebruik ?? null))
      .catch(() => undefined);
  }, []);

  // niet per ongeluk weg met onopgeslagen wijzigingen
  useEffect(() => {
    if (!gewijzigd) return;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [gewijzigd]);

  const zet = (id: string, patch: Partial<KortingConcept>) => {
    setLijst((l) => l.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setMelding(null);
  };

  const voegToe = () => {
    const c = nieuwKortingConcept(nieuwKortingId());
    setLijst((l) => [c, ...l]);
    setOpen(c.id);
    setMelding(null);
  };

  const opslaan = async () => {
    const r = leesKortingConcepten(lijst);
    const eerste = Object.keys(r.fouten)[0];
    if (eerste) {
      setFouten(r.fouten);
      setOpen(eerste);
      return setBalkFout("Niet alles klopt nog: kijk bij de rode velden.");
    }
    setBezig(true);
    const fout = await saveWinkelDeel({ kortingscodes: r.codes });
    setBezig(false);
    if (fout) return setBalkFout(fout);
    const nieuw = r.codes.map(kortingNaarConcept);
    setBasis(nieuw);
    setLijst(nieuw);
    setFouten({});
    setBalkFout(null);
    setOpen(null);
    setMelding("Opgeslagen. De codes werken meteen in je webshop.");
  };

  const verwerp = () => {
    setLijst(basis);
    setFouten({});
    setBalkFout(null);
    setOpen(null);
  };

  return (
    <>
      <OpslaanBalk gewijzigd={gewijzigd} fout={balkFout} bezig={bezig} onOpslaan={() => void opslaan()} onVerwerp={verwerp} />
      <PageHead
        title="Kortingen"
        sub={melding ? <span role="status" className="font-medium text-[#0c5132]">{melding}</span> : "Kortingscodes die klanten bij het afrekenen invullen. De webshop controleert en rekent elke code zelf."}
        actions={
          lijst.length > 0 ? (
            <button type="button" onClick={voegToe} className={btn.primary}>
              <IPlus /> Kortingscode
            </button>
          ) : undefined
        }
      />

      <Card pad={false}>
        {lijst.length === 0 ? (
          <Empty icon={<IPercent />} title="Nog geen kortingscodes" text="Maak een code voor een actie, je nieuwsbrief of een vaste klant. Klanten vullen hem in bij het afrekenen en zien meteen wat ze besparen.">
            <button type="button" onClick={voegToe} className={btn.primary}>
              Eerste code maken
            </button>
          </Empty>
        ) : (
          <ul className="divide-y divide-[#f1f1f1]">
            {lijst.map((c) => (
              <KortingRij
                key={c.id}
                c={c}
                bewaard={opgeslagen.get(c.id) ?? null}
                gebruikt={gebruik ? (gebruik[c.id] ?? 0) : null}
                open={open === c.id}
                fouten={fouten[c.id] ?? {}}
                onOpen={() => setOpen((o) => (o === c.id ? null : c.id))}
                onZet={(patch) => zet(c.id, patch)}
                onWeg={() => {
                  setLijst((l) => l.filter((x) => x.id !== c.id));
                  setOpen(null);
                }}
              />
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-3 text-xs text-[#707070]">
        Een korting geldt voor de producten, niet voor de verzendkosten, en is nooit meer dan wat de producten kosten. Het veld voor een kortingscode staat alleen bij het afrekenen als er minstens één code aan staat.
      </p>
    </>
  );
}

function KortingRij({
  c,
  bewaard,
  gebruikt,
  open,
  fouten,
  onOpen,
  onZet,
  onWeg,
}: {
  c: KortingConcept;
  bewaard: Kortingscode | null;
  gebruikt: number | null;
  open: boolean;
  fouten: Partial<Record<KortingVeld, string>>;
  onOpen: () => void;
  onZet: (patch: Partial<KortingConcept>) => void;
  onWeg: () => void;
}) {
  const stand = bewaard ? STAND[kortingStand(bewaard, new Date(), gebruikt ?? 0)] : null;
  const heeftFout = Object.keys(fouten).length > 0;
  const id = (veld: string) => `korting-${c.id}-${veld}`;
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-sm font-bold text-[#1a1a1a]">{c.code.trim() ? c.code.toUpperCase() : "Nieuwe code"}</span>
            {stand ? <Pill tone={stand.tone}>{stand.label}</Pill> : <Pill tone="info">Nog niet opgeslagen</Pill>}
            {heeftFout && <Pill tone="crit">Controleer</Pill>}
          </p>
          <p className="mt-0.5 text-sm text-[#616161]">{kortingSamenvatting(c)}</p>
          {bewaard && gebruikt !== null && (
            <p className="text-xs text-[#707070]">
              {gebruikt === 1 ? "1 keer gebruikt" : `${gebruikt} keer gebruikt`}
              {bewaard.maxGebruik !== null ? ` van de ${bewaard.maxGebruik}` : ""}
            </p>
          )}
        </div>
        <button type="button" onClick={onOpen} aria-expanded={open} aria-controls={id("velden")} className={btn.secondary}>
          {open ? "Klaar" : "Wijzigen"}
          <span className="sr-only"> {c.code || "nieuwe code"}</span>
        </button>
      </div>

      {open && (
        <div id={id("velden")} className="border-t border-[#f1f1f1] bg-[#fafafa] px-4 py-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Veld id={id("code")} label="Code" uitleg="Hoofdletters of kleine letters maakt voor de klant niet uit." fout={fouten.code}>
              <div className="flex flex-wrap gap-2">
                <input
                  {...veldProps(id("code"), fouten.code)}
                  className={`${input} min-w-[9rem] flex-1 font-mono uppercase`}
                  value={c.code}
                  maxLength={20}
                  placeholder="ZOMER10"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(e) => onZet({ code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                />
                <button type="button" onClick={() => onZet({ code: willekeurigeCode() })} className={`${btn.secondary} flex-shrink-0`}>
                  Bedenk er een
                </button>
              </div>
            </Veld>
            <Veld id={id("soort")} label="Soort korting">
              <select id={id("soort")} className={input} value={c.soort} onChange={(e) => onZet({ soort: e.target.value === "bedrag" ? "bedrag" : "procent", waarde: "" })}>
                <option value="procent">Percentage van de producten</option>
                <option value="bedrag">Vast bedrag</option>
              </select>
            </Veld>
            <Veld id={id("waarde")} label={c.soort === "procent" ? "Percentage" : "Bedrag van de korting"} fout={fouten.waarde}>
              {c.soort === "procent" ? (
                <span className="relative block">
                  <input {...veldProps(id("waarde"), fouten.waarde, false)} className={`${input} pr-8`} inputMode="numeric" value={c.waarde} placeholder="10" onChange={(e) => onZet({ waarde: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })} />
                  <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#707070]">
                    %
                  </span>
                </span>
              ) : (
                <EuroInvoer id={id("waarde")} waarde={c.waarde} onWaarde={(waarde) => onZet({ waarde })} placeholder="5,00" fout={fouten.waarde} uitleg={false} />
              )}
            </Veld>
            <Veld id={id("minimum")} label="Vanaf een bedrag aan producten (mag leeg)" fout={fouten.minimum}>
              <EuroInvoer id={id("minimum")} waarde={c.minimum} onWaarde={(minimum) => onZet({ minimum })} placeholder="leeg = altijd" fout={fouten.minimum} uitleg={false} />
            </Veld>
            <Veld id={id("tot")} label="Laatste dag (mag leeg)" uitleg="De code werkt tot en met deze dag, Nederlandse tijd." fout={fouten.totEnMet}>
              <input {...veldProps(id("tot"), fouten.totEnMet)} type="date" className={input} value={c.totEnMet} onChange={(e) => onZet({ totEnMet: e.target.value })} />
            </Veld>
            <Veld id={id("max")} label="Hoe vaak in totaal te gebruiken (mag leeg)" uitleg="Leeg is onbeperkt. Elke geplaatste bestelling met de code telt één keer." fout={fouten.max}>
              <input {...veldProps(id("max"), fouten.max)} className={input} inputMode="numeric" value={c.max} placeholder="onbeperkt" onChange={(e) => onZet({ max: e.target.value.replace(/[^\d]/g, "").slice(0, 7) })} />
            </Veld>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-[#303030]">
              <input type="checkbox" checked={c.actief} onChange={(e) => onZet({ actief: e.target.checked })} className="h-4 w-4 accent-[#1a1a1a]" />
              Code staat aan
            </label>
            <button type="button" onClick={onWeg} className={btn.danger}>
              Code verwijderen
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
