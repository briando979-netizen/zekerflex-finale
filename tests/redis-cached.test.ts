import { beforeEach, describe, expect, it, vi } from "vitest";

// Borgt dat de cache-helper FAIL-OPEN is: valt Redis weg of is het Upstash-quotum
// vol ("max requests limit exceeded"), dan berekent cached() gewoon opnieuw i.p.v.
// te gooien — zodat een volle quota geen cache-gedekte feature meer platlegt.

const get = vi.fn();
const set = vi.fn();

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    get = (...a: unknown[]) => get(...a);
    set = (...a: unknown[]) => set(...a);
    on() {
      return this;
    }
  },
}));

async function load() {
  return (await import("@/lib/redis")).cached;
}

beforeEach(() => {
  get.mockReset();
  set.mockReset();
});

describe("cached — fail-open", () => {
  it("geeft de cache-hit terug zonder produce aan te roepen", async () => {
    get.mockResolvedValue(JSON.stringify({ v: 1 }));
    const cached = await load();
    const produce = vi.fn();
    expect(await cached("k", 60, produce)).toEqual({ v: 1 });
    expect(produce).not.toHaveBeenCalled();
  });

  it("berekent en cachet bij een miss", async () => {
    get.mockResolvedValue(null);
    set.mockResolvedValue("OK");
    const cached = await load();
    expect(await cached("k", 60, async () => ({ v: 2 }))).toEqual({ v: 2 });
    expect(set).toHaveBeenCalledWith("k", JSON.stringify({ v: 2 }), "EX", 60);
  });

  it("faalt open als Redis-get gooit (quotum vol): berekent gewoon", async () => {
    get.mockRejectedValue(new Error("max requests limit exceeded"));
    set.mockRejectedValue(new Error("max requests limit exceeded"));
    const cached = await load();
    expect(await cached("k", 60, async () => ({ v: 3 }))).toEqual({ v: 3 });
  });

  it("negeert een falende set en geeft toch de waarde", async () => {
    get.mockResolvedValue(null);
    set.mockRejectedValue(new Error("down"));
    const cached = await load();
    expect(await cached("k", 60, async () => ({ v: 4 }))).toEqual({ v: 4 });
  });
});
