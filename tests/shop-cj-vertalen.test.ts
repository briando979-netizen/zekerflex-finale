import { beforeEach, describe, expect, it, vi } from "vitest";

// De CJ-vertaling met remmen (18 nov 2026, lib/shop/cj/vertalen.ts): één tegelijk, korte prompt, en na een storing van het
// model vijf minuten geen nieuwe vertalingen (de tekst blijft Engels, het product wacht op de volgende Bijwerken-ronde).

vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const chatJson = vi.fn();
vi.mock("@/lib/ai/client", () => ({ chatJson: (...a: unknown[]) => chatJson(...a) }));

import { AppError } from "@/lib/errors";
import { OMSCHRIJVING_MAX, STORING_MS, VERTAAL_MAX_TOKENS, vertaalStoringActief, vertaalStoringWis, vertaalVermelding } from "@/lib/shop/cj/vertalen";

const ok = { naam: "Tuinslang 20 meter", omschrijving: "Een flexibele tuinslang van 20 meter met koppelstukken. Handig voor het besproeien van de tuin." };

beforeEach(() => {
  chatJson.mockReset();
  vertaalStoringWis();
  vi.useRealTimers();
});

describe("CJ-vertaling", () => {
  it("vertaalt met een korte prompt: hooguit 700 tekens bron en 400 tokens antwoord", async () => {
    chatJson.mockResolvedValueOnce(ok);
    const lang = "x".repeat(2000);
    const r = await vertaalVermelding("Garden Hose 20m", lang);
    expect(r).toEqual({ ...ok, vertaald: true });
    const opts = chatJson.mock.calls[0]?.[0] as { maxTokens: number; messages: { content: string }[] };
    expect(opts.maxTokens).toBe(VERTAAL_MAX_TOKENS);
    const user = opts.messages[1]!.content;
    expect(user.length).toBeLessThanOrEqual(OMSCHRIJVING_MAX + 60);
    expect(user).toContain("Omschrijving: " + "x".repeat(OMSCHRIJVING_MAX));
    expect(user).not.toContain("x".repeat(OMSCHRIJVING_MAX + 1));
  });

  it("een half Duits antwoord krijgt één herkansing; daarna de Engelse tekst", async () => {
    chatJson.mockResolvedValueOnce({ naam: "Goldaufkleber 16 Stücke", omschrijving: "Aufkleber aus Gold für die Wand, mit vielen Stücken." }).mockResolvedValueOnce(ok);
    expect((await vertaalVermelding("Gold stickers", "16 pieces")).vertaald).toBe(true);
    expect(chatJson).toHaveBeenCalledTimes(2);
    chatJson.mockReset();
    chatJson.mockResolvedValue({ naam: "Goldaufkleber 16 Stücke", omschrijving: "Aufkleber aus Gold für die Wand, mit vielen Stücken." });
    expect(await vertaalVermelding("Gold stickers", "16 pieces")).toEqual({ naam: "Gold stickers", omschrijving: "16 pieces", vertaald: false });
    expect(chatJson).toHaveBeenCalledTimes(2);
  });

  it("na een storing van het model vijf minuten geen vertalingen meer; daarna weer wel", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T15:00:00Z"));
    chatJson.mockRejectedValueOnce(AppError.upstream("LLM niet bereikbaar (fetch failed)."));
    expect((await vertaalVermelding("Garden Hose", "20 m")).vertaald).toBe(false);
    expect(vertaalStoringActief()).toBe(true);
    chatJson.mockResolvedValue(ok);
    expect((await vertaalVermelding("Garden Hose", "20 m")).vertaald).toBe(false);
    expect(chatJson).toHaveBeenCalledTimes(1); // niet nog eens tegen een dode runner
    vi.setSystemTime(new Date(Date.now() + STORING_MS + 1));
    expect(vertaalStoringActief()).toBe(false);
    expect((await vertaalVermelding("Garden Hose", "20 m")).vertaald).toBe(true);
    expect(chatJson).toHaveBeenCalledTimes(2);
  });

  it("een onleesbaar antwoord (geen JSON) is geen storing: het model is er, de volgende vertaling gaat gewoon door", async () => {
    chatJson.mockRejectedValueOnce(new Error("Kon geen JSON vinden in het antwoord"));
    expect((await vertaalVermelding("Garden Hose", "20 m")).vertaald).toBe(false);
    expect(vertaalStoringActief()).toBe(false);
    chatJson.mockResolvedValueOnce(ok);
    expect((await vertaalVermelding("Garden Hose", "20 m")).vertaald).toBe(true);
  });

  it("strikt één tegelijk: twee gelijktijdige vertalingen lopen nooit door elkaar", async () => {
    let bezig = 0;
    let piek = 0;
    chatJson.mockImplementation(async () => {
      bezig++;
      piek = Math.max(piek, bezig);
      await new Promise((r) => setTimeout(r, 20));
      bezig--;
      return ok;
    });
    const uit = await Promise.all([vertaalVermelding("A", "a"), vertaalVermelding("B", "b"), vertaalVermelding("C", "c")]);
    expect(uit.every((u) => u.vertaald)).toBe(true);
    expect(piek).toBe(1);
    expect(chatJson).toHaveBeenCalledTimes(3);
  });
});
