import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Twee valkuilen uit AGENTS.md die al eens een pagina sloopten, nu bewaakt over de hele code:
// 1. `waarde in TABEL` op een vaste tabel (HOOFDLETTERS): "constructor" uit een URL, cookie of body telt dan als sleutel
//    (/p/<slug>/constructor gaf een 500). Gebruik Object.hasOwn(TABEL, waarde).
// 2. useEffect(() => <expressie>): een waarde die geen opruimfunctie is (een Promise van load(), het object van scrollIntoView)
//    roept React als cleanup aan en de pagina valt om ("u is not a function"). Schrijf useEffect(() => { void load(); }, …).
// Een bewuste uitzondering komt in de basislijn, met reden; de lijst mag alleen kleiner worden.

const IN_TABEL: Record<string, { max: number; reden: string }> = {};
const EFFECT: Record<string, { max: number; reden: string }> = {};

const ROOT = process.cwd();
function bestanden(dir: string, uit: string[] = []): string[] {
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) bestanden(rel, uit);
    else if (/\.tsx?$/.test(e.name)) uit.push(rel);
  }
  return uit;
}
const BRON = ["app", "lib", "components"].flatMap((d) => bestanden(d));
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

/** Zonder commentaar en zonder de inhoud van tekenreeksen (daar staat gewone tekst als "geldig in VIES"). */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, "``");
}

const IN_RE = /(?:^|[^\w.$\"'`])[a-z_$][\w.$]*(?:\?\.[\w$]+)* in [A-Z][A-Z_0-9]{2,}\b/gm;
function inTabel(src: string): number {
  const zonder = code(src).replace(/\bfor\s*\(\s*(?:const|let|var)\s+[\w$]+\s+in\s/g, "for (");
  return [...zonder.matchAll(IN_RE)].length;
}

// useEffect/useLayoutEffect waarvan de functie meteen een expressie teruggeeft die zelf geen (pijl)functie is.
const EFFECT_RE = /\buse(?:Layout)?Effect\(\s*(?:async\b|\(\s*\)\s*=>(?!\s*\{)(?!\s*\(\s*\)\s*=>)(?!\s*function\b)(?!\s*\(\s*\(\s*\)\s*=>))/g;
function effectZonderAccolades(src: string): number {
  return [...code(src).matchAll(EFFECT_RE)].length;
}

function tegenBasislijn(tel: (s: string) => number, basis: Record<string, { max: number; reden: string }>) {
  const gevonden: Record<string, number> = {};
  for (const f of BRON) {
    const n = tel(lees(f));
    if (n) gevonden[f] = n;
  }
  const teVeel = Object.entries(gevonden)
    .filter(([f, n]) => n > (basis[f]?.max ?? 0))
    .map(([f, n]) => `${f}: ${n} (basislijn ${basis[f]?.max ?? 0})`);
  const teHoog = Object.entries(basis)
    .filter(([f, b]) => (gevonden[f] ?? 0) < b.max)
    .map(([f, b]) => `${f}: ${gevonden[f] ?? 0} gevonden, basislijn ${b.max}`);
  return { teVeel, teHoog };
}

describe("valkuil: `x in TABEL` op een vaste tabel", () => {
  it("de scan loopt over de hele code", () => {
    expect(BRON.length).toBeGreaterThan(500);
  });

  it("herkent de valkuil en laat commentaar, tekst en for…in met rust", () => {
    expect(inTabel("if (v && v in COPY) return v;")).toBe(1);
    expect(inTabel("if (!(input.type in CERT_TYPES)) throw x;")).toBe(1);
    expect(inTabel("ok = quick.name in QUERIES;")).toBe(1);
    expect(inTabel("if (Object.hasOwn(COPY, v)) return v;")).toBe(0);
    expect(inTabel("const nu = amsterdamParts(d); // de server draait in UTC")).toBe(0);
    expect(inTabel('const t = "geldig in VIES";')).toBe(0);
    expect(inTabel("{/* de foto's staan in CREDITS */}")).toBe(0);
    expect(inTabel("for (const k in TABEL) n += 1;")).toBe(0);
    expect(inTabel('if ("constructor" in TABEL) x();')).toBe(0);
  });

  it("geen `waarde in TABEL` buiten de basislijn: gebruik Object.hasOwn(TABEL, waarde)", () => {
    const { teVeel, teHoog } = tegenBasislijn(inTabel, IN_TABEL);
    expect(teVeel).toEqual([]);
    expect(teHoog).toEqual([]);
  });

  it("elke uitzondering heeft een reden", () => {
    for (const [f, b] of Object.entries(IN_TABEL)) expect(b.reden.length, f).toBeGreaterThan(10);
  });
});

describe("valkuil: useEffect geeft een waarde terug", () => {
  it("herkent de valkuil en laat opruimfuncties en blokken met rust", () => {
    expect(effectZonderAccolades("useEffect(() => load(), [id]);")).toBe(1);
    expect(effectZonderAccolades("useEffect(() => ref.current?.scrollIntoView({ block: 'end' }), [n]);")).toBe(1);
    expect(effectZonderAccolades("useLayoutEffect(() => meet(), []);")).toBe(1);
    expect(effectZonderAccolades("useEffect(async () => { await x(); }, []);")).toBe(1);
    expect(effectZonderAccolades("useEffect(() => { void load(); }, [id]);")).toBe(0);
    expect(effectZonderAccolades("useEffect(() => () => clearInterval(t), []);")).toBe(0);
    expect(effectZonderAccolades("useEffect(() => function stop() {}, []);")).toBe(0);
    expect(effectZonderAccolades("useEffect(\n  () => {\n    void load();\n  },\n  [id],\n);")).toBe(0);
    expect(effectZonderAccolades("// useEffect(() => load(), [id]) mocht vroeger")).toBe(0);
  });

  it("geen useEffect(() => <expressie>) buiten de basislijn", () => {
    const { teVeel, teHoog } = tegenBasislijn(effectZonderAccolades, EFFECT);
    expect(teVeel, "schrijf useEffect(() => { void …; }, …): een effect geeft alleen een opruimfunctie terug").toEqual([]);
    expect(teHoog).toEqual([]);
  });

  it("elke uitzondering heeft een reden", () => {
    for (const [f, b] of Object.entries(EFFECT)) expect(b.reden.length, f).toBeGreaterThan(10);
  });
});
