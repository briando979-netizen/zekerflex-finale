import { beforeEach, describe, expect, it, vi } from "vitest";

// Vergrendelt de fail-open-fix achter de "uren goedkeuren"-crash: als Redis
// (over quota / onbereikbaar) gooit bij het pakken van de lock, mag acquireLock
// NIET gooien maar open vallen met een no-op unlock, zodat de aanroeper door kan
// (die heeft een eigen status-guard tegen dubbel uitvoeren).

const set = vi.fn();
const evalFn = vi.fn();

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    set = (...a: unknown[]) => set(...a);
    eval = (...a: unknown[]) => evalFn(...a);
    on() {
      return this;
    }
  },
}));

async function load() {
  return (await import("@/lib/redis")).acquireLock;
}

beforeEach(() => {
  set.mockReset();
  evalFn.mockReset();
});

describe("acquireLock", () => {
  it("faalt open (no-op unlock, geen throw) als Redis gooit", async () => {
    set.mockRejectedValue(new Error("max requests limit exceeded"));
    const acquireLock = await load();
    const unlock = await acquireLock("klus-123", 1000);
    expect(unlock).toBeTypeOf("function");
    await expect(unlock!()).resolves.toBeUndefined();
    expect(evalFn).not.toHaveBeenCalled();
  });

  it("geeft null als de lock al bezet is", async () => {
    set.mockResolvedValue(null);
    const acquireLock = await load();
    expect(await acquireLock("klus-123", 1000)).toBeNull();
  });

  it("pakt de lock en geeft een unlock die compare-and-delete doet", async () => {
    set.mockResolvedValue("OK");
    evalFn.mockResolvedValue(1);
    const acquireLock = await load();
    const unlock = await acquireLock("klus-123", 1000);
    expect(set).toHaveBeenCalledWith("lock:klus-123", expect.any(String), "PX", 1000, "NX");
    expect(unlock).toBeTypeOf("function");
    await unlock!();
    expect(evalFn).toHaveBeenCalledTimes(1);
  });

  it("de unlock gooit niet als vrijgeven faalt (TTL ruimt het op)", async () => {
    set.mockResolvedValue("OK");
    evalFn.mockRejectedValue(new Error("connection lost"));
    const acquireLock = await load();
    const unlock = await acquireLock("klus-123", 1000);
    await expect(unlock!()).resolves.toBeUndefined();
  });
});
