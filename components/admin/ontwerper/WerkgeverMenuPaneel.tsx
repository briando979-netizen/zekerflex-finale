"use client";

import { useEffect, useState } from "react";
import type { MenuDeel, MenuVolgorde } from "@/lib/werkgever/menu-volgorde";
import { SleepGreep, useSleep } from "@/components/admin/ontwerper/Sleep";
import { verplaatsNaar } from "@/lib/ontwerp/sleep";

// ---------------------------------------------------------------------------
// Tabblad Menu, deel "Menu van de werkgevers-app": de volgorde van het menu dat werkgevers in hun dashboard personeel zien.
// Twee lijsten (het bovenste deel en het deel onder "Beheer"); verslepen binnen een lijst. Er verdwijnt niets.
// "Opslaan" zet de volgorde meteen live voor alle werkgevers; "Standaard" zet de oorspronkelijke terug.
// De regels staan in lib/werkgever/menu-volgorde.ts.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const mute = { color: "var(--a-mute)" };
const klein = "grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-xs disabled:opacity-30";
const knopStijl = { background: "var(--a-elev)", color: "var(--a-text)" };

type Namen = Record<string, { naam: string; wanneer?: string } | undefined>;
interface Stand {
  volgorde: MenuVolgorde;
  eigen: boolean;
  namen: Namen;
}
type Antwoord = Partial<Stand> & { error?: { message?: string } };

async function stuur(init?: RequestInit): Promise<Stand> {
  const r = await fetch("/api/admin/ontwerp/werkgever-menu", { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  const d = (await r.json().catch(() => null)) as Antwoord | null;
  if (!r.ok || !d?.volgorde) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return { volgorde: d.volgorde, eigen: Boolean(d.eigen), namen: d.namen ?? {} };
}

const DELEN: { id: MenuDeel; kop: string; uitleg: string }[] = [
  { id: "hoofd", kop: "Bovenste deel", uitleg: "Staat direct onder Jouw start." },
  { id: "beheer", kop: "Onder Beheer", uitleg: "Het deel van het menu met de kop Beheer." },
];

// Eén lijst van het menu. Een eigen component (niet binnen het paneel gedefinieerd), met zijn eigen sleephulp.
function Lijst({ kop, uitleg, rijen, namen, onWijzig }: { kop: string; uitleg: string; rijen: string[]; namen: Namen; onWijzig: (nieuw: string[]) => void }) {
  const sleep = useSleep((van, naar) => onWijzig(verplaatsNaar(rijen, van, naar)));
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold" style={{ color: "var(--a-text)" }}>
        {kop}{" "}
        <span className="font-normal" style={mute}>
          {uitleg}
        </span>
      </p>
      <ol className="space-y-1.5" aria-label={`${kop}, van boven naar beneden`} {...sleep.lijst}>
        {rijen.map((id, i) => {
          const n = namen[id];
          const naam = n?.naam ?? id;
          return (
            <li key={id} data-sleep-rij="" className="flex items-center gap-2 rounded-xl px-3 py-2" style={paneel}>
              <SleepGreep naam={naam} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold" style={{ color: "var(--a-text)" }}>
                  {naam}
                </span>
                {n?.wanneer ? (
                  <span className="block text-[11px]" style={mute}>
                    {n.wanneer}
                  </span>
                ) : null}
              </span>
              <button type="button" onClick={() => onWijzig(verplaatsNaar(rijen, i, i - 1))} disabled={i === 0} aria-label={`${naam} omhoog`} className={klein} style={knopStijl}>
                ↑
              </button>
              <button type="button" onClick={() => onWijzig(verplaatsNaar(rijen, i, i + 1))} disabled={i === rijen.length - 1} aria-label={`${naam} omlaag`} className={klein} style={knopStijl}>
                ↓
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const gelijk = (a: MenuVolgorde, b: MenuVolgorde) => JSON.stringify([a.hoofd, a.beheer]) === JSON.stringify([b.hoofd, b.beheer]);

export function WerkgeverMenuPaneel() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [volgorde, setVolgorde] = useState<MenuVolgorde | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  function neemOver(s: Stand) {
    setStand(s);
    setVolgorde(s.volgorde);
  }

  useEffect(() => {
    stuur()
      .then(neemOver)
      .catch((e: Error) => setMelding({ tekst: e.message, fout: true }));
  }, []);

  async function doe(init: RequestInit, klaar: string) {
    setBezig(true);
    setMelding(null);
    try {
      neemOver(await stuur(init));
      setMelding({ tekst: klaar });
    } catch (e) {
      setMelding({ tekst: (e as Error).message, fout: true });
    } finally {
      setBezig(false);
    }
  }

  const gewijzigd = Boolean(stand && volgorde && !gelijk(volgorde, stand.volgorde));

  return (
    <section className="mt-4 space-y-3 rounded-xl p-3" style={paneel} aria-labelledby="werkgever-menu-kop">
      <h3 id="werkgever-menu-kop" className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
        Menu van de werkgevers-app
      </h3>
      <p className="text-[11px]" style={mute}>
        Sleep een onderdeel naar een andere plek (pak het bij ⠿). Dit is het menu dat werkgevers zien in hun dashboard personeel; de volgorde geldt voor alle werkgevers. Er verdwijnt niets: een bedrijf ziet nog steeds alleen de onderdelen die bij hem horen. In het voorbeeld hiernaast zie je dit niet; kijk in de werkgevers-app.
      </p>
      {stand && volgorde ? (
        <>
          {DELEN.map((d) => (
            <Lijst
              key={d.id}
              kop={d.kop}
              uitleg={d.uitleg}
              rijen={volgorde[d.id]}
              namen={stand.namen}
              onWijzig={(nieuw) => {
                setVolgorde({ ...volgorde, [d.id]: nieuw } as MenuVolgorde);
                setMelding(null);
              }}
            />
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void doe({ method: "PUT", body: JSON.stringify(volgorde) }, "Opgeslagen. Werkgevers zien het menu nu in deze volgorde.")} disabled={bezig || !gewijzigd} className="a-button a-button-primary text-xs disabled:opacity-50">
              {bezig ? "Bezig…" : "Opslaan (meteen live)"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Het werkgeversmenu terugzetten naar de standaardvolgorde?")) void doe({ method: "DELETE" }, "Het werkgeversmenu heeft weer de standaardvolgorde.");
              }}
              disabled={bezig || !stand.eigen}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={knopStijl}
            >
              Standaard
            </button>
            {gewijzigd ? (
              <span className="text-[11px]" style={mute}>
                Nog niet opgeslagen
              </span>
            ) : null}
          </div>
        </>
      ) : melding ? null : (
        <p className="text-[11px]" style={mute}>
          Laden…
        </p>
      )}
      {melding ? (
        <p role={melding.fout ? "alert" : "status"} className="text-xs font-semibold" style={{ color: melding.fout ? "var(--a-crit)" : "var(--a-ok-ink)" }}>
          {melding.tekst}
        </p>
      ) : null}
    </section>
  );
}
