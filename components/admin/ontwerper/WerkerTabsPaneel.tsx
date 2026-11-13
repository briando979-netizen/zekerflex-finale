"use client";

import { useEffect, useState } from "react";
import { SleepGreep, useSleep } from "@/components/admin/ontwerper/Sleep";
import { verplaatsNaar } from "@/lib/ontwerp/sleep";

// ---------------------------------------------------------------------------
// Tabblad Menu, deel "Balk van de werker-app": de volgorde van de knoppen onderaan de app van de werker (Ontdekken, Mijn
// klussen, Uren, Chat, Account). Verslepen; er verdwijnt niets. "Opslaan" zet de volgorde meteen live voor alle werkers,
// "Standaard" zet de oorspronkelijke terug. De regels staan in lib/werker/tab-volgorde.ts.
// ---------------------------------------------------------------------------

const paneel = { background: "var(--a-panel)", border: "1px solid var(--a-border)" };
const mute = { color: "var(--a-mute)" };
const klein = "grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-xs disabled:opacity-30";
const knopStijl = { background: "var(--a-elev)", color: "var(--a-text)" };

type Namen = Record<string, { naam: string; wanneer?: string } | undefined>;
interface Stand {
  volgorde: string[];
  eigen: boolean;
  namen: Namen;
}
type Antwoord = Partial<Stand> & { error?: { message?: string } };

async function stuur(init?: RequestInit): Promise<Stand> {
  const r = await fetch("/api/admin/ontwerp/werker-tabs", { cache: "no-store", ...init, headers: { "Content-Type": "application/json" } });
  const d = (await r.json().catch(() => null)) as Antwoord | null;
  if (!r.ok || !d?.volgorde) throw new Error(d?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
  return { volgorde: d.volgorde, eigen: Boolean(d.eigen), namen: d.namen ?? {} };
}

export function WerkerTabsPaneel() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [volgorde, setVolgorde] = useState<string[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ tekst: string; fout?: boolean } | null>(null);

  function neemOver(s: Stand) {
    setStand(s);
    setVolgorde(s.volgorde);
  }

  function zet(nieuw: string[]) {
    setVolgorde(nieuw);
    setMelding(null);
  }

  useEffect(() => {
    stuur()
      .then(neemOver)
      .catch((e: Error) => setMelding({ tekst: e.message, fout: true }));
  }, []);

  // een hook hoort boven elke vroege return; zolang er niets geladen is valt er niets te verslepen
  const sleep = useSleep((van, naar) => {
    if (volgorde) zet(verplaatsNaar(volgorde, van, naar));
  });

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

  const gewijzigd = Boolean(stand && volgorde && JSON.stringify(volgorde) !== JSON.stringify(stand.volgorde));

  return (
    <section className="mt-4 space-y-3 rounded-xl p-3" style={paneel} aria-labelledby="werker-tabs-kop">
      <h3 id="werker-tabs-kop" className="text-xs font-semibold" style={{ color: "var(--a-text)" }}>
        Balk van de werker-app
      </h3>
      <p className="text-[11px]" style={mute}>
        Sleep een knop naar een andere plek (pak hem bij ⠿). Dit is de balk onderaan de app van de werker; bovenaan in deze lijst is links in de balk. De volgorde geldt voor alle werkers en er verdwijnt niets. In het voorbeeld hiernaast zie je dit niet; kijk in de werker-app.
      </p>
      {stand && volgorde ? (
        <>
          <ol className="space-y-1.5" aria-label="Knoppen van de balk, van links naar rechts" {...sleep.lijst}>
            {volgorde.map((id, i) => {
              const n = stand.namen[id];
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
                  <button type="button" onClick={() => zet(verplaatsNaar(volgorde, i, i - 1))} disabled={i === 0} aria-label={`${naam} naar links`} className={klein} style={knopStijl}>
                    ↑
                  </button>
                  <button type="button" onClick={() => zet(verplaatsNaar(volgorde, i, i + 1))} disabled={i === volgorde.length - 1} aria-label={`${naam} naar rechts`} className={klein} style={knopStijl}>
                    ↓
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void doe({ method: "PUT", body: JSON.stringify({ volgorde }) }, "Opgeslagen. Werkers zien de balk nu in deze volgorde.")} disabled={bezig || !gewijzigd} className="a-button a-button-primary text-xs disabled:opacity-50">
              {bezig ? "Bezig…" : "Opslaan (meteen live)"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("De balk van de werker-app terugzetten naar de standaardvolgorde?")) void doe({ method: "DELETE" }, "De balk van de werker-app heeft weer de standaardvolgorde.");
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
