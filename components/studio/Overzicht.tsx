"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "@/components/studio/context";
import { Card, ICheck, IChevron, IExternal, PageHead, Pill, Stat, btn } from "@/components/studio/ui";
import { euro, zichtbareProducten } from "@/lib/sites/winkel";
import type { SiteBestelling } from "@/lib/sites/bestellingen";
import type { SiteStats } from "@/lib/sites/stats-shared";

// ---------------------------------------------------------------------------
// Websitestudio → Overzicht: hoe het gaat (bezoekers, bestellingen, omzet), wat
// er nog moet gebeuren voor een complete winkel, en de nieuwste bestellingen.
// ---------------------------------------------------------------------------

const DAG = 86_400_000;

function groet(now = new Date()): string {
  const uur = Number(new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(now));
  return uur < 6 ? "Goedenacht" : uur < 12 ? "Goedemorgen" : uur < 18 ? "Goedemiddag" : "Goedenavond";
}

const wanneer = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

export const STATUS: Record<SiteBestelling["status"], { label: string; tone: "attn" | "info" | "ok" | "neutral" | "crit" }> = {
  nieuw: { label: "Nieuw", tone: "attn" },
  bevestigd: { label: "Bevestigd", tone: "info" },
  klaar: { label: "Klaar", tone: "info" },
  afgerond: { label: "Afgerond", tone: "ok" },
  geannuleerd: { label: "Geannuleerd", tone: "crit" },
};

export default function Overzicht() {
  const { data, winkel } = useStudio();
  const site = data!.site!;
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [bestellingen, setBestellingen] = useState<SiteBestelling[] | null>(null);
  useEffect(() => {
    void fetch("/api/werkgever/sites/stats?dagen=30", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stats: SiteStats } | null) => setStats(d?.stats ?? null))
      .catch(() => undefined);
    void fetch("/api/werkgever/sites/bestellingen", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { bestellingen: SiteBestelling[] } | null) => setBestellingen(d?.bestellingen ?? []))
      .catch(() => setBestellingen([]));
  }, []);

  const maand = useMemo(() => {
    const sinds = Date.now() - 30 * DAG;
    const recent = (bestellingen ?? []).filter((b) => Date.parse(b.at) >= sinds && b.status !== "geannuleerd");
    return { aantal: recent.length, omzet: recent.reduce((s, b) => s + b.totaalCents, 0) };
  }, [bestellingen]);

  const actief = zichtbareProducten(winkel).length;
  const heeftProductBlok = site.pages.some((p) => p.blocks.some((b) => b.type === "producten" || b.type === "uitgelicht"));
  const taken = [
    { klaar: site.theme.stijl === "premium" || site.theme.stijl === "luxe", tekst: "Kies een ontwerp dat bij je merk past", href: "/studio/ontwerp" },
    { klaar: Boolean(site.theme.logo), tekst: "Voeg je logo toe", href: "/studio/ontwerp" },
    { klaar: actief > 0, tekst: "Zet je eerste product in de winkel", href: "/studio/producten" },
    { klaar: heeftProductBlok, tekst: "Laat je producten zien op je website (blok Producten)", href: "/studio/website" },
    { klaar: Boolean(site.liveBuild), tekst: "Zet je website online", href: "/studio/website" },
    { klaar: Boolean(site.bedrijf.email), tekst: "Vul het e-mailadres in voor bestellingen en berichten", href: "/studio/instellingen" },
  ];
  const gedaan = taken.filter((t) => t.klaar).length;
  const dagen = stats?.days.slice(-30) ?? [];
  const piek = Math.max(1, ...dagen.map((d) => d.views));

  return (
    <>
      <PageHead
        title={`${groet()}, ${site.bedrijf.naam}`}
        sub="Zo staat je website en webshop ervoor."
        actions={
          site.liveBuild && data?.address ? (
            <a href={data.address} target="_blank" rel="noopener" className={btn.secondary}>
              Bekijk website <IExternal width={15} height={15} />
            </a>
          ) : (
            <Link href="/studio/website" className={btn.primary}>Website afmaken</Link>
          )
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <Stat label="Bezoekers (30 dagen)" value={stats ? stats.entries.toLocaleString("nl-NL") : "—"} hint={stats ? `${stats.views.toLocaleString("nl-NL")} paginaweergaven` : "nog geen cijfers"} />
          <Stat label="Bestellingen (30 dagen)" value={bestellingen ? maand.aantal : "—"} />
          <Stat label="Omzet (30 dagen)" value={bestellingen ? euro(maand.omzet) : "—"} hint="zonder geannuleerde" />
          <Stat label="Producten online" value={actief} hint={`${winkel.producten.length} in totaal`} />
        </div>
        {dagen.length > 0 && (
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
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card title={`Zo maak je je winkel af · ${gedaan} van ${taken.length}`}>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#ebebeb]">
            <div className="h-full rounded-full bg-[#1a1a1a] transition-all" style={{ width: `${(gedaan / taken.length) * 100}%` }} />
          </div>
          <ul className="divide-y divide-[#f1f1f1]">
            {taken.map((t) => (
              <li key={t.tekst}>
                <Link href={t.href} className="flex items-center gap-3 py-2.5 text-sm hover:text-[#1a1a1a]">
                  <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full ${t.klaar ? "bg-[#1a1a1a] text-white" : "border-2 border-dashed border-[#b5b5b5]"}`}>{t.klaar && <ICheck width={12} height={12} />}</span>
                  <span className={`flex-1 ${t.klaar ? "text-[#707070] line-through" : "font-medium text-[#303030]"}`}>{t.tekst}</span>
                  {!t.klaar && <IChevron width={16} height={16} className="text-[#707070]" />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Nieuwste bestellingen" actions={<Link href="/studio/bestellingen" className="text-sm font-semibold text-[#005bd3] hover:underline">Alle bestellingen</Link>} pad={false}>
          {bestellingen === null ? (
            <div className="m-5 h-24 animate-pulse rounded-xl bg-[#f1f1f1]" />
          ) : bestellingen.length === 0 ? (
            <p className="px-5 pb-5 pt-3 text-sm text-[#616161]">Nog geen bestellingen. Ze komen hier binnen zodra een klant iets bestelt, en je krijgt ook een mail.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[#f1f1f1]">
              {bestellingen.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <Link href={`/studio/bestellingen?open=${b.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-[#fafafa]">
                    <span className="w-20 font-semibold text-[#1a1a1a]">#{b.nr}</span>
                    <span className="min-w-0 flex-1 truncate text-[#616161]">{b.invoer.naam} · {wanneer(b.at)}</span>
                    <Pill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Pill>
                    <span className="w-20 text-right font-semibold text-[#1a1a1a]">{euro(b.totaalCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
