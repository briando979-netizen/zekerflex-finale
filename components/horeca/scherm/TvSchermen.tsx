"use client";

import { euro } from "@/lib/horeca/weergave";
import { LET_OP_MIN, TE_LANG_MIN } from "@/lib/horeca/zaal";
import { ZaalTegels } from "@/components/horeca/live/ZaalTegels";
import { OPROEP_LANG, tijdTot } from "@/components/horeca/live/teksten";
import { minTekst, wachtNiveau } from "@/components/horeca/live/stijl";
import { ding } from "@/components/horeca/scherm/apparaat";
import { useNieuw, type SchermProps } from "@/components/horeca/scherm/ui";

// ---------------------------------------------------------------------------
// Schermen voor op een tv. Ze wijzigen niets, dus ze mogen zichtbaar hangen.
//   Afhaal     — voor gasten: grote nummers "in bereiding" en "klaar", geen namen
//   Overzicht  — het live-dashboard op afstand leesbaar (kantoor, achter de bar)
// ---------------------------------------------------------------------------

export function AfhaalScherm({ data, geluid }: SchermProps) {
  const a = data.afhaal ?? { bereiding: [], klaar: [] };
  useNieuw(
    a.klaar.map(String),
    () => {
      if (geluid) ding(true);
    },
  );
  return (
    <div className="grid min-h-[calc(100dvh-60px)] grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_1.4fr] md:p-6">
      <section aria-labelledby="bereiding-kop" className="rounded-3xl bg-white/[0.04] p-6 ring-1 ring-white/10">
        <h2 id="bereiding-kop" className="text-2xl font-bold uppercase tracking-[0.12em] text-[#B8C4BD] md:text-3xl">
          In bereiding
        </h2>
        {a.bereiding.length === 0 ? (
          <p className="mt-6 text-xl text-[#6B7A72]">–</p>
        ) : (
          <ul className="mt-6 flex flex-wrap gap-4">
            {a.bereiding.map((n) => (
              <li key={n} className="font-display text-5xl font-bold tabular-nums text-white md:text-6xl">
                {n}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="afhalen-kop" aria-live="polite" className="rounded-3xl bg-[#06311A] p-6 ring-2 ring-[#22C55E]">
        <h2 id="afhalen-kop" className="text-2xl font-bold uppercase tracking-[0.12em] text-[#86EFAC] md:text-3xl">
          Klaar, kom maar halen
        </h2>
        {a.klaar.length === 0 ? (
          <p className="mt-6 text-xl text-[#86EFAC]/60">Nog even geduld</p>
        ) : (
          <ul className="mt-6 flex flex-wrap gap-6">
            {a.klaar.map((n) => (
              <li key={n} className="font-display text-7xl font-bold tabular-nums text-white md:text-8xl">
                {n}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Groot({ label, waarde, uitleg, kleur = "text-white" }: { label: string; waarde: string; uitleg?: string; kleur?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
      <p className="truncate text-sm font-semibold uppercase tracking-wide text-[#9BA8A1]">{label}</p>
      <p className={`mt-1 font-display text-4xl font-bold tabular-nums ${kleur}`}>{waarde}</p>
      {uitleg && <p className="mt-0.5 truncate text-sm text-[#B8C4BD]">{uitleg}</p>}
    </div>
  );
}

export function OverzichtScherm({ data }: SchermProps) {
  const c = data.cijfers;
  if (!c) return null;
  const wacht = c.langsteWachtMin;
  const niveau = wacht === null ? "rustig" : wachtNiveau(wacht, LET_OP_MIN, TE_LANG_MIN);
  return (
    <div className="space-y-4 p-4 md:p-6">
      <section aria-label="Vandaag" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Groot label="Omzet vandaag" waarde={euro(c.omzetCent)} uitleg={`${c.bestellingen} bestellingen`} kleur="text-[#F5C451]" />
        <Groot label="In de keuken" waarde={String(c.inBereiding)} uitleg={wacht === null ? "niets wacht" : `langst ${minTekst(wacht)}`} kleur={niveau === "telang" ? "text-[#FCA5A5]" : niveau === "letop" ? "text-[#FCD34D]" : "text-white"} />
        <Groot label="Klaar" waarde={String(c.klaar)} uitleg="om te serveren" kleur={c.klaar ? "text-[#86EFAC]" : "text-white"} />
        <Groot label="Gasten" waarde={`${c.gastenBinnen}/${c.gastenVerwacht}`} uitleg="binnen / verwacht" />
        <Groot label="Tafels bezet" waarde={`${c.tafelsBezet}/${c.tafelsActief}`} uitleg={c.openRekeningCent ? `${euro(c.openRekeningCent)} open` : "geen open rekening"} />
        <Groot label="Bereidingstijd" waarde={c.bereidingMin === null ? "–" : `${c.bereidingMin}m`} uitleg="mediaan vandaag" />
      </section>
      {(data.oproepen ?? []).length > 0 && (
        <p className="rounded-2xl bg-[#3A2203] p-4 text-xl font-semibold text-[#FDE68A] ring-2 ring-[#F59E0B]" role="status">
          <span aria-hidden>🔔 </span>
          {(data.oproepen ?? []).map((o) => `${o.tafelNaam || "Tafel"} ${OPROEP_LANG[o.soort]}`).join(" · ")}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <ZaalTegels zaal={data.zaal ?? []} donker groot label="Zaal" />
        {(data.zaak.modules ?? []).includes("reserveren") && (
          <section aria-labelledby="komend-tv-kop" className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/10">
            <h2 id="komend-tv-kop" className="text-lg font-bold uppercase tracking-wide text-[#9BA8A1]">
              Nog te komen
            </h2>
            {(data.komend ?? []).length === 0 ? (
              <p className="mt-2 text-[#9BA8A1]">Niemand meer verwacht.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {(data.komend ?? []).map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-2 text-lg">
                    <span className="min-w-0 truncate text-white">
                      <strong className="tabular-nums">{r.tijd}</strong> {r.naam}
                    </span>
                    <span className="flex-shrink-0 text-sm text-[#BFDBFE]">
                      {r.personen} p. · {tijdTot(r.tijd, data.nu?.minuten ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
