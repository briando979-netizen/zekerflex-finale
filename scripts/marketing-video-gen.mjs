#!/usr/bin/env node

/**
 * Node script om marketing videos te genereren voor ZekerFlex.
 * Genereert 4 video templates in landscape (1920×1080) en vertical (1080×1920 voor TikTok).
 *
 * Gebruik:
 *   node scripts/marketing-video-gen.mjs
 *   node scripts/marketing-video-gen.mjs --export
 *   node scripts/marketing-video-gen.mjs --template intro
 *
 * Dit script genereert de video projecten. Het daadwerkelijk renderen/exporteren
 * gebeurt via de Admin → Video-editor UI of via de API /api/admin/video/wachtrij.
 */

import path from "path";
import { fileURLToPath } from "url";
import { writeFileSync, mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Template definitions - deze zouden eigenlijk uit lib/marketing/video-config.ts komen
// maar voor Node.js exports moeten we ze hier dupliceren of als pure JSON export hebben
const TEMPLATES = [
  {
    id: "intro",
    titel: "Wat is ZekerFlex?",
    beschrijving: "Introductie video voor het platform",
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
    tags: ["intro", "platform", "flexwerk"],
  },
  {
    id: "how-to",
    titel: "Hoe klussen accepteren?",
    beschrijving: "Stap-voor-stap gids voor het accepteren van klussen",
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
    tags: ["how-to", "tutorial", "klussen"],
  },
  {
    id: "pitch",
    titel: "Voordelen voor bedrijven",
    beschrijving: "Pitch video voor werkgevers",
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
    tags: ["bedrijven", "pitch", "werkgever"],
  },
  {
    id: "demo",
    titel: "Personeel inhuren in 5 minuten",
    beschrijving: "Demo video voor het huren van werknemers",
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
    tags: ["demo", "process", "werkgever"],
  },
];

const FORMATEN = {
  landscape: { w: 1920, h: 1080, formaat: "16:9", label: "YouTube, website" },
  vertical: { w: 1080, h: 1920, formaat: "9:16", label: "TikTok, Reels, Shorts" },
};

/**
 * Genereer een project definitie (JSON) voor een template en formaat.
 * Dit is wat bouwTekstVideo() zou returneren, maar dan voor export naar JSON.
 */
function genererenProject(template, formatSleutel) {
  const formaat = FORMATEN[formatSleutel];
  const { w, h } = { w: formaat.w, h: formaat.h };

  return {
    id: `p_${template.id}_${formatSleutel}_${Date.now()}`,
    naam: `${template.titel} (${formaat.label})`,
    formaat: formaat.formaat,
    fps: 30,
    achtergrond: "#000000",
    sporen: [
      { id: "s-beeld", soort: "beeld", naam: "Hoofdspoor" },
      { id: "s-overlay", soort: "beeld", naam: "Overlay" },
      { id: "s-tekst", soort: "tekst", naam: "Tekst" },
      { id: "s-onder", soort: "tekst", naam: "Ondertiteling" },
      { id: "s-stem", soort: "audio", naam: "Stem" },
      { id: "s-muziek", soort: "audio", naam: "Muziek" },
    ],
    // Let op: de clips worden gegenereerd door bouwTekstVideo() in de browser/server
    // Dit is een placeholder. In praktijk zou je dit via de API aanroepen.
    clips: [],
    bijgewerkt: new Date().toISOString(),
    versie: 1,
    metadata: {
      template: template.id,
      titel: template.titel,
      formaat: formatSleutel,
      tags: template.tags,
      dimensions: `${w}×${h}`,
    },
  };
}

/**
 * Genereer exportinstructies voor een template in beide formaten.
 */
function genererenInstructies(template) {
  return {
    template: template.id,
    titel: template.titel,
    beschrijving: template.beschrijving,
    regels: template.regels,
    duur: template.lengte,
    formaten: {
      landscape: {
        ...FORMATEN.landscape,
        stappen: [
          "1. Admin → Video-editor → Importeer project",
          "2. Project renders automatisch",
          "3. Exporteer als MP4 (1080p)",
          "4. Download of bewaar in Media",
        ],
      },
      vertical: {
        ...FORMATEN.vertical,
        stappen: [
          "1. Admin → Video-editor → Importeer project",
          "2. Project renders automatisch",
          "3. Exporteer als MP4 (1080p)",
          "4. Download of bewaar in Media",
          "5. Upload naar TikTok, Reels, Shorts",
        ],
      },
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "list";
  const template = args[1] || null;

  const outputDir = path.join(projectRoot, "storage", "videos");
  mkdirSync(outputDir, { recursive: true });

  console.log("🎬 ZekerFlex Marketing Video Generator");
  console.log("=====================================\n");

  if (cmd === "list") {
    console.log("Beschikbare templates:");
    TEMPLATES.forEach((t) => {
      console.log(`  • ${t.id}: ${t.titel}`);
      console.log(`    ${t.beschrijving}`);
      console.log(`    Tags: ${t.tags.join(", ")}`);
      console.log();
    });

    console.log("\nCommando's:");
    console.log("  node scripts/marketing-video-gen.mjs list              - Toon alle templates");
    console.log("  node scripts/marketing-video-gen.mjs export            - Exporteer project-configs");
    console.log("  node scripts/marketing-video-gen.mjs info <template>   - Info voor template");
    console.log(
      "\nOpmerking: Het daadwerkelijk video-renderen gebeurt via Admin → Video-editor"
    );
    console.log("of via /api/admin/video/wachtrij");
  } else if (cmd === "export") {
    console.log("📦 Genereert project-configuraties...\n");

    const configs = [];
    TEMPLATES.forEach((t) => {
      Object.keys(FORMATEN).forEach((fmt) => {
        const project = genererenProject(t, fmt);
        configs.push(project);
      });
    });

    const outputFile = path.join(outputDir, "marketing-projects.json");
    writeFileSync(outputFile, JSON.stringify(configs, null, 2));
    console.log(`✅ Projecten opgeslagen: ${outputFile}`);
    console.log(
      `   ${configs.length} projecten (${TEMPLATES.length} templates × 2 formaten)\n`
    );

    // Ook instructies exporteren
    const instructies = TEMPLATES.map(genererenInstructies);
    const instrFile = path.join(outputDir, "export-instructies.json");
    writeFileSync(instrFile, JSON.stringify(instructies, null, 2));
    console.log(`✅ Instructies opgeslagen: ${instrFile}`);
  } else if (cmd === "info") {
    if (!template) {
      console.error("❌ Template naam verplicht");
      console.error(
        "Gebruik: node scripts/marketing-video-gen.mjs info <template>"
      );
      process.exit(1);
    }

    const t = TEMPLATES.find((x) => x.id === template);
    if (!t) {
      console.error(`❌ Template '${template}' niet gevonden`);
      process.exit(1);
    }

    const info = genererenInstructies(t);
    console.log(JSON.stringify(info, null, 2));
  } else if (cmd === "queue") {
    // Commandline interface om videos in de wachtrij te zetten
    console.log("📋 Voeg templates toe aan de render-wachtrij");
    console.log("Dit vereist admin-toegang via de API.\n");

    TEMPLATES.forEach((t) => {
      console.log(`Template: ${t.id}`);
      console.log(`POST /api/admin/video/wachtrij`);
      console.log("Body:");
      console.log(
        JSON.stringify(
          {
            taken: [
              {
                soort: "video",
                omschrijving: t.titel,
                formaat: "16:9",
                duur: t.lengte,
              },
              {
                soort: "video",
                omschrijving: `${t.titel} (vertical)`,
                formaat: "9:16",
                duur: t.lengte,
              },
            ],
          },
          null,
          2
        )
      );
      console.log();
    });
  } else {
    console.error(`❌ Onbekend commando: ${cmd}`);
    console.error("Probeer 'node scripts/marketing-video-gen.mjs list'");
    process.exit(1);
  }
}

main();
