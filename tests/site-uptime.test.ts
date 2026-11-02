import { describe, expect, it, vi } from "vitest";

// Bewaking van beheerde klantsites: pas na twee mislukte metingen offline, en
// precies één melding bij uitvallen en één bij herstel.

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined, kvListValues: async () => [] }));

const { applyProbe, emptyState, uptimePercent, averageMs } = await import("@/lib/website/uptime");

const ok = { ok: true, status: 200, ms: 200, error: null };
const fail = { ok: false, status: null, ms: null, error: "geen antwoord" };
const t = (min: number) => new Date(Date.UTC(2026, 10, 2, 12, min));

describe("uptime-bewaking", () => {
  it("de eerste geslaagde meting zet de site online zonder melding", () => {
    const r = applyProbe(emptyState("bakkerij.nl"), ok, t(0));
    expect(r.state.up).toBe(true);
    expect(r.event).toBeNull();
  });

  it("één hik is geen storing, twee mislukte metingen achter elkaar wel", () => {
    let s = applyProbe(emptyState("bakkerij.nl"), ok, t(0)).state;
    const one = applyProbe(s, fail, t(5));
    expect(one.event).toBeNull();
    expect(one.state.up).toBe(true);
    s = one.state;
    const two = applyProbe(s, fail, t(10));
    expect(two.event).toBe("down");
    expect(two.state.up).toBe(false);
    // de storing begon bij de eerste mislukte meting
    expect(two.state.since).toBe(t(5).toISOString());
    expect(two.state.incidents).toEqual([{ start: t(5).toISOString(), end: null, reason: "geen antwoord" }]);
    // nog een mislukte meting: geen nieuwe melding
    expect(applyProbe(two.state, fail, t(15)).event).toBeNull();
  });

  it("herstel geeft één melding en sluit de storing", () => {
    let s = emptyState("bakkerij.nl");
    for (const [i, p] of [ok, fail, fail, fail].entries()) s = applyProbe(s, p, t(i * 5)).state;
    const back = applyProbe(s, ok, t(20));
    expect(back.event).toBe("up");
    expect(back.state.up).toBe(true);
    expect(back.state.incidents[0]?.end).toBe(t(20).toISOString());
    expect(applyProbe(back.state, ok, t(25)).event).toBeNull();
  });

  it("een hik zonder storing herstelt stil", () => {
    let s = applyProbe(emptyState("bakkerij.nl"), ok, t(0)).state;
    s = applyProbe(s, fail, t(5)).state;
    const r = applyProbe(s, ok, t(10));
    expect(r.event).toBeNull();
    expect(r.state.failStreak).toBe(0);
    expect(r.state.incidents).toEqual([]);
  });

  it("rekent bereikbaarheid en snelheid uit de metingen", () => {
    let s = emptyState("bakkerij.nl");
    for (const [i, p] of [ok, ok, ok, fail].entries()) s = applyProbe(s, p, t(i * 5)).state;
    expect(uptimePercent(s)).toBe(75);
    expect(averageMs(s)).toBe(200);
    expect(uptimePercent(emptyState("x.nl"))).toBeNull();
  });
});
