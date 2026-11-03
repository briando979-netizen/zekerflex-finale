"use client";

import { useState, type ReactNode } from "react";
import type { AppWeergave, SpoorWeergave } from "@/lib/rijschool/app/weergave";
import { BevestigKnop, Kopieer, tijdstip, Waarde } from "@/components/rijschool/beheer/app/delen";

// De rechterkant van het tabblad App: "Testen en releasen" zoals in Play
// Console (interne test → gesloten test → productie), de testers, en het
// logboek. Alles werkt pas als ZekerFlex gekoppeld is (stap 4).

type Antwoord = AppWeergave & { verstuurd?: number; handmatigVersturen?: boolean };
type Actie = (naam: string, body: Record<string, unknown>, gelukt: (d: Antwoord) => string | null) => Promise<void>;

const STAND_STIJL: Record<SpoorWeergave["stand"], string> = {
  leeg: "pill-neutral",
  concept: "pill-warn",
  actief: "pill-warn",
  uitrol: "pill-warn",
  gepauzeerd: "pill-crit",
  live: "pill-ok",
};

const ingediend = (d: Antwoord) =>
  d.handmatigVersturen ? "Klaargezet. Druk in Play Console nog op 'Ter beoordeling verzenden'." : "Ingediend. Google beoordeelt je app; de uitkomst krijg je per mail van Google.";

export function AppSporen({ w, bezig, actie, opnieuw }: { w: AppWeergave; bezig: string | null; actie: Actie; opnieuw: () => void }) {
  const a = w.app;
  const gekoppeld = !!a?.gekoppeld;
  const loopt = a?.taak.fase === "bouwt" || a?.taak.fase === "verwerkt";
  const [groep, setGroep] = useState(a?.testersGroep ?? "");
  const spoor = (s: SpoorWeergave["spoor"]) => a?.sporen.find((x) => x.spoor === s);

  return (
    <div className="space-y-3">
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink">Testen en releasen</h2>
          {gekoppeld && (
            <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" disabled={!!bezig} onClick={() => void actie("koppeling", { actie: "koppeling" }, () => null)}>
              {bezig === "koppeling" ? "Bijwerken…" : `Bijwerken${a?.gelezenOp ? ` (${tijdstip(a.gelezenOp)})` : ""}`}
            </button>
          )}
        </div>
        {!gekoppeld && <p className="text-sm text-neutralx-600">Zodra ZekerFlex gekoppeld is (stap 4) zie je hier je app zoals in Play Console, en dien je met één knop in.</p>}

        <Spoorkaart s={spoor("internal")} titel="Interne test" uitleg="Voor jou en je instructeurs. Geen beoordeling door Google: binnen een paar minuten te installeren.">
          <button
            type="button"
            className="btn-primary"
            disabled={!gekoppeld || loopt || !!bezig || !w.bouwerIngesteld}
            onClick={() => void actie("bouw", { actie: "bouw", naarInterneTest: true }, () => "De nieuwe versie wordt gebouwd en daarna in de interne test gezet.")}
          >
            {loopt ? "Bezig met bouwen…" : "Nieuwe versie naar interne test"}
          </button>
        </Spoorkaart>

        <Spoorkaart s={spoor("alpha")} titel="Gesloten test" uitleg="Voor je leerlingen. Nieuwe persoonlijke accounts moeten 14 dagen testen met minstens 12 testers voordat ze naar productie mogen.">
          <label className="block">
            <span className="field-label">Testersgroep (Google Group)</span>
            <span className="flex flex-wrap gap-2">
              <input className="field-input min-w-0 flex-1" placeholder="testers-rijschool@googlegroups.com" value={groep} onChange={(e) => setGroep(e.target.value)} />
              <button type="button" className="btn-ghost" disabled={!a || !!bezig || groep.trim() === (a?.testersGroep ?? "")} onClick={() => void actie("testers", { actie: "testers", groep }, () => "Testersgroep opgeslagen.")}>
                Opslaan
              </button>
            </span>
            <span className="mt-1 block text-xs text-neutralx-500">
              Maak een groep op{" "}
              <a href="https://groups.google.com/my-groups" target="_blank" rel="noopener" className="underline">
                groups.google.com
              </a>{" "}
              en zet &quot;Wie kan lid worden&quot; op &quot;Iedereen op internet&quot;. Leerlingen worden lid via de mail hieronder.
            </span>
          </label>
          {a && gekoppeld && <Waarde label="Testlink" waarde={a.testLink} />}
          <div className="flex flex-wrap gap-2">
            <BevestigKnop
              label="Indienen voor beoordeling"
              vraag="De nieuwste versie uit de interne test gaat naar de gesloten test. Google beoordeelt hem eerst (meestal een paar dagen)."
              bezig={!!bezig}
              uit={!gekoppeld || !spoor("internal")?.versie}
              onJa={() => void actie("indienen", { actie: "indienen", naar: "alpha" }, ingediend)}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={!gekoppeld || !!bezig || !spoor("alpha")?.versie}
              onClick={() => void actie("mailTesters", { actie: "mailTesters" }, (d) => `Testlink gemaild naar ${d.verstuurd ?? 0} mensen.`)}
            >
              Mail de testlink naar leerlingen en instructeurs
            </button>
          </div>
        </Spoorkaart>

        <Spoorkaart s={spoor("production")} titel="Productie" uitleg="Voor iedereen in de Play Store. Google beoordeelt de app eerst.">
          {a?.liveSinds ? (
            <div className="space-y-2">
              <Waarde label="Link naar je app" waarde={a.winkelLink} />
              <p className="text-xs text-neutralx-500">Op je website staat nu vanzelf een knop &quot;Download in Google Play&quot;.</p>
            </div>
          ) : null}
          <BevestigKnop
            label={a?.liveSinds ? "Nieuwe versie naar productie" : "Indienen voor beoordeling"}
            vraag="De nieuwste versie uit de gesloten test gaat naar productie. Na goedkeuring door Google staat hij voor iedereen in de Play Store."
            bezig={!!bezig}
            uit={!gekoppeld || !(spoor("alpha")?.versie || spoor("internal")?.versie)}
            onJa={() => void actie("indienen", { actie: "indienen", naar: "production" }, ingediend)}
          />
        </Spoorkaart>
        {gekoppeld && !a?.adresbalkWeg && (
          <p className="rounded-lg bg-paper-soft px-3 py-2 text-xs text-neutralx-600">
            Zodra Google je app heeft ondertekend, haalt ZekerFlex de sleutel op. Tot dan kan de app een adresbalk tonen.
          </p>
        )}
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink">Wat er gebeurde</h2>
          <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={opnieuw}>
            Vernieuwen
          </button>
        </div>
        {!a || a.logboek.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">Nog niets.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {a.logboek.map((l) => (
              <li key={`${l.at}-${l.tekst}`} className="flex gap-3 text-sm">
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${l.soort === "ok" ? "bg-emerald-600" : l.soort === "fout" ? "bg-red-600" : "bg-neutralx-400"}`} aria-hidden />
                <span className="min-w-0">
                  <span className={l.soort === "fout" ? "text-crit" : "text-ink"}>{l.tekst}</span>
                  <span className="block text-xs text-neutralx-500">{tijdstip(l.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {a && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutralx-500">
            Pakketnaam <code className="rounded bg-paper-soft px-1.5 py-0.5">{a.pakketnaam}</code>
            <Kopieer tekst={a.pakketnaam} />
          </p>
        )}
      </section>
    </div>
  );
}

function Spoorkaart({ s, titel, uitleg, children }: { s: SpoorWeergave | undefined; titel: string; uitleg: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-hair p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{titel}</p>
          <p className="text-xs text-neutralx-500">{uitleg}</p>
        </div>
        <div className="text-right">
          <span className={STAND_STIJL[s?.stand ?? "leeg"]}>{s?.standTekst ?? "Nog niet gestart"}</span>
          {s?.versie && <span className="mt-1 block text-xs text-neutralx-500">Versie {s.versie}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}
