import { describe, expect, it } from "vitest";
import { fallbackAnswer, smallTalk, topicAnswer, withSuggestions } from "@/lib/chat/public-intents";

describe("public chat assistant without a model", () => {
  it.each(["hoi", "Hoi!", "hallo", "hey", "goedemorgen", "Hi"])("greets back on %s with options", (t) => {
    const r = smallTalk(t);
    expect(r?.reply).toMatch(/Goede(morgen|middag|avond|nacht)! 👋/);
    expect(r?.suggestions.length).toBeGreaterThan(2);
  });

  it("handles thanks, goodbye and who-are-you", () => {
    expect(smallTalk("bedankt!")?.reply).toContain("Graag gedaan");
    expect(smallTalk("doei")?.reply).toContain("Tot ziens");
    expect(smallTalk("ben je een robot?")?.reply).toContain("digitale assistent");
  });

  it("doesn't treat a real question as small talk", () => {
    expect(smallTalk("hoi, hoe snel word ik uitbetaald na mijn klus van vandaag?")).toBeNull();
  });

  it("answers the common topics, including the new ones", () => {
    expect(topicAnswer("hoe snel krijg ik mijn geld")?.reply).toContain("1 minuut");
    expect(topicAnswer("wat is zekerflex bank")?.reply).toContain("eigen rekening");
    expect(topicAnswer("ik heb geen kvk")?.reply).toContain("uitzendkracht");
    expect(topicAnswer("hoe moet ik inchecken")?.reply).toContain("check je in");
    expect(topicAnswer("ik zoek personeel voor mijn restaurant")?.reply).toContain("€ 3,50");
  });

  it("sends follow-ups in the widget's wire format", () => {
    expect(withSuggestions({ reply: "A", suggestions: ["x", "y"] })).toBe("A\n[[x|y]]");
    expect(withSuggestions(fallbackAnswer())).toContain("support@zekerflex.com");
  });
});
