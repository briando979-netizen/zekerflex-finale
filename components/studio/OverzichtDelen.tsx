"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStudio } from "@/components/studio/context";
import { Card, ICheck, IChevron } from "@/components/studio/ui";
import type { SiteStats } from "@/lib/sites/stats-shared";
import { AAN_DE_SLAG_STAPPEN, type AdsStap } from "@/lib/onboarding/aan-de-slag";

// ---------------------------------------------------------------------------
// Gedeelde stukken van de twee overzichten (webshop en website): de groet, de
// bezoekersgegevens uit …/stats, of er een eigen domein actief is, de
// "Aan de slag"-lijst en de grafiek. Alleen echte gegevens.
// ---------------------------------------------------------------------------

export function groet(now = new Date()): string {
  const uur = Number(new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(now));
  return uur < 6 ? "Goedenacht" : uur < 12 ? "Goedemorgen" : uur < 18 ? "Goedemiddag" : "Goedenavond";
}

export const wanneer = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

/** Bezoekers van de laatste 30 dagen; null tot ze er zijn (of als de teller even niet bereikbaar is). */
export function useStats(): SiteStats | null {
  const { api } = useStudio();
  const [stats, setStats] = useState<SiteStats | null>(null);
  useEffect(() => {
    void fetch(api("/stats", "dagen=30"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stats: SiteStats } | null) => setStats(d?.stats ?? null))
      .catch(() => undefined);
  }, [api]);
  return stats;
}

/** Staat er een eigen domein actief? null = nog niet bekend. */
export function useEigenDomein(): boolean | null {
  const { api } = useStudio();
  const [actief, setActief] = useState<boolean | null>(null);
  useEffect(() => {
    void fetch(api("/domain"), { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { domein: { activeAt: string | null } | null } | null) => setActief(d ? Boolean(d.domein?.activeAt) : null))
      .catch(() => undefined);
  }, [api]);
  return actief;
}

/** Een stap uit de gedeelde lijst (lib/onboarding/aan-de-slag.ts) als regel van de studio-lijst. */
export const taakVan = (s: AdsStap): Taak => ({ klaar: s.done, tekst: AAN_DE_SLAG_STAPPEN[s.key].title, href: s.href });

export interface Taak {
  klaar: boolean;
  tekst: string;
  href: string;

}

export function AanDeSlag({ titel, taken }: { titel: string; taken: Taak[] }) {
  const gedaan = taken.filter((t) => t.klaar).length;
  return (
    <Card title={`${titel} · ${gedaan} van ${taken.length}`}>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#ebebeb]" role="progressbar" aria-valuemin={0} aria-valuemax={taken.length} aria-valuenow={gedaan} aria-label="Voortgang">
        <div className="h-full rounded-full bg-[#1a1a1a] transition-all" style={{ width: `${(gedaan / Math.max(1, taken.length)) * 100}%` }} />
      </div>
      <ul className="divide-y divide-[#f1f1f1]">
        {taken.map((t) => (
          <li key={t.tekst}>
            <Link href={t.href} className="flex items-center gap-3 rounded-lg py-2.5 text-sm hover:text-[#1a1a1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a1a]">
              <span aria-hidden className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full ${t.klaar ? "bg-[#1a1a1a] text-white" : "border-2 border-dashed border-[#b5b5b5]"}`}>{t.klaar && <ICheck width={12} height={12} />}</span>
              <span className={`flex-1 ${t.klaar ? "text-[#707070] line-through" : "font-medium text-[#303030]"}`}>
                {t.tekst}
                <span className="sr-only">{t.klaar ? " (klaar)" : " (nog te doen)"}</span>
              </span>
              {!t.klaar && <IChevron width={16} height={16} className="text-[#707070]" />}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function Bezoekgrafiek({ stats }: { stats: SiteStats | null }) {
  const dagen = stats?.days.slice(-30) ?? [];
  if (dagen.length === 0) return null;
  const piek = Math.max(1, ...dagen.map((d) => d.views));
  return (
    <div className="mt-5" role="img" aria-label={`Bezoekers per dag, de laatste ${dagen.length} dagen`}>
      <div className="flex h-24 items-end gap-[3px]">
        {dagen.map((d) => (
          <div key={d.day} title={`${d.day}: ${d.views} weergaven`} className="flex-1 rounded-t-[3px] bg-[#1a1a1a]/80" style={{ height: `${Math.max(3, (d.views / piek) * 100)}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[#707070]">
        <span>{dagen[0]?.day}</span>
        <span>vandaag</span>
      </div>
    </div>
  );
}
