import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bladeren,
  bouwDeelsWoordenboek,
  genHashKlopt,
  isJuridisch,
  isOomFout,
  loadBesluit,
  maakBatches,
  moetVertaald,
  padSleutel,
  plaatshouders,
  plaatshoudersKlopt,
  renderGenBestand,
  renderGenIndex,
  steekproef,
  trekSteekproef,
  vertaalBladeren,
  vertaalOpdracht,
  vertalingOk,
  type Opdracht,
} from "@/lib/i18n/talen-motor";

const wortel = process.cwd();

describe("talen-motor: bladeren en bewaking", () => {
  it("haalt alleen tekst uit een woordenboek, ook uit lijsten, en slaat functies over", () => {
    const d = { a: "Hallo {naam}", b: { c: ["een", "twee"], f: (n: number) => `${n}`, n: 3 } };
    expect(bladeren(d).map((b) => padSleutel(b.pad))).toEqual(["a", "b.c.0", "b.c.1"]);
  });

  it("controleert dezelfde plaatshouders in bron en vertaling", () => {
    expect(plaatshouders("{b} en {a} en {a}")).toEqual(["a", "a", "b"]);
    expect(plaatshoudersKlopt("Hallo {naam}", "Merhaba {naam}")).toBe(true);
    expect(plaatshoudersKlopt("Hallo {naam}", "Merhaba {isim}")).toBe(false);
    expect(plaatshoudersKlopt("Hallo {naam}", "Merhaba")).toBe(false);
    expect(plaatshoudersKlopt("{n} reviews", "{n} {n} reviews")).toBe(false);
  });

  it("keurt een vertaling af zonder plaatshouder, zonder merknaam, leeg of met gelekte JSON", () => {
    expect(vertalingOk("Welkom bij ZekerFlex", "ZekerFlex'e hoş geldin")).toBe(true);
    expect(vertalingOk("Welkom bij ZekerFlex", "Hoş geldin")).toBe(false);
    expect(vertalingOk("Hallo {naam}", "Merhaba")).toBe(false);
    expect(vertalingOk("Hallo", "   ")).toBe(false);
    expect(vertalingOk("Hallo", { x: 1 })).toBe(false);
    expect(vertalingOk("Hallo", '{"1": "Merhaba"}')).toBe(false);
  });

  it("slaat juridische en identiteitsteksten over en teksten zonder letters", () => {
    expect(isJuridisch(["uitzendContract", "titel"], "Titel")).toBe(true);
    expect(isJuridisch(["loonstrook", "uitleg"], "x")).toBe(true);
    expect(isJuridisch(["profiel", "bsnHint"], "9 cijfers")).toBe(true);
    expect(isJuridisch(["x", "y"], "Je BSN wordt versleuteld bewaard")).toBe(true);
    expect(isJuridisch(["nav", "chat"], "Chat")).toBe(false);
    expect(moetVertaald("★ {n}")).toBe(false);
    expect(moetVertaald("{n} uur")).toBe(true);
  });

  it("maakt kleine batches", () => {
    const items = Array.from({ length: 45 }, (_, i) => ({ bron: `t${i}` }));
    expect(maakBatches(items, 20).map((b) => b.length)).toEqual([20, 20, 5]);
    expect(maakBatches([{ bron: "a".repeat(2000) }, { bron: "b".repeat(2000) }]).length).toBe(2);
  });

  it("de opdracht vraagt om dezelfde sleutels en bewaakt plaatshouders", () => {
    const o = vertaalOpdracht("tr", { "1": "Hallo {naam}" });
    expect(o.system).toContain("Turkish");
    expect(o.system).toContain("{name}");
    expect(JSON.parse(o.user)).toEqual({ "1": "Hallo {naam}" });
  });

  it("load: onder 3 door, 3 t/m 6 wachten, boven 6 stoppen; OOM wordt herkend", () => {
    expect(loadBesluit(2.9)).toBe("door");
    expect(loadBesluit(3)).toBe("wacht");
    expect(loadBesluit(6)).toBe("wacht");
    expect(loadBesluit(6.1)).toBe("stop");
    expect(isOomFout(new Error("llama runner process has terminated: signal: killed"))).toBe(true);
    expect(isOomFout(new Error("model requires more system memory (5 GiB) than is available"))).toBe(true);
    expect(isOomFout(new Error("timeout"))).toBe(false);
  });
});

describe("talen-motor: vertalen", () => {
  const dict = { a: { b: "Hallo {naam}", c: "Tot ziens", d: ["Een", "Twee"] }, e: "Welkom bij ZekerFlex", uitzendContract: { t: "Overeenkomst" }, getal: "12:30" };

  it("vertaalt één verzoek tegelijk, laat mislukte sleutels weg en slaat juridisch en getallen over", async () => {
    let tegelijk = 0;
    let maxTegelijk = 0;
    const vertaler = async (o: Opdracht) => {
      tegelijk++;
      maxTegelijk = Math.max(maxTegelijk, tegelijk);
      await Promise.resolve();
      const items = JSON.parse(o.user) as Record<string, string>;
      const uit: Record<string, string> = {};
      for (const [k, v] of Object.entries(items)) uit[k] = v.includes("ZekerFlex") ? "[tr] Welkom" : `[tr] ${v}`;
      if (Object.keys(items).length > 1) uit["1"] = "[tr] Hallo"; // in de batch raakt de plaatshouder kwijt, in het eigen verzoek niet
      tegelijk--;
      return uit;
    };
    const u = await vertaalBladeren({ bladeren: bladeren(dict), doel: "tr", vertaler });
    expect(maxTegelijk).toBe(1);
    expect(u.gestopt).toBeNull();
    expect(u.gelukt.get("a.b")).toBe("[tr] Hallo {naam}"); // de tweede poging lukt (eigen verzoek)
    expect(u.gelukt.has("uitzendContract.t")).toBe(false);
    expect(u.gelukt.has("getal")).toBe(false);
    expect(u.gelukt.has("e")).toBe(false); // merknaam kwijt -> ook de tweede poging faalt
    expect(u.mislukt).toContain("e");
  });

  it("stopt en geeft het deelresultaat als het voor-verzoek een belemmering gooit", async () => {
    let n = 0;
    const u = await vertaalBladeren({
      bladeren: bladeren(Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`k${i}`, `Tekst ${i}`]))),
      doel: "tr",
      vertaler: async (o) => Object.fromEntries(Object.keys(JSON.parse(o.user) as object).map((k) => [k, "vertaald"])),
      voorVerzoek: async () => {
        if (++n > 1) throw new Error("Gestopt: load 7.0");
      },
    });
    expect(u.gestopt).toContain("load");
  });

  it("zet vertalingen terug in een geneste vorm; een array alleen als hij compleet is", () => {
    const v = new Map([["a.b", "B"], ["a.d.0", "D0"], ["e", "E"]]);
    expect(bouwDeelsWoordenboek(dict, v)).toEqual({ a: { b: "B" }, e: "E" });
    v.set("a.d.1", "D1");
    expect(bouwDeelsWoordenboek(dict, v)).toEqual({ a: { b: "B", d: ["D0", "D1"] }, e: "E" });
  });
});

describe("talen-motor: steekproef", () => {
  const bron = new Map(Array.from({ length: 40 }, (_, i) => [`k${i}`, `Je werkt op dag ${i} bij de bakkerij`] as const));
  const vertaald = new Map([...bron].map(([k, v]) => [k, `[tr] ${v}`] as const));

  it("trekt 20 verschillende sleutels, vast bij een vast toeval", () => {
    const sleutels = [...bron.keys()];
    const a = trekSteekproef(sleutels, 20, () => 0.5);
    expect(a).toHaveLength(20);
    expect(new Set(a).size).toBe(20);
    expect(trekSteekproef(sleutels, 20, () => 0.5)).toEqual(a);
  });

  it("rapporteert het percentage dat klopt, met een rechter", async () => {
    const goed = await steekproef({
      bron, vertaald, doel: "tr",
      terugvertaler: async (o) => JSON.parse(o.user) as Record<string, string>,
      rechter: async (p) => p.map(() => true),
    });
    expect(goed).toMatchObject({ gekozen: 20, klopt: 20, percentage: 100, voldoende: true });
    const slecht = await steekproef({
      bron, vertaald, doel: "tr",
      terugvertaler: async (o) => JSON.parse(o.user) as Record<string, string>,
      rechter: async (p) => p.map((_, i) => i < 10),
    });
    expect(slecht).toMatchObject({ klopt: 10, percentage: 50, voldoende: false });
    expect(slecht.afgekeurd).toHaveLength(10);
  });

  it("valt zonder bruikbare rechter terug op woordovereenkomst", async () => {
    const u = await steekproef({
      bron, vertaald, doel: "tr",
      terugvertaler: async (o) => Object.fromEntries(Object.entries(JSON.parse(o.user) as Record<string, string>).map(([k]) => [k, "Je werkt op dag bij de bakkerij"])),
      rechter: async () => {
        throw new Error("model weg");
      },
    });
    expect(u.percentage).toBe(100);
  });
});

describe("talen-motor: gegenereerd bestand", () => {
  it("bewaakt met een hash dat het bestand niet met de hand is aangepast", () => {
    const f = renderGenBestand({ taal: "tr", gemaakt: "2026-11-13T00:00:00Z", model: "gemma3:4b", bladeren: 1, vertaald: 1, steekproef: { gekozen: 20, klopt: 18, percentage: 90 } }, { nav: { chat: "Sohbet" } });
    expect(f).toContain("GEGENEREERD");
    expect(genHashKlopt(f)).toBe(true);
    expect(genHashKlopt(f.replace("Sohbet", "Chat"))).toBe(false);
  });

  it("de index laadt elke taal apart (dynamische import), nooit statisch", () => {
    const i = renderGenIndex(["tr", "bg"]);
    expect(i).toContain('"bg": () => import("./freelancer.bg")');
    expect(i).not.toMatch(/^import .*freelancer\.(tr|bg)/m);
    expect(genHashKlopt(i)).toBe(true);
  });
});

// Verklikker: de droogmodus doet geen verzoek en schrijft niets; het script praat alleen via de LLM-adapter en bewaakt de load.
describe("scripts/talen-motor.mjs", () => {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const kanTs = major > 22 || (major === 22 && minor >= 6);

  it.skipIf(!kanTs)("--droog telt alleen en doet geen verzoek", () => {
    const r = spawnSync(process.execPath, ["scripts/talen-motor.mjs", "--droog", "--taal", "tr"], { cwd: wortel, encoding: "utf8", timeout: 60_000 });
    expect(r.stderr).not.toMatch(/Error/);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Droog: geen verzoek gedaan, geen bestand geschreven.");
    expect(r.stdout).toMatch(/Te vertalen: \d+ in \d+ batches/);
  });

  it("het script gebruikt de LLM-adapter, bewaakt de load en schrijft alleen met --schrijf", () => {
    const s = readFileSync(join(wortel, "scripts/talen-motor.mjs"), "utf8");
    expect(s).toContain("lib/ai/client.ts");
    expect(s).toContain("loadavg");
    expect(s).not.toMatch(/\bfetch\(|https?:\/\/|from "node:https?"/);
    expect(s).toMatch(/if \(!schrijf\) continue;/);
    expect(s).not.toMatch(/MACHINE_LOCALES\.push|config\.ts", /); // de taal zelf aanzetten is een mensenstap
  });
});