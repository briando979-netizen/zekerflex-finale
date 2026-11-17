import { CBS_VESTIGINGEN, type CbsVestigingen } from "@/lib/seo-cbs";

// De regels van het blok "in cijfers" op de stadspagina's (components/marketing/SectorLanding.tsx), uit de CBS-cijfers in
// lib/seo-cbs.ts. Puur, zodat de test de tekst per sector kan nalezen. Alleen wat CBS echt meet: de bedrijfstak zoals CBS
// hem noemt, ook als die breder is dan de sector (handel = winkels, groothandel en autohandel).

const TAK: Record<string, { veld: keyof Pick<CbsVestigingen, "horeca" | "vervoer" | "handel" | "cultuur">; naam: string } | undefined> = {
  horeca: { veld: "horeca", naam: "horecazaken" },
  logistiek: { veld: "vervoer", naam: "bedrijven in vervoer en opslag" },
  retail: { veld: "handel", naam: "bedrijven in de handel (winkels, groothandel en autohandel)" },
  evenementen: { veld: "cultuur", naam: "bedrijven in cultuur, sport en recreatie" },
};

const getal = (n: number) => new Intl.NumberFormat("nl-NL").format(n);

export interface CbsBlok {
  kop: string;
  regels: string[];
  bron: string;
}

export function cbsBlok(sectorKey: string, stad: { slug: string; name: string }): CbsBlok | null {
  const c = Object.hasOwn(CBS_VESTIGINGEN, stad.slug) ? CBS_VESTIGINGEN[stad.slug] : undefined;
  if (!c) return null;
  const waar = c.gemeente === stad.name ? `de gemeente ${c.gemeente}` : `de gemeente ${c.gemeente}, waar ${stad.name} bij hoort`;
  const regels = [`In ${waar} zijn ${getal(c.totaal)} bedrijfsvestigingen.`];
  const tak = Object.hasOwn(TAK, sectorKey) ? TAK[sectorKey] : undefined;
  if (tak) regels.push(`Daarvan zijn er ${getal(c[tak.veld])} ${tak.naam}.`);
  return {
    kop: `${c.gemeente} in cijfers`,
    regels,
    bron: `Bron: CBS StatLine, vestigingen van bedrijven op 1 januari ${c.jaar}. Een vestiging is een plek waar een bedrijf werkt; zzp'ers tellen mee.`,
  };
}
