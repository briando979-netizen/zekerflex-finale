import { laatsteRondgang } from "@/lib/ops/rondgang";
import { timeAgoNl } from "@/lib/admin/format";
import { Empty, Panel, Pill } from "@/components/admin/kit";

/** Admin → Systeem → Taken: uitslag van de nachtelijke rondgang langs alle openbare pagina's (lib/ops/rondgang.ts). */
export async function RondgangPanel() {
  const uitslag = await laatsteRondgang().catch(() => null);
  const kapot = uitslag?.problemen.length ?? 0;
  return (
    <Panel
      flush
      title="Rondgang langs de pagina's"
      subtitle={
        uitslag
          ? `${uitslag.totaal} openbare pagina's opgehaald ${timeAgoNl(uitslag.at)} in ${(uitslag.ms / 1000).toFixed(1)} s. ${kapot === 0 ? "Alles opent netjes." : "Wat kapot is staat ook bij Foutmeldingen."}`
          : "Elke nacht om 04:20 (UTC) wordt elke openbare pagina één keer opgehaald, zoals een bezoeker dat doet."
      }
      actions={uitslag ? <Pill tone={kapot === 0 ? "ok" : "crit"}>{kapot === 0 ? "Alles in orde" : `${kapot} kapot`}</Pill> : <Pill tone="neutral">Nog niet gedraaid</Pill>}
    >
      {!uitslag ? (
        <Empty title="Nog geen uitslag" body="De eerste rondgang komt vannacht. De cron op de server roept /api/internal/rondgang aan." />
      ) : kapot === 0 ? null : (
        <ul>
          {uitslag.problemen.map((p) => (
            <li key={p.route} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
              <a href={p.route} target="_blank" rel="noreferrer" className="min-w-0 truncate font-mono text-[0.8125rem] underline-offset-2 hover:underline" style={{ color: "var(--a-text)" }}>
                {p.route}
              </a>
              <span className="flex flex-shrink-0 items-center gap-3">
                <span className="text-xs" style={{ color: "var(--a-mute)" }}>{p.reden}</span>
                <Pill tone="crit">{p.status ?? "—"}</Pill>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
