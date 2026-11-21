import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// 21 nov 2026 (eigenaar): tester worden voor de Android-app met een formulier op /app; de aanvragen staan in Beheer → Google Play
// en in Te doen, in plaats van een mail die bij veel mensen niet opent.

const h = vi.hoisted(() => ({ kv: new Map<string, unknown>() }));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => h.kv.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => void h.kv.set(k, v)),
}));

import { metNieuweTester, nogToevoegen, schoonTesterAdres } from "@/lib/app/testers-kern";
import { markeerAllesToegevoegd, testers, verwijderTester, voegTesterToe } from "@/lib/app/testers";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const NU = new Date("2026-11-21T10:00:00+01:00");

describe("tester worden voor de Android-app", () => {
  it("neemt alleen een gewoon e-mailadres aan, in kleine letters", () => {
    expect(schoonTesterAdres("  Jan.Jansen@Gmail.com ")).toBe("jan.jansen@gmail.com");
    expect(schoonTesterAdres("geen-adres")).toBeNull();
    expect(schoonTesterAdres("a@b")).toBeNull();
  });

  it("geen dubbele, nieuwste bovenaan, en de nog toe te voegen adressen met komma's", () => {
    let { lijst, nieuw } = metNieuweTester([], "a@gmail.com", NU);
    expect(nieuw).toBe(true);
    ({ lijst, nieuw } = metNieuweTester(lijst, "b@gmail.com", NU));
    ({ lijst, nieuw } = metNieuweTester(lijst, "a@gmail.com", NU));
    expect(nieuw).toBe(false);
    expect(lijst.map((t) => t.email)).toEqual(["b@gmail.com", "a@gmail.com"]);
    expect(nogToevoegen([...lijst.slice(0, 1), { ...lijst[1]!, toegevoegd: true }])).toBe("b@gmail.com");
  });

  it("de opslag: toevoegen, alles als toegevoegd markeren en wissen", async () => {
    h.kv.clear();
    expect(await voegTesterToe("a@gmail.com", NU)).toBe(true);
    expect(await voegTesterToe("a@gmail.com", NU)).toBe(false);
    await voegTesterToe("b@gmail.com", NU);
    expect((await markeerAllesToegevoegd()).every((t) => t.toegevoegd)).toBe(true);
    expect((await verwijderTester("a@gmail.com")).map((t) => t.email)).toEqual(["b@gmail.com"]);
    expect(await testers()).toHaveLength(1);
  });

  it("de route is openbaar, de beheerroute niet; het formulier staat op /app en de taak in Te doen", () => {
    expect(isPublicApiRoute("/api/app/tester")).toBe(true);
    expect(isPublicApiRoute("/api/admin/app-testers")).toBe(false);
    expect(lees("app/api/admin/app-testers/route.ts")).toContain('withAdminAccess(["PLATFORM_ADMIN"]');
    expect(lees("components/marketing/AppDownload.tsx")).toContain("<TesterWordenForm />");
    expect(lees("components/marketing/AppDownload.tsx")).not.toContain("TESTER_MAILTO}");
    expect(lees("app/admin/google-play/page.tsx")).toContain("<AppTesters />");
    expect(lees("lib/admin/owner-todos.ts")).toContain('id: "app-testers"');
  });
});
