/**
 * Admin → Videos → Oprichter
 * Storyboard-viewer en editor voor het ZekerFlex oprichter-videoescript.
 * Toont timing, tekst, en visuele suggesties per clip.
 */

"use client";

import { useState } from "react";
import {
  OPRICHTER_SCRIPT,
  clipsOpVolgorde,
  genererenOutline,
  scriptDuur,
  clipsBijSectie,
  type ScriptClip,
  type SectieType,
} from "@/lib/video/oprichter-script";

export default function OprichterVideoPage() {
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(false);
  const [selectedSection, setSelectedSection] = useState<SectieType | "alle">(
    "alle",
  );

  const script = OPRICHTER_SCRIPT;
  const sortedClips = clipsOpVolgorde(script);
  const totalMins = Math.floor(script.totaalDuur / 60);
  const totalSecs = script.totaalDuur % 60;

  const displayedClips =
    selectedSection === "alle"
      ? sortedClips
      : sortedClips.filter((c) => c.sectie === selectedSection);

  const selectedClipData = script.clips.find((c) => c.id === selectedClip);

  const sectionLabels: Record<SectieType, { label: string; color: string }> = {
    hook: { label: "Hook", color: "bg-red-500" },
    problem: { label: "Problem", color: "bg-orange-500" },
    solution: { label: "Solution", color: "bg-green-500" },
    "why-now": { label: "Why Now", color: "bg-blue-500" },
    cta: { label: "Call to Action", color: "bg-purple-500" },
  };

  const timeString = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bg-slate-900 text-white min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">{script.titel}</h1>
          <p className="text-slate-400 text-sm mt-2">
            Versie {script.versie} · {totalMins}m {totalSecs}s · {script.clips.length} clips
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setShowOutline(!showOutline)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm font-medium transition"
          >
            {showOutline ? "✕ Outline" : "📄 Outline"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedSection("alle")}
              className={`px-3 py-1 rounded text-xs font-medium transition ${
                selectedSection === "alle"
                  ? "bg-slate-500"
                  : "bg-slate-700 hover:bg-slate-600"
              }`}
            >
              Alle
            </button>
            {Object.entries(sectionLabels).map(([key, { label, color }]) => (
              <button
                key={key}
                onClick={() => setSelectedSection(key as SectieType)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  selectedSection === key ? color : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Outline Modal */}
        {showOutline && (
          <div className="bg-slate-800 p-6 rounded mb-6 border border-slate-700 max-h-96 overflow-y-auto">
            <h3 className="font-bold mb-4 text-lg">📋 Teleprompter Outline</h3>
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
              {genererenOutline(script)}
            </pre>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-2">
            <div className="space-y-3">
              {displayedClips.map((clip) => {
                const isSelected = clip.id === selectedClip;
                const section = sectionLabels[clip.sectie];
                return (
                  <button
                    key={clip.id}
                    onClick={() => setSelectedClip(clip.id)}
                    className={`w-full text-left p-4 rounded border-2 transition ${
                      isSelected
                        ? "bg-slate-700 border-indigo-400"
                        : "bg-slate-800 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`${section.color} text-white text-xs font-bold px-2 py-1 rounded`}>
                            {section.label}
                          </span>
                          <span className="text-xs text-slate-400">
                            {timeString(clip.start)} ({clip.duur}s)
                          </span>
                        </div>
                        <p className="text-sm font-mono text-slate-300">
                          {clip.soort === "spreker" ? "🎤" : "🎬"} {clip.soort}
                        </p>
                        {clip.spreker && (
                          <p className="text-sm text-slate-200 mt-2 leading-snug">
                            "{clip.spreker.split("\n")[0].substring(0, 80)}
                            {clip.spreker.length > 80 ? "..." : ""}"
                          </p>
                        )}
                      </div>
                      <span className="text-2xl ml-4">{clip.soort === "spreker" ? "🎤" : "🎥"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-1">
            {selectedClipData ? (
              <div className="bg-slate-800 p-6 rounded border border-slate-700 sticky top-6">
                <h3 className="text-lg font-bold mb-4">📌 Clip Details</h3>

                {/* Timing */}
                <div className="mb-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Timing</p>
                  <p className="text-2xl font-mono font-bold text-indigo-400">
                    {timeString(selectedClipData.start)}
                  </p>
                  <p className="text-xs text-slate-400">Duur: {selectedClipData.duur}s</p>
                </div>

                {/* Type */}
                <div className="mb-4">
                  <p className="text-xs text-slate-400 uppercase tracking-wide">Type</p>
                  <p className="font-semibold text-slate-200">{selectedClipData.soort}</p>
                </div>

                {/* Spreker Tekst */}
                {selectedClipData.spreker && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
                      🎤 Spreker Tekst
                    </p>
                    <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap bg-slate-900 p-3 rounded">
                      {selectedClipData.spreker}
                    </p>
                  </div>
                )}

                {/* Beschrijving */}
                {selectedClipData.beschrijving && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
                      👁️ Visueel
                    </p>
                    <p className="text-sm text-slate-200 leading-relaxed">
                      {selectedClipData.beschrijving}
                    </p>
                  </div>
                )}

                {/* B-Roll */}
                {selectedClipData.b_roll && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
                      🎬 B-Roll Voorstel
                    </p>
                    <p className="text-sm text-slate-300 italic leading-relaxed">
                      {selectedClipData.b_roll}
                    </p>
                  </div>
                )}

                {/* Noten */}
                {selectedClipData.noten && (
                  <div className="mb-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
                      📝 Productienoten
                    </p>
                    <p className="text-sm text-yellow-200 bg-yellow-900 bg-opacity-30 p-2 rounded leading-relaxed">
                      {selectedClipData.noten}
                    </p>
                  </div>
                )}

                {/* Muziek */}
                {script.muziek && selectedClipData.sectie === "hook" && (
                  <div className="mb-4 border-t border-slate-600 pt-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
                      🎵 Muziek
                    </p>
                    <p className="text-sm font-semibold text-slate-200">
                      {script.muziek.titel}
                    </p>
                    <p className="text-xs text-slate-400">
                      {script.muziek.bpm} BPM · {script.muziek.mood}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-800 p-6 rounded border border-slate-700 border-dashed text-center text-slate-400">
                <p className="text-sm">👆 Kies een clip</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Productiehulp */}
        <div className="mt-8 bg-slate-800 p-6 rounded border border-slate-700">
          <h3 className="text-lg font-bold mb-3">📋 Productiehulp</h3>
          <div className="text-sm text-slate-300 space-y-2">
            <p>
              <strong>Voiceover:</strong> Nederlands, casual, authentic. Eigenaar spreekt zelf of
              verteller met gevoel.
            </p>
            <p>
              <strong>B-Roll:</strong> App-screenshots (echt), chaos-boards (verpixeld), animaties,
              real footage van kantoor.
            </p>
            <p>
              <strong>Muziek:</strong> Modern, urgent, hopeful. Dutch indie of tech startup vibe.
              Geen corporate.
            </p>
            <p>
              <strong>Timeline:</strong> ~2 weken (voiceover, collect b-roll, edit, review).
            </p>
          </div>
          <button
            onClick={() => {
              const text = script.productieNoten;
              navigator.clipboard.writeText(text);
              alert("Productiehulp gekopieerd naar clipboard!");
            }}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm font-medium transition"
          >
            📋 Volledige Productiehulp Kopiëren
          </button>
        </div>
      </div>
    </div>
  );
}
