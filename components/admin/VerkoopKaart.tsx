import Link from "next/link";
import { Panel } from "@/components/admin/kit";
import type { VerkoopWacht } from "@/lib/admin/verkoop-wacht";

// De kaart bovenaan het beheerstartscherm (14 nov 2026): alles wat de eigenaar kan verkopen maar
// wat op een mens wacht, met per soort het aantal, hoe lang het oudste al wacht en de knop naar de
// juiste tab. Amber = wacht op jou (lib/admin/kleuren: één kleur, één betekenis). Alleen aantallen.

const dagen = (n: number) => (n === 0 ? "vandaag" : n === 1 ? "sinds gisteren" : `oudste wacht ${n} dagen`);

export function VerkoopKaart({ stand }: { stand: VerkoopWacht }) {
  if (stand.items.length === 0) {
    return (
      <Panel title="Verkoop: dit wacht op jou" subtitle="Niets wordt vanzelf verstuurd; wat hier verschijnt, verstuur jij.">
        <p className="text-sm" style={{ color: "var(--a-mute)" }}>
          {stand.onbekend.length ? "Niets te doen in wat te lezen was; een deel kon nu niet worden geteld." : "Niets te doen. Nieuwe concept-mails, scans en voorstellen komen hier vanzelf te staan."}
        </p>
      </Panel>
    );
  }
  return (
    <Panel
      title="Verkoop: dit wacht op jou"
      subtitle={`${stand.totaal} ${stand.totaal === 1 ? "ding wacht" : "dingen wachten"} op een mens. Niets wordt vanzelf verstuurd: elke mail hieronder verstuur jij.`}
      {...(stand.onbekend.length ? { footer: "Een deel van de tellingen kon nu niet worden gelezen; die soorten staan hier niet." } : {})}
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stand.items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="group block h-full rounded-xl p-3.5 transition-colors hover:bg-[var(--a-panel-2)]"
              style={{ border: "1px solid var(--a-border)", borderLeft: "3px solid var(--a-warn)" }}
            >
              <p className="num text-[1.5rem] font-semibold leading-tight tracking-tight" style={{ color: "var(--a-warn)" }}>
                {item.aantal}
              </p>
              <p className="mt-1 text-sm font-medium" style={{ color: "var(--a-text)" }}>
                {item.label}
                <span className="transition-transform group-hover:translate-x-0.5" style={{ color: "var(--a-mute)" }} aria-hidden>
                  {" "}→
                </span>
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--a-warn-ink)" }}>{dagen(item.oudsteDagen)}</p>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>{item.doen}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
