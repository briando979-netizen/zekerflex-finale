"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStudio } from "@/components/studio/context";
import { AanDeSlag, Bezoekgrafiek, groet, useEigenDomein, useStats, wanneer, type Taak } from "@/components/studio/OverzichtDelen";
import { Card, IExternal, PageHead, Pill, Stat, btn } from "@/components/studio/ui";
import { euro, zichtbareProducten } from "@/lib/sites/winkel";
import type { SiteBestelling } from "@/lib/sites/bestellingen";

// ---------------------------------------------------------------------------
// Studio → Webshop → Overzicht: de "Aan de slag"-lijst (vinkt af wat al klaar
// is), de kerncijfers en de nieuwste bestellingen. Alleen echte gegevens.
// ---------------------------------------------------------------------------

const DAG = 86_400_000;
const B = "/studio/webshop";

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
  const stats = useStats();
  const eigenDomein = useEigenDomein();
  const [bestellingen, setBestellingen] = useState<SiteBestelling[] | null>(null);
  const [fout, setFout] = useState(false);
  useEffect(() => {
    void fetch("/api/werkgever/sites/bestellingen", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("niet ok"))))
      .then((d: { bestellingen: SiteBestelling[] }) => setBestellingen(d.bestellingen))
      .catch(() => {
        setBestellingen([]);
        setFout(true);
      });
  }, []);

  const cijfers = useMemo(() => {
    const lijst = bestellingen ?? [];
    const sinds = Date.now() - 30 * DAG;
    const recent = lijst.filter((b) => Date.parse(b.at) >= sinds && b.status !== "geannuleerd");
    return {
      nieuw: lijst.filter((b) => b.status === "nieuw").length,
      teVerwerken: lijst.filter((b) => b.status === "nieuw" || b.status === "bevestigd" || b.status === "klaar").length,
      aantal: recent.length,
      omzet: recent.reduce((s, b) => s + b.totaalCents, 0),
    };
  }, [bestellingen]);

  const actief = zichtbareProducten(winkel).length;
  const b = site.bedrijf;
  const wettelijk = ["verzenden-en-retourneren", "voorwaarden"].every((slug) => site.pages.some((p) => p.slug === slug));
  const taken: Taak[] = [
    { klaar: actief > 0, tekst: "Voeg je eerste product toe", href: `${B}/producten` },
    { klaar: winkel.bestellen && (winkel.levering.afhalen || winkel.levering.bezorgen) && winkel.betaalTekst.trim().length > 0, tekst: "Stel verzending en betalen in", href: `${B}/verzending` },
    { klaar: Boolean(b.naam.trim() && b.kvk.trim() && b.email.trim() && b.straat.trim() && b.postcode.trim() && b.plaats.trim()), tekst: "Vul je bedrijfsgegevens aan (naam, KVK, adres, e-mail)", href: `${B}/instellingen` },
    { klaar: wettelijk && Boolean(site.liveBuild), tekst: "Loop de wettelijke pagina's na (verzenden, retourneren, voorwaarden)", href: `/studio/website/bouwer` },
    { klaar: Boolean(site.liveBuild), tekst: "Zet je webshop online (Publiceren)", href: B },
    { klaar: eigenDomein === true, tekst: "Koppel je eigen domeinnaam (mag later)", href: `${B}/instellingen` },
  ];

  return (
    <>
      <PageHead
        title={`${groet()}, ${b.naam}`}
        sub="Zo staat je webshop ervoor."
        actions={
          site.liveBuild && data?.address ? (
            <a href={data.address} target="_blank" rel="noopener" className={btn.secondary}>
              Bekijk webshop <IExternal width={15} height={15} />
            </a>
          ) : (
            <Link href={`${B}/producten`} className={btn.primary}>Producten toevoegen</Link>
          )
        }
      />

      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <Stat label="Nieuwe bestellingen" value={bestellingen ? cijfers.nieuw : "—"} hint={bestellingen ? `${cijfers.teVerwerken} te verwerken` : undefined} />
          <Stat label="Omzet (30 dagen)" value={bestellingen ? euro(cijfers.omzet) : "—"} hint={bestellingen ? `${cijfers.aantal} bestellingen, zonder geannuleerde` : undefined} />
          <Stat label="Bezoeken (30 dagen)" value={stats ? stats.entries.toLocaleString("nl-NL") : "—"} hint={stats ? `${stats.views.toLocaleString("nl-NL")} paginaweergaven` : "nog geen cijfers"} />
          <Stat label="Producten online" value={actief} hint={`${winkel.producten.length} in totaal`} />
        </div>
        <Bezoekgrafiek stats={stats} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <AanDeSlag titel="Aan de slag" taken={taken} />

        <Card title="Laatste bestellingen" actions={<Link href={`${B}/bestellingen`} className="text-sm font-semibold text-[#005bd3] hover:underline">Alle bestellingen</Link>} pad={false}>
          {bestellingen === null ? (
            <div className="m-5 h-24 animate-pulse rounded-xl bg-[#f1f1f1]" aria-busy="true" aria-label="Bestellingen laden" />
          ) : fout ? (
            <p role="alert" className="px-5 pb-5 pt-3 text-sm text-[#b42318]">De bestellingen konden niet laden. Ververs de pagina.</p>
          ) : bestellingen.length === 0 ? (
            <p className="px-5 pb-5 pt-3 text-sm text-[#616161]">Nog geen bestellingen. Ze komen hier binnen zodra een klant iets bestelt, en je krijgt ook een mail.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[#f1f1f1]">
              {bestellingen.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <Link href={`${B}/bestellingen?open=${x.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a1a1a]">
                    <span className="w-16 font-semibold text-[#1a1a1a] sm:w-20">#{x.nr}</span>
                    <span className="min-w-0 flex-1 truncate text-[#616161]">{x.invoer.naam} · {wanneer(x.at)}</span>
                    <Pill tone={STATUS[x.status].tone}>{STATUS[x.status].label}</Pill>
                    <span className="hidden w-20 text-right font-semibold text-[#1a1a1a] sm:inline">{euro(x.totaalCents)}</span>
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
