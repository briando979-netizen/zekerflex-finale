import { beforeEach, describe, expect, it, vi } from "vitest";

// Hartslagronde (13 nov 2026): de opwarmtik van het eigen model meldde "Geplande taak mislukt: ai-warm" aan de eigenaar als
// alle rekensloten bezet waren (8, 10 en 11 nov om 06:04 en 12:04, na de zware taken van 06:00 en 12:00). Een bezet model
// is geladen: dat telt nu als geslaagd. Een echte storing blijft een storing.

const h = vi.hoisted(() => ({ fout: null as unknown, runs: [] as boolean[] }));

vi.mock("@/lib/redis", () => ({ redis: {} }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/internal-auth", () => ({ checkInternalToken: () => ({ ok: true }) }));
vi.mock("@/lib/metrics", () => ({ recordCronRun: (_job: string, ok: boolean) => void h.runs.push(ok) }));
vi.mock("@/lib/ai/gratis", () => ({ primeGratis: async () => undefined, gratisAan: () => true, gratisModel: () => "gemma3:4b" }));
vi.mock("@/lib/chat/publiek-begin", () => ({ vastBegin: async () => [] }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null }));
vi.mock("@/lib/bouwer/live", () => ({ K_STATUS: "bouwer:live:status", uitrolHoudtModelStil: () => false }));
vi.mock("@/lib/ai/client", () => ({
  chat: async () => {
    if (h.fout) throw h.fout;
    return { text: "" };
  },
  embed: async () => [0],
}));

import { AppError } from "@/lib/errors";
import { AI_BEZET, isAiBezet } from "@/lib/ai/governor";
import { GET } from "@/app/api/internal/ai/warm/route";

const tik = async () => (await GET(new Request("http://app:3000/api/internal/ai/warm"))).json() as Promise<{ ok: boolean; overgeslagen?: string }>;

beforeEach(() => {
  h.fout = null;
  h.runs.length = 0;
});

describe("opwarmen terwijl het model bezig is", () => {
  it("de melding 'rekensloten bezet' is herkenbaar, andere fouten niet", () => {
    expect(isAiBezet(AppError.upstream(AI_BEZET))).toBe(true);
    expect(isAiBezet(new Error("LLM request timed out after 40000ms"))).toBe(false);
    expect(isAiBezet("AI-budget: alle rekensloten bezet, probeer later.")).toBe(false);
  });

  it("alle rekensloten bezet: geslaagd en overgeslagen, geen melding", async () => {
    h.fout = AppError.upstream(AI_BEZET);
    expect(await tik()).toMatchObject({ ok: true, overgeslagen: "model bezig" });
    expect(h.runs).toEqual([true]);
  });

  it("een echte storing (time-out) blijft een mislukte run", async () => {
    h.fout = new Error("LLM request timed out after 40000ms");
    expect(await tik()).toMatchObject({ ok: false });
    expect(h.runs).toEqual([false]);
  });

  it("gelukt: gewoon geslaagd", async () => {
    expect(await tik()).toMatchObject({ ok: true });
    expect(h.runs).toEqual([true]);
  });
});
