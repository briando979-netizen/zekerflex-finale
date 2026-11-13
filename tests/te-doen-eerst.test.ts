import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REDEN_VOLGORDE, datumNl, geldigeDatum, kiesBeginHier, type EerstReden, type EerstTodo } from "@/lib/admin/te-doen-eerst";

// Beheer -> Te doen, "Begin hier": de sortering, het verdwijnen van afgevinkte taken en wat er in de bron staat.

const NU = new Date("2026-11-14T10:00:00+01:00");

const todo = (id: string, eerst: EerstTodo["eerst"], done = false): EerstTodo => ({ id, title: `Taak ${id}`, why: "waarom", how: ["stap 1"], done, eerst });

describe("kiesBeginHier", () => {
  it("neemt alleen open taken met een reden mee; afgevinkte taken verdwijnen vanzelf", () => {
    const lijst = [todo("a", { reden: "wettelijk" }), todo("b", { reden: "geld binnen" }, true), todo("c", undefined), todo("d", { reden: "bezorging" })];
    expect(kiesBeginHier(lijst, NU).map((i) => i.todo.id)).toEqual(["a", "d"]);
    // afgevinkt: dezelfde taak is er niet meer
    expect(kiesBeginHier(lijst.map((t) => ({ ...t, done: true })), NU)).toEqual([]);
  });

  it("sorteert op uiterste datum (vroegst eerst, zonder datum achteraan), dan op de volgorde van de redenen", () => {
    const lijst = [
      todo("zonder-bezorging", { reden: "bezorging" }),
      todo("laat", { reden: "wettelijk", uiterlijk: "2026-12-31" }),
      todo("zonder-geld", { reden: "geld binnen" }),
      todo("vroeg", { reden: "wettelijk", uiterlijk: "2026-12-09" }),
      todo("zonder-wettelijk", { reden: "wettelijk" }),
      todo("zonder-gegevens", { reden: "gegevens kwijt" }),
    ];
    expect(kiesBeginHier(lijst, NU, 10).map((i) => i.todo.id)).toEqual(["vroeg", "laat", "zonder-wettelijk", "zonder-gegevens", "zonder-geld", "zonder-bezorging"]);
  });

  it("bij dezelfde datum geldt wettelijk > gegevens kwijt > geld binnen > bezorging", () => {
    expect(REDEN_VOLGORDE).toEqual(["wettelijk", "gegevens kwijt", "geld binnen", "bezorging"]);
    const lijst = (["bezorging", "geld binnen", "gegevens kwijt", "wettelijk"] as EerstReden[]).map((r) => todo(r, { reden: r, uiterlijk: "2026-12-01" }));
    expect(kiesBeginHier(lijst, NU).map((i) => i.reden)).toEqual(REDEN_VOLGORDE);
  });

  it("toont er hooguit vijf", () => {
    const lijst = Array.from({ length: 9 }, (_, i) => todo(`t${i}`, { reden: "geld binnen" }));
    expect(kiesBeginHier(lijst, NU)).toHaveLength(5);
  });

  it("een verlopen datum blijft bovenaan en wordt als verlopen getoond", () => {
    const lijst = [todo("later", { reden: "wettelijk", uiterlijk: "2026-12-09" }), todo("voorbij", { reden: "bezorging", uiterlijk: "2026-11-01" })];
    const r = kiesBeginHier(lijst, NU);
    expect(r[0]?.todo.id).toBe("voorbij");
    expect(r[0]?.verlopen).toBe(true);
    expect(r[0]?.zin).toContain("verlopen");
    expect(r[1]?.verlopen).toBe(false);
  });

  it("rekent met de Amsterdamse dag: vlak voor middernacht UTC is het al de volgende dag", () => {
    const lijst = [todo("a", { reden: "wettelijk", uiterlijk: "2026-11-15" })];
    expect(kiesBeginHier(lijst, new Date("2026-11-14T10:00:00+01:00"))[0]?.dagenOver).toBe(1);
    expect(kiesBeginHier(lijst, new Date("2026-11-14T23:30:00Z"))[0]?.dagenOver).toBe(0);
  });

  it("de zin zegt waarom en noemt de datum in gewoon Nederlands", () => {
    const [a] = kiesBeginHier([todo("w", { reden: "wettelijk", uiterlijk: "2026-12-31" })], NU);
    expect(a?.zin).toBe("Dit is wettelijk verplicht, en het moet uiterlijk 31 december 2026 klaar zijn (nog 47 dagen).");
    const [b] = kiesBeginHier([todo("g", { reden: "geld binnen" })], NU);
    expect(b?.zin).toBe("Zonder dit kan er geen geld binnenkomen.");
  });

  it("een datum die geen echte datum is, wordt genegeerd (geen datum)", () => {
    const [x] = kiesBeginHier([todo("x", { reden: "wettelijk", uiterlijk: "2026-02-31" })], NU);
    expect(x?.uiterlijk).toBeNull();
    expect(x?.verlopen).toBe(false);
  });
});

describe("datums", () => {
  it("geldigeDatum en datumNl", () => {
    expect(geldigeDatum("2026-12-09")).toBe(true);
    expect(geldigeDatum("2026-13-01")).toBe(false);
    expect(geldigeDatum("2026-02-30")).toBe(false);
    expect(geldigeDatum("9-12-2026")).toBe(false);
    expect(datumNl("2026-12-09")).toBe("9 december 2026");
  });
});

describe("de taken in de bron", () => {
  const ROOT = process.cwd();
  const bestanden = () => {
    const dir = path.join(ROOT, "lib", "admin");
    return readdirSync(dir)
      .filter((n) => n === "owner-todos.ts" || /^todo-.*\.ts$/.test(n))
      .map((n) => path.join(dir, n));
  };
  const EERST = /eerst:\s*\{\s*reden:\s*"([^"]+)"(?:,\s*uiterlijk:\s*"([^"]+)")?\s*\}/g;

  it("elke taak met eerst heeft een bekende reden en een echte datum (of geen datum)", () => {
    let aantal = 0;
    for (const f of bestanden()) {
      for (const m of readFileSync(f, "utf8").matchAll(EERST)) {
        aantal += 1;
        expect(REDEN_VOLGORDE as string[], `${path.basename(f)}: ${m[1]}`).toContain(m[1]);
        if (m[2]) expect(geldigeDatum(m[2]), `${path.basename(f)}: ${m[2]}`).toBe(true);
      }
    }
    // niet te veel: alleen wat echt blokkeert
    expect(aantal).toBeGreaterThan(3);
    expect(aantal).toBeLessThanOrEqual(8);
  });

  it("de wettelijke termijnen komen uit de projectnotities: Wtta 31 december 2026, 83(b) 9 december 2026", () => {
    const tekst = readFileSync(path.join(ROOT, "lib", "admin", "owner-todos.ts"), "utf8");
    expect(tekst).toContain('eerst: { reden: "wettelijk", uiterlijk: "2026-12-31" }');
    expect(tekst).toContain('eerst: { reden: "wettelijk", uiterlijk: "2026-12-09" }');
  });
});
