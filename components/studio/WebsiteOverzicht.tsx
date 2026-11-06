"use client";

import Link from "next/link";
import { useStudio } from "@/components/studio/context";
import { AanDeSlag, Bezoekgrafiek, groet, useEigenDomein, useStats, type Taak } from "@/components/studio/OverzichtDelen";
import { Card, IExternal, PageHead, Pill, Stat, btn } from "@/components/studio/ui";

// ---------------------------------------------------------------------------
// Studio → Website → Overzicht: de "Aan de slag"-lijst, de bezoekers en de
// stand van de website. Zonder winkelcijfers; alleen echte gegevens.
// ---------------------------------------------------------------------------

const B = "/studio/website";

export default function WebsiteOverzicht() {
  const { data, unpublished } = useStudio();
  const site = data!.site!;
  const stats = useStats();
  const eigenDomein = useEigenDomein();
  const b = site.bedrijf;
  const taken: Taak[] = [
    { klaar: site.pages.length > 1, tekst: "Vul je pagina's met eigen teksten en foto's", href: `${B}/bouwer` },
    { klaar: Boolean(site.theme.logo), tekst: "Voeg je logo toe", href: `${B}/ontwerp` },
    { klaar: Boolean(b.naam.trim() && b.email.trim() && b.telefoon.trim()), tekst: "Vul je contactgegevens in (naam, e-mail, telefoon)", href: `${B}/instellingen` },
    { klaar: Boolean(site.liveBuild), tekst: "Zet je website online (Publiceren)", href: `${B}/bouwer` },
    { klaar: eigenDomein === true, tekst: "Koppel je eigen domeinnaam (mag later)", href: `${B}/instellingen` },
  ];
  return (
    <>
      <PageHead
        title={`${groet()}, ${b.naam}`}
        sub="Zo staat je website ervoor."
        actions={
          site.liveBuild && data?.address ? (
            <a href={data.address} target="_blank" rel="noopener" className={btn.secondary}>
              Bekijk website <IExternal width={15} height={15} />
            </a>
          ) : (
            <Link href={`${B}/bouwer`} className={btn.primary}>Website afmaken</Link>
          )
        }
      />
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <Stat label="Bezoeken (30 dagen)" value={stats ? stats.entries.toLocaleString("nl-NL") : "—"} hint={stats ? `${stats.views.toLocaleString("nl-NL")} paginaweergaven` : "nog geen cijfers"} />
          <Stat label="Pagina's" value={site.pages.length} />
          <Stat label="Foto's" value={site.media.length} />
          <Stat label="Stand" value={site.liveBuild ? <Pill tone="ok">Online</Pill> : <Pill tone="warn">Concept</Pill>} hint={site.liveBuild && unpublished ? "wijzigingen nog niet gepubliceerd" : undefined} />
        </div>
        <Bezoekgrafiek stats={stats} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <AanDeSlag titel="Aan de slag" taken={taken} />
        <Card title="Snel naar">
          <ul className="space-y-1 text-sm">
            <li><Link href={`${B}/bouwer`} className="font-semibold text-[#005bd3] hover:underline">Pagina&apos;s en blokken aanpassen</Link></li>
            <li><Link href={`${B}/ontwerp`} className="font-semibold text-[#005bd3] hover:underline">Stijl, kleuren en logo</Link></li>
            <li><Link href={`${B}/reserveringen`} className="font-semibold text-[#005bd3] hover:underline">Reserveringen bekijken</Link></li>
          </ul>
        </Card>
      </div>
    </>
  );
}
