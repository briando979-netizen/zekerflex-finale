import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Websitechats beloven "90 dagen bewaren": elke nacht gaan gesprekken weg waar
// zo lang niets in gebeurde, van alle sites, ook als niemand de inbox opent.

const deleteMany = vi.fn(async (args: unknown) => (void args, { count: 4 }));
vi.mock("@/lib/prisma", () => ({ prisma: { keyValueStore: { deleteMany: (a: unknown) => deleteMany(a) } } }));

const { kvDeleteStale } = await import("@/lib/storage/kv");
const { ruimVerlopenGesprekkenOp } = await import("@/lib/sitechat/gesprek");
const { WATCHED_CRONS } = await import("@/lib/ops/heartbeat");

const DAG = 86_400_000;

describe("websitechats opruimen", () => {
  it("wist in één query alles onder sitechat: dat 90 dagen niet is gewijzigd", async () => {
    const nu = Date.parse("2027-03-01T04:55:00Z");
    expect(await ruimVerlopenGesprekkenOp(nu)).toEqual({ gewist: 4 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { key: { startsWith: "sitechat:" }, updatedAt: { lt: new Date(nu - 90 * DAG) } } });
  });

  it("weigert een voorvoegsel dat de hele opslag of een andere naamruimte kan raken", async () => {
    deleteMany.mockClear();
    for (const fout of ["", "sitechat", ":", "%:", "Sitechat:"]) {
      await expect(kvDeleteStale(fout, new Date())).rejects.toThrow(/ongeldig voorvoegsel/);
    }
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("draait elke nacht en wordt bewaakt door de hartslag", () => {
    expect(readFileSync("deploy/cron/entrypoint.sh", "utf8")).toMatch(/^\d+ \d+ \* \* \* wget .*\/api\/internal\/sitechat\/opruimen"$/m);
    expect(WATCHED_CRONS.some((c) => c.job === "sitechat-opruimen" && c.maxAgeHours <= 26)).toBe(true);
  });
});
