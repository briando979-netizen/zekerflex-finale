import { describe, it, expect } from "vitest";
import {
  OPRICHTER_SCRIPT,
  clipsOpVolgorde,
  genererenOutline,
  scriptDuur,
  clipsBijSectie,
} from "@/lib/video/oprichter-script";

describe("OprichterScript", () => {
  it("script has correct structure", () => {
    expect(OPRICHTER_SCRIPT.titel).toBe("ZekerFlex: Wie we zijn, waarom het uitmaakt");
    expect(OPRICHTER_SCRIPT.taal).toBe("nl");
    expect(OPRICHTER_SCRIPT.totaalDuur).toBe(180);
  });

  it("script has 5 sections", () => {
    const sections = ["hook", "problem", "solution", "why-now", "cta"];
    for (const section of sections) {
      const clips = clipsBijSectie(OPRICHTER_SCRIPT, section as any);
      expect(clips.length).toBeGreaterThan(0);
    }
  });

  it("clips are in chronological order", () => {
    const sorted = clipsOpVolgorde(OPRICHTER_SCRIPT);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]?.start ?? 0).toBeGreaterThanOrEqual(sorted[i - 1]?.start ?? 0);
    }
  });

  it("hook section is 15 seconds", () => {
    const hookClips = clipsBijSectie(OPRICHTER_SCRIPT, "hook");
    const totalDuur = hookClips.reduce((sum, c) => sum + c.duur, 0);
    expect(totalDuur).toBe(15);
  });

  it("problem section is 30 seconds", () => {
    const problemClips = clipsBijSectie(OPRICHTER_SCRIPT, "problem");
    const totalDuur = problemClips.reduce((sum, c) => sum + c.duur, 0);
    expect(totalDuur).toBe(30);
  });

  it("solution section is 75 seconds", () => {
    const solutionClips = clipsBijSectie(OPRICHTER_SCRIPT, "solution");
    const totalDuur = solutionClips.reduce((sum, c) => sum + c.duur, 0);
    expect(totalDuur).toBe(75);
  });

  it("why-now section is 30 seconds", () => {
    const whyNowClips = clipsBijSectie(OPRICHTER_SCRIPT, "why-now");
    const totalDuur = whyNowClips.reduce((sum, c) => sum + c.duur, 0);
    expect(totalDuur).toBe(30);
  });

  it("cta section is 30 seconds", () => {
    const ctaClips = clipsBijSectie(OPRICHTER_SCRIPT, "cta");
    const totalDuur = ctaClips.reduce((sum, c) => sum + c.duur, 0);
    expect(totalDuur).toBe(30);
  });

  it("total duration is 180 seconds", () => {
    const total = OPRICHTER_SCRIPT.clips.reduce((sum, c) => sum + c.duur, 0);
    expect(total).toBe(180);
  });

  it("all clips have speaker text or description", () => {
    for (const clip of OPRICHTER_SCRIPT.clips) {
      expect(clip.spreker || clip.beschrijving).toBeTruthy();
    }
  });

  it("generates outline", () => {
    const outline = genererenOutline(OPRICHTER_SCRIPT);
    expect(outline).toContain("Flexwerk");
    expect(outline).toContain("ZekerFlex");
    expect(outline).toContain("Totaal");
  });

  it("clips have unique IDs", () => {
    const ids = OPRICHTER_SCRIPT.clips.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("scriptDuur returns 180", () => {
    expect(scriptDuur(OPRICHTER_SCRIPT)).toBe(180);
  });
});
