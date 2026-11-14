import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanOpvolgTodo } from "@/lib/admin/todo-scans";

// Gratis scans die op opvolging wachten (14 nov): stonden alleen in de dagmail aan sales@, nu ook in Beheer → Te doen.

describe("taak: gratis scans opvolgen", () => {
  it("telt wie wacht en wie zelf om contact vroeg; vinkt niet af zolang er iets wacht", () => {
    const t = scanOpvolgTodo({ wachten: 6, aanvragen: 1 })!;
    expect(t.title).toBe("6 gratis scans wachten op opvolging, 1 vroeg zelf om contact");
    expect(t).toMatchObject({ id: "scans-opvolgen", auto: true, done: false });
    expect(scanOpvolgTodo({ wachten: 1, aanvragen: 0 })!.title).toBe("1 gratis scan wacht op opvolging");
    expect(scanOpvolgTodo({ wachten: 3, aanvragen: 2 })!.title).toBe("3 gratis scans wachten op opvolging, 2 vroegen zelf om contact");
  });

  it("niets meer te doen: vinkt zichzelf af", () => {
    expect(scanOpvolgTodo({ wachten: 0, aanvragen: 0 })).toMatchObject({ done: true, doneNote: "er wacht geen scan op opvolging", title: "Gratis scans opvolgen" });
  });

  it("niet kunnen lezen: geen taak (niets vals tonen)", () => {
    expect(scanOpvolgTodo(undefined)).toBeNull();
  });

  it("zegt eerlijk dat er niets vanzelf gaat, en noemt geen namen of adressen", () => {
    const t = scanOpvolgTodo({ wachten: 2, aanvragen: 0 })!;
    expect(t.why).toContain("ZekerFlex mailt dat nooit vanzelf");
    expect([t.title, t.why, ...t.how].join(" ")).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i);
  });

  it("staat in de lijst van Te doen, gevoed door het scanoverzicht", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/admin/owner-todos.ts"), "utf8");
    expect(bron).toContain("scanOpvolgTodo(await wachtendeScans())");
    expect(bron).toContain("...(scanOpvolg ? [scanOpvolg] : [])");
    expect(bron).toContain("scanOverzicht(await lijstScans(2000), now).wachten");
  });
});
