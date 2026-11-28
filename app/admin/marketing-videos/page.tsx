"use client";

import { useEffect, useState } from "react";
import { PageHead, Panel, Pill, Notice } from "@/components/admin/kit";
import type { VideoTemplate } from "@/lib/marketing/video-config";

interface VideoItem {
  id: string;
  titel: string;
  format: "landscape" | "vertical";
  status: "ready" | "rendering" | "error";
  size?: number;
  duur?: number;
  createdAt?: string;
}

const TEMPLATES: VideoTemplate[] = [
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

export default function MarketingVideosPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    // Laad beschikbare videos
    setLoading(false);
  }, []);

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      // Trigger generation voor alle templates
      const response = await fetch("/api/admin/marketing-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          templates: TEMPLATES.map((t) => t.id),
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { status?: string };
        if (data.status === "queued") {
          alert("Videos in wachtrij voor rendering");
        }
      }
    } catch (err) {
      console.error("Generate failed:", err);
      alert("Fout bij genereren videos");
    } finally {
      setGenerating(false);
    }
  };

  const handleExportScript = () => {
    // Open terminal instructies
    const instructions = `
# Marketing Video Generator

Genereer marketing videos voor ZekerFlex:

## Stap 1: Geneer project-configuraties
node scripts/marketing-video-gen.mjs export

## Stap 2: Bekijk templates
node scripts/marketing-video-gen.mjs list

## Stap 3: Render via Admin UI
1. Ga naar Admin → Video-editor
2. Importeer project uit marketing-projects.json
3. Exporteer als MP4

## Stap 4: Upload naar social media
- Landscape (1920×1080): YouTube, website
- Vertical (1080×1920): TikTok, Reels, Shorts
    `.trim();

    const blob = new Blob([instructions], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "marketing-video-instructies.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Marketing Videos"
        subtitle="Beheer en genereer marketing video templates voor ZekerFlex"
      />

      <Notice>
        <strong>Hoe te gebruiken:</strong> Run{" "}
        <code className="bg-gray-100 px-2 py-1 rounded">
          node scripts/marketing-video-gen.mjs
        </code>{" "}
        om video-projecten te genereren. Render vervolgens via de Video-editor.
      </Notice>

      <Panel title="Templates" icon="filmstrip">
        <div className="space-y-4">
          {TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="flex items-start justify-between border rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">
                  {template.titel}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {template.beschrijving}
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {template.tags.map((tag) => (
                    <Pill key={tag} label={tag} />
                  ))}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Duur: {template.teksten.lengte}s | {template.teksten.regels.length} regels
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <a
                  href={`/admin/video?template=${template.id}`}
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Bewerk
                </a>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Export & Rendering" icon="download">
        <div className="space-y-4">
          <button
            onClick={handleExportScript}
            className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
          >
            📋 Toon Instructies
          </button>

          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {generating ? "Genereren..." : "🎬 Voeg Templates toe aan Wachtrij"}
          </button>

          <div className="bg-gray-50 p-4 rounded text-sm space-y-2">
            <p>
              <strong>Landscape (1920×1080):</strong> YouTube, website, blog
            </p>
            <p>
              <strong>Vertical (1080×1920):</strong> TikTok, Instagram Reels,
              YouTube Shorts
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Storage" icon="folder">
        <div className="text-sm text-gray-600">
          <p>
            Videos opgeslagen in:{" "}
            <code className="bg-gray-100 px-2 py-1 rounded">
              storage/videos/
            </code>
          </p>
          <p className="mt-2">Ruimte beschikbaar voor renders.</p>
        </div>
      </Panel>

      <Panel title="Workflow" icon="workflow">
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 min-w-fit">1.</span>
            <span>
              Voer uit:{" "}
              <code className="bg-gray-100 px-2 py-1 rounded">
                node scripts/marketing-video-gen.mjs export
              </code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 min-w-fit">2.</span>
            <span>
              Open Admin → Video-editor en laad een project
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 min-w-fit">3.</span>
            <span>Render en exporteer als MP4</span>
          </li>
          <li className="flex gap-3">
            <span className="font-bold text-blue-600 min-w-fit">4.</span>
            <span>Upload naar YouTube, TikTok, Reels, etc.</span>
          </li>
        </ol>
      </Panel>
    </div>
  );
}
