/**
 * Configuratie voor marketing video templates.
 * 4 video templates die met bouwTekstVideo gegenereerd worden.
 * Export in landscape (1920×1080) en vertical (1080×1920 voor TikTok).
 */

import { type Project, type Formaat } from "@/lib/video/model";
import { bouwTekstVideo, type TekstVideoOpties } from "@/lib/video/tekst-video";

export interface VideoTemplate {
  id: string;
  titel: string;
  beschrijving: string;
  teksten: {
    regels: string[];
    lengte: number;
  };
  tags: string[];
}

export const MARKETING_TEMPLATES: VideoTemplate[] = [
  {
    id: "intro",
    titel: "Wat is ZekerFlex?",
    beschrijving: "Introductie video voor het platform",
    teksten: {
      regels: [
        "Werk zoeken?",
        "Kies je eigen klussen",
        "Werk wanneer het jou past",
        "FLEX",
        "Reageer in één tik",
        "Uren schrijven in de app",
        "ZekerFlex",
      ],
      lengte: 60,
    },
    tags: ["intro", "platform", "flexwerk"],
  },
  {
    id: "how-to",
    titel: "Hoe klussen accepteren?",
    beschrijving: "Stap-voor-stap gids voor het accepteren van klussen",
    teksten: {
      regels: [
        "Stap 1",
        "Open ZekerFlex app",
        "Stap 2",
        "Blader klussen",
        "Stap 3",
        "Tik reageer",
        "Stap 4",
        "Klaar!",
        "Zo eenvoudig",
      ],
      lengte: 60,
    },
    tags: ["how-to", "tutorial", "klussen"],
  },
  {
    id: "pitch",
    titel: "Voordelen voor bedrijven",
    beschrijving: "Pitch video voor werkgevers",
    teksten: {
      regels: [
        "Voor bedrijven",
        "Personeel inhuren",
        "In 5 minuten",
        "Flexibel",
        "Betaalbaar",
        "Direct beschikbaar",
        "ZekerFlex",
      ],
      lengte: 90,
    },
    tags: ["bedrijven", "pitch", "werkgever"],
  },
  {
    id: "demo",
    titel: "Personeel inhuren in 5 minuten",
    beschrijving: "Demo video voor het huren van werknemers",
    teksten: {
      regels: [
        "Plaats je klus",
        "Werkers reageren",
        "Kies de beste",
        "Werk begint",
        "Uren goedkeuren",
        "Betaald",
        "Klaar!",
        "Dat is alles",
      ],
      lengte: 90,
    },
    tags: ["demo", "process", "werkgever"],
  },
];

/**
 * Genereer een project voor een template in een gegeven formaat.
 */
export function genereerbouwenProject(
  templateId: string,
  formaat: Formaat = "9:16"
): Project | null {
  const template = MARKETING_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;

  const opties: TekstVideoOpties = {
    regels: template.teksten.regels,
    formaat,
    lengte: template.teksten.lengte,
  };

  return bouwTekstVideo(opties);
}

/**
 * Haal alle templates op voor een gegeven formaat.
 */
export function alleTemplates(formaat: Formaat = "9:16") {
  return MARKETING_TEMPLATES.map((t) => ({
    ...t,
    project: genereerbouwenProject(t.id, formaat),
  }));
}
