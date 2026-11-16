import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lijktVerzonnen, schoonTranscript } from "@/lib/asr/verzonnen";

// Whisper verzint tekst bij stilte: een spraakbericht van 6 seconden werd ruim honderd keer "hey, hey, hey"
// (16 nov 2026, /berichten). Zo'n tekst bewaren en tonen we niet.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("lijktVerzonnen", () => {
  it("honderd keer hetzelfde woord is verzonnen, met en zonder duur", () => {
    const hey = Array.from({ length: 120 }, () => "hey").join(", ");
    expect(lijktVerzonnen(hey, 6)).toBe(true);
    expect(lijktVerzonnen(hey)).toBe(true);
    expect(schoonTranscript(hey, 6)).toBe("");
  });

  it("een kort rijtje dat steeds terugkomt ook", () => {
    expect(lijktVerzonnen(Array.from({ length: 12 }, () => "Dank je wel.").join(" "))).toBe(true);
  });

  it("veel meer woorden dan in de opname passen", () => {
    const zin = "ik kom morgen iets later want de trein rijdt niet tussen Utrecht en Amersfoort vanwege werkzaamheden aan het spoor";
    expect(lijktVerzonnen(zin, 2)).toBe(true);
    expect(lijktVerzonnen(zin, 8)).toBe(false);
  });

  it("gewone berichten blijven staan, ook in andere talen en met een korte herhaling", () => {
    for (const [tekst, duur] of [
      ["Hoi, ik sta bij de ingang maar de deur is dicht. Kun je me even binnenlaten?", 6],
      ["Ja ja ja, ik kom eraan.", 3],
      ["nee nee nee", 2],
      ["Dzień dobry, będę za dziesięć minut na miejscu.", 4],
      ["Привіт, я вже на місці, чекаю біля входу.", 4],
      ["", 5],
    ] as const) {
      expect(lijktVerzonnen(tekst, duur), tekst).toBe(false);
      expect(schoonTranscript(tekst, duur)).toBe(tekst);
    }
  });

  it("een onbekende of rare duur telt niet mee; dan alleen de herhaling", () => {
    const zin = "ik kom morgen iets later want de trein rijdt niet tussen Utrecht en Amersfoort";
    for (const duur of [undefined, 0, -1, Number.NaN]) expect(lijktVerzonnen(zin, duur)).toBe(false);
  });

  it("de route bewaart en de bubbel toont alleen de schone tekst", () => {
    expect(bron("app/api/inbox/[threadId]/transcript/route.ts")).toContain("schoonTranscript(uit.text, m.attachment.durationSec)");
    expect(bron("components/chat/MessageBubble.tsx")).toContain("schoonTranscript(transcript, durationSec) || t.geenSpraak");
  });
});
