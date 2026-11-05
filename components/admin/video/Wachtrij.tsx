"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Formaat } from "@/lib/video/model";
import { haalUitWachtrij, haalWachtrij, zetInWachtrij, type WachtTaak } from "@/components/admin/video/api";

// "Op de achtergrond maken": opdrachten klaarzetten die de server zelf afwerkt,
// ook als deze pagina dicht is. Klaar → bij Media (of als project) + een push.

interface Props {
  formaat: Formaat;
  onKlaar: () => Promise<void>;
  onMelding: (tekst: string, soort?: "ok" | "fout") => void;
}

const SOORTEN: { id: WachtTaak["soort"]; label: string; uitleg: string }[] = [
  { id: "clip", label: "Videoclips", uitleg: "gratis AI-video (LTX-2.3), 3 tot 10 seconden per regel" },
  { id: "foto", label: "Foto's", uitleg: "AI-foto per regel (zodra er een beeld-AI met tegoed is)" },
  { id: "video", label: "Hele video's", uitleg: "scenario, beelden, stem, ondertiteling en een bewegend openingsshot; komt als project klaar" },
];

const tijd = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", hour: "2-digit", minute: "2-digit" });

function statusTekst(t: WachtTaak): { tekst: string; kleur: string } {
  switch (t.status) {
    case "wacht":
      return { tekst: t.volgendePoging ? `Opnieuw om ${tijd(t.volgendePoging)}` : "Wacht", kleur: "var(--a-plan)" };
    case "bezig":
      return { tekst: "Bezig…", kleur: "var(--a-plan)" };
    case "klaar":
      return { tekst: "Klaar", kleur: "var(--a-ok-ink)" };
    case "tegoed":
      return { tekst: t.volgendePoging ? `Tegoed op, opnieuw om ${tijd(t.volgendePoging)}` : "Wacht op tegoed", kleur: "var(--a-warn-ink)" };
    default:
      return { tekst: "Mislukt", kleur: "var(--a-crit)" };
  }
}

export function Wachtrij({ formaat, onKlaar, onMelding }: Props) {
  const [soort, setSoort] = useState<WachtTaak["soort"]>("clip");
  const [regels, setRegels] = useState("");
  const [duur, setDuur] = useState(5);
  const [taken, setTaken] = useState<WachtTaak[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const vorige = useRef<WachtTaak[] | null>(null);

  const vernieuw = useCallback(async () => {
    try {
      const nieuw = await haalWachtrij();
      // Iets net klaar? Dan ook de bestanden verversen.
      const oud = vorige.current;
      if (oud && nieuw.some((t) => t.status === "klaar" && oud.find((o) => o.id === t.id)?.status !== "klaar")) void onKlaar();
      vorige.current = nieuw;
      setTaken(nieuw);
    } catch {
      /* volgende keer opnieuw */
    }
  }, [onKlaar]);

  useEffect(() => {
    void vernieuw();
    const iv = window.setInterval(() => void vernieuw(), 15_000);
    return () => window.clearInterval(iv);
  }, [vernieuw]);

  const lijst = regels
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r.length >= 3)
    .slice(0, 20);

  async function zet() {
    setBezig(true);
    try {
      const nieuw = await zetInWachtrij(lijst.map((omschrijving) => ({ soort, omschrijving, formaat, duur: soort === "video" ? Math.max(15, duur) : Math.min(10, duur) })));
      setRegels("");
      onMelding(`${nieuw.length} ${nieuw.length === 1 ? "opdracht staat" : "opdrachten staan"} in de wachtrij. Je mag de pagina sluiten; je krijgt een melding als iets klaar is.`);
      await vernieuw();
    } catch (err) {
      onMelding((err as Error).message, "fout");
    } finally {
      setBezig(false);
    }
  }

  const open = (taken ?? []).filter((t) => t.status !== "klaar" && t.status !== "fout").length;

  return (
    <section className="space-y-2 rounded-lg p-2.5" style={{ border: "1px solid var(--a-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.75rem] font-semibold" style={{ color: "var(--a-text)" }}>Op de achtergrond maken</p>
        {open > 0 && <span className="text-[0.625rem] font-medium" style={{ color: "var(--a-plan)" }}>{open} open</span>}
      </div>
      <p className="text-[0.6875rem]" style={{ color: "var(--a-dim)" }}>
        Zet een rij opdrachten klaar, één per regel. De server werkt ze zelf af, ook als je deze pagina sluit. Is het gratis tegoed op, dan probeert hij het later vanzelf opnieuw.
      </p>
      <div className="grid grid-cols-3 gap-0.5 rounded-md p-0.5" role="group" aria-label="Wat maken" style={{ background: "var(--a-elev)" }}>
        {SOORTEN.map((s) => (
          <button key={s.id} type="button" onClick={() => setSoort(s.id)} aria-pressed={soort === s.id} title={s.uitleg} className="rounded px-1 py-1 text-[0.6875rem] font-medium" style={soort === s.id ? { background: "var(--a-panel)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}>
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        className="a-input text-[0.8125rem]"
        rows={3}
        value={regels}
        onChange={(e) => setRegels(e.target.value)}
        aria-label="Opdrachten, één per regel"
        placeholder={soort === "video" ? "Vacature bediening in Rotterdam\nZekerFlex voor schoonmaakbedrijven" : soort === "foto" ? "Een monteur laadt 's ochtends zijn bus in\nEen kok die lachend een bord uitserveert" : "Drone-shot over een distributiecentrum bij zonsopkomst\nEen barista maakt latte art in een druk café"}
      />
      <div className="flex items-center gap-1.5">
        {soort !== "foto" && (
          <select className="a-input text-xs" value={duur} onChange={(e) => setDuur(Number(e.target.value))} aria-label="Lengte">
            {(soort === "video" ? [15, 20, 30, 45, 60] : [3, 5, 8, 10]).map((d) => (
              <option key={d} value={d}>{d} seconden</option>
            ))}
          </select>
        )}
        <button type="button" className="a-button a-button-primary flex-1 text-xs" disabled={bezig || lijst.length === 0} onClick={() => void zet()}>
          {lijst.length > 1 ? `Zet ${lijst.length} in de wachtrij` : "Zet in de wachtrij"}
        </button>
      </div>

      {taken && taken.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Wachtrij">
          {taken.map((t) => {
            const st = statusTekst(t);
            return (
              <li key={t.id} className="rounded-md px-2 py-1.5 text-[0.6875rem]" style={{ background: "var(--a-elev)" }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate" style={{ color: "var(--a-text)" }} title={t.omschrijving}>
                    {t.soort === "clip" ? "🎬" : t.soort === "foto" ? "🖼️" : "✨"} {t.omschrijving}
                  </span>
                  <span className="flex-shrink-0 font-medium" style={{ color: st.kleur }}>{st.tekst}</span>
                </div>
                {t.melding && t.status !== "klaar" && <p className="mt-0.5" style={{ color: "var(--a-mute)" }}>{t.melding}</p>}
                <div className="mt-1 flex gap-1.5">
                  {t.status === "klaar" && t.resultaat?.soort === "project" && (
                    <a className="a-button text-[0.625rem]" href={`/admin/video?project=${encodeURIComponent(t.resultaat.id)}`}>Open video</a>
                  )}
                  {t.status === "klaar" && t.resultaat?.soort === "bestand" && <span style={{ color: "var(--a-ok-ink)" }}>Staat bij Media</span>}
                  {(t.status === "wacht" || t.status === "tegoed" || t.status === "fout") && (
                    <button
                      type="button"
                      className="a-button text-[0.625rem]"
                      onClick={async () => {
                        try {
                          await haalUitWachtrij(t.id);
                          await vernieuw();
                        } catch (err) {
                          onMelding((err as Error).message, "fout");
                        }
                      }}
                    >
                      Weghalen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
