import { laatsteNachtronde } from "@/lib/boekhouding/nachtronde";
import { timeAgoNl } from "@/lib/admin/format";
import { Empty, Panel, Pill } from "@/components/admin/kit";

/** Admin → Systeem → Taken: uitslag van de nachtelijke boekhoudronde (lib/boekhouding/nachtronde.ts). */
export async function BoekrondePanel() {
  const uitslag = await laatsteNachtronde().catch(() => null);
  const stappen = uitslag ? [...uitslag.algemeen, ...uitslag.administraties.flatMap((a) => a.stappen)] : [];
  const namen: Record<string, string> = {
    administraties: "Administraties",
    facturen: "Facturen boeken",
    bank: "Bank koppelen",
    btw: "Btw-concept",
    deadlines: "Deadlinemeldingen",
    "even-kijken": "Even kijken",
  };
  return (
    <Panel
      flush
      title="Nachtelijke boekhoudronde"
      subtitle={
        uitslag
          ? `Laatst gedraaid ${timeAgoNl(uitslag.at)} in ${(uitslag.ms / 1000).toFixed(1)} s. ${uitslag.fouten === 0 ? "Alle stappen gelukt." : "Wat misging staat ook bij Foutmeldingen."}`
          : "Elke nacht om 02:40 (UTC), als de vlag boekhouding-nachtronde aan staat: facturen boeken, bank koppelen, btw-concept bijwerken en deadlines bewaken."
      }
      actions={uitslag ? <Pill tone={uitslag.fouten === 0 ? "ok" : "crit"}>{uitslag.fouten === 0 ? "Alles in orde" : `${uitslag.fouten} mislukt`}</Pill> : <Pill tone="neutral">Nog niet gedraaid</Pill>}
    >
      {!uitslag ? (
        <Empty title="Nog geen uitslag" body="De ronde staat standaard uit. Zet de vlag boekhouding-nachtronde aan (Admin, Vlaggen) na een controle van het boeken en koppelen." />
      ) : (
        <ul>
          {stappen.map((s, i) => (
            <li key={`${s.stap}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
              <span className="min-w-0 text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
                {namen[s.stap] ?? s.stap}
                <span className="ml-2 text-xs" style={{ color: "var(--a-mute)" }}>{s.samenvatting}</span>
              </span>
              <Pill tone={s.ok ? "ok" : "crit"}>{s.ok ? "Gelukt" : "Mislukt"}</Pill>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
