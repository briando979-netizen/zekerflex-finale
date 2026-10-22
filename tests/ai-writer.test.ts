import { afterEach, describe, expect, it, vi } from "vitest";

const chatJson = vi.fn();
const llmConfigProblem = vi.fn<() => string | null>(() => null);
vi.mock("@/lib/ai/client", () => ({
  chatJson: (...a: unknown[]) => chatJson(...a),
  llmConfigProblem: () => llmConfigProblem(),
}));

import { draftMotivation, draftShiftText, profileFor, ruleMotivation, ruleShiftText } from "@/lib/ai/writer";

afterEach(() => {
  vi.clearAllMocks();
  llmConfigProblem.mockReturnValue(null);
});

describe("ruleShiftText", () => {
  it("picks the job family from the title and lists its tasks", () => {
    const out = ruleShiftText({ title: "Magazijnmedewerker avond", branchName: "DC Tilburg", startsAt: "2026-11-02T17:00", endsAt: "2026-11-02T23:00", breakMinutes: 30 });
    expect(out.description).toContain("bij DC Tilburg");
    expect(out.description).toContain("• Orders picken en klaarzetten");
    expect(out.description).toContain("Werktijd: 17:00–23:00, inclusief 30 minuten pauze.");
    expect(out.description).toContain("Neem mee: veiligheidsschoenen");
    expect(out.dresscode).toMatch(/Veiligheidsschoenen/);
  });

  it("keeps what the employer already wrote, and their own dresscode", () => {
    const out = ruleShiftText({ title: "Bediening terras", description: "Druk zomerterras aan het water.", dresscode: "Eigen zwarte schort mee." });
    expect(out.description.startsWith("Druk zomerterras aan het water.")).toBe(true);
    expect(out.dresscode).toBe("Eigen zwarte schort mee.");
  });

  it("falls back to generic tasks for an unknown job", () => {
    expect(profileFor("Ballonnenblazer").tasks[0]).toMatch(/uitvoeren/);
  });

  it("mentions the uitzendbureau when the klus goes through it", () => {
    expect(ruleShiftText({ title: "Kassa", viaUitzendbureau: true }).description).toContain("loonstrook");
  });
});

describe("draftShiftText", () => {
  it("uses the template without calling the model when none is connected", async () => {
    llmConfigProblem.mockReturnValue("geen model");
    const out = await draftShiftText({ title: "Schoonmaker kantoor" });
    expect(out.mode).toBe("rules");
    expect(chatJson).not.toHaveBeenCalled();
  });

  it("returns the model's text when it answers", async () => {
    chatJson.mockResolvedValue({ description: "Kom ons team versterken!", dresscode: "Zwart" });
    const out = await draftShiftText({ title: "Horeca" });
    expect(out).toEqual({ description: "Kom ons team versterken!", dresscode: "Zwart", mode: "model" });
  });

  it("degrades to the template when the model fails or answers empty", async () => {
    chatJson.mockRejectedValueOnce(new Error("down"));
    expect((await draftShiftText({ title: "Horeca" })).mode).toBe("rules");
    chatJson.mockResolvedValueOnce({ description: "  " });
    expect((await draftShiftText({ title: "Horeca" })).mode).toBe("rules");
  });
});

describe("motivation", () => {
  const base = { firstName: "Jan", shiftTitle: "Vakkenvuller", clientName: "Bakkerij Bol", completedShifts: 0, completedForClient: 0, skills: [] };

  it("mentions earlier work for the same client first", () => {
    expect(ruleMotivation({ ...base, completedForClient: 3 })).toContain("al 3 keer bij Bakkerij Bol");
  });

  it("mentions the track record for experienced workers", () => {
    expect(ruleMotivation({ ...base, completedShifts: 12 })).toContain("al 12 diensten");
  });

  it("never invents experience for a newcomer", () => {
    const t = ruleMotivation(base);
    expect(t).toContain("Ik wil graag als vakkenvuller aan de slag bij Bakkerij Bol.");
    expect(t).not.toMatch(/\d+ (keer|diensten)/);
  });

  it("uses the model when connected and the template otherwise", async () => {
    chatJson.mockResolvedValue({ text: "Ik ben je man!" });
    expect(await draftMotivation(base)).toEqual({ text: "Ik ben je man!", mode: "model" });
    llmConfigProblem.mockReturnValue("geen model");
    expect((await draftMotivation(base)).mode).toBe("rules");
  });
});
