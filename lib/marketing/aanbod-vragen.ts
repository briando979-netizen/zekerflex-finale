import { prijsTekst, type AanbodItem } from "@/lib/marketing/aanbod";

// De vragen op een aanbodpagina met de standaardopmaak (components/marketing/aanbod/AanbodStandaard.tsx), en als FAQPage
// voor Google. Ze volgen uit het item zelf (prijs, voor wie, hoe je begint), dus er komt geen belofte bij die er niet al
// stond. Puur bestand.

export function standaardVragen(a: AanbodItem): { vraag: string; antwoord: string }[] {
  const prijs = prijsTekst(a);
  return [
    {
      vraag: `Wat kost ${a.naam.toLowerCase()}?`,
      antwoord: prijs === "Op aanvraag" ? "Dat hangt af van wat je nodig hebt. Vraag een demo aan of neem contact op; een account aanmaken is gratis." : `${prijs}. Een account aanmaken is gratis.`,
    },
    { vraag: "Voor wie is het?", antwoord: `${a.voorWie}.` },
    {
      vraag: "Hoe begin ik?",
      antwoord: `Via de knop "${a.start.label}". Liever eerst meekijken? Vraag een demo aan.`,
    },
    {
      vraag: "Werkt het samen met de rest van ZekerFlex?",
      antwoord: "Ja. Alles zit in je ZekerFlex-account, met één login: personeel, je website en klanten, branchesoftware en administratie.",
    },
  ];
}
