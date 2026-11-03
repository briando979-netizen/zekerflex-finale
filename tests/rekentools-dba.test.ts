import { describe, expect, it } from "vitest";
import { DBA_LEVEL_TEXT, DBA_MAX_SCORE, DBA_QUESTIONS, dbaLevelText, dbaText, levelFor, scoreDba, type DbaAnswer } from "@/lib/rekentools/dba-check";

const all = (pick: (riskWhen: "ja" | "nee") => DbaAnswer) =>
  Object.fromEntries(DBA_QUESTIONS.map((q) => [q.id, pick(q.riskWhen)]));
const flip = (a: "ja" | "nee"): DbaAnswer => (a === "ja" ? "nee" : "ja");

describe("Wet DBA-check", () => {
  it("has ten questions with unique ids", () => {
    expect(DBA_QUESTIONS).toHaveLength(10);
    expect(new Set(DBA_QUESTIONS.map((q) => q.id)).size).toBe(10);
    expect(DBA_MAX_SCORE).toBe(16);
  });

  it("gives no level until every question is answered", () => {
    const r = scoreDba({ hoe: "ja" });
    expect(r.complete).toBe(false);
    expect(r.level).toBeNull();
    expect(r.answered).toBe(1);
  });

  it("scores every answer towards zelfstandigheid as laag", () => {
    const r = scoreDba(all(flip));
    expect(r.score).toBe(0);
    expect(r.level).toBe("laag");
    expect(r.attention).toHaveLength(0);
    expect(r.strengths).toHaveLength(10);
  });

  it("scores every answer towards loondienst as hoog", () => {
    const r = scoreDba(all((riskWhen) => riskWhen));
    expect(r.score).toBe(DBA_MAX_SCORE);
    expect(r.level).toBe("hoog");
  });

  it("counts deels as half, both for ja- and nee-questions", () => {
    const r = scoreDba({ ...all(flip), hoe: "deels", vervangen: "deels" });
    expect(r.score).toBe(2);
    expect(r.attention.map((a) => a.question.id).sort()).toEqual(["hoe", "vervangen"]);
    expect(r.attention.every((a) => a.partly)).toBe(true);
  });

  it("puts the heaviest points first", () => {
    const r = scoreDba({ ...all(flip), zijaanzij: "ja", vervangen: "nee" });
    expect(r.attention[0]?.question.id).toBe("vervangen");
    expect(r.level).toBe("laag");
  });

  it("asks every question in the zzp'er's own words too", () => {
    for (const q of DBA_QUESTIONS) {
      const zzp = dbaText(q, "zzp");
      expect(zzp.q, q.id).not.toBe(q.q);
      expect(zzp.q.length, q.id).toBeGreaterThan(20);
      expect(zzp.tip.length, q.id).toBeGreaterThan(20);
      expect(zzp.good.length, q.id).toBeGreaterThan(10);
      expect(zzp.q, q.id).not.toMatch(/de zzp'er/i); // jij-vorm, not about someone else
    }
    expect(dbaText(DBA_QUESTIONS[0]!, "opdrachtgever").q).toBe(DBA_QUESTIONS[0]!.q);
  });

  it("keeps the level title but changes the advice for a zzp'er", () => {
    expect(dbaLevelText("hoog", "opdrachtgever")).toEqual(DBA_LEVEL_TEXT.hoog);
    expect(dbaLevelText("hoog", "zzp").title).toBe(DBA_LEVEL_TEXT.hoog.title);
    expect(dbaLevelText("hoog", "zzp").body).not.toBe(DBA_LEVEL_TEXT.hoog.body);
  });

  it.each([
    [0, "laag"],
    [3.5, "laag"],
    [4, "letop"],
    [8.5, "letop"],
    [9, "hoog"],
  ])("%d punten → %s", (score, level) => {
    expect(levelFor(score)).toBe(level);
  });
});
