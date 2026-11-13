import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 13 nov, iPhone-app: "Op mijn foto", stap=bundel, "'text/html' is geen JavaScript". Oorzaak (gelezen): de app-modus (middleware.ts, APP_ALLOWED)
// stuurt elk pad dat niet in de lijst staat naar /start, en de middleware vangt ook .mjs, .wasm, .task, .tflite, .bin en .json op (de
// uitzonderingen in de matcher zijn alleen afbeeldingen, lettertypen en tekst). /paskamer stond niet in de lijst: de import kreeg de HTML van /start.
const root = process.cwd();
const middleware = readFileSync(path.join(root, "middleware.ts"), "utf8").split("\r\n").join("\n");

function appToegestaan(): string[] {
  const blok = /const APP_ALLOWED = \[([\s\S]*?)\];/.exec(middleware)?.[1] ?? "";
  return [...blok.replace(/\/\/[^\n]*/g, "").matchAll(/"(\/[a-z0-9/_-]*)"/gi)].map((m) => m[1] ?? "");
}
const toegestaan = (pad: string) => appToegestaan().some((p) => pad === p || pad.startsWith(`${p}/`));

describe("de paskamer in de app-modus (iPhone en Android)", () => {
  const BESTANDEN = [
    "/paskamer/ml/vision_bundle.mjs",
    "/paskamer/ml/wasm/vision_wasm_internal.js",
    "/paskamer/ml/wasm/vision_wasm_internal.wasm",
    "/paskamer/ml/pose_landmarker_lite.task",
    "/paskamer/ml/selfie_segmenter.tflite",
    "/paskamer/3d/manifest.json",
  ];

  it.each(BESTANDEN)("%s bestaat en wordt in de app-modus niet naar /start gestuurd", (pad) => {
    expect(existsSync(path.join(root, "public", pad)), pad).toBe(true);
    expect(toegestaan(pad), pad).toBe(true);
  });

  it("de paskamer-pagina zelf blijft toegestaan (via /shop)", () => {
    expect(toegestaan("/shop/paskamer")).toBe(true);
  });

  it("andere publieke pagina's blijven in de app-modus geweerd", () => {
    for (const pad of ["/prijzen", "/blog", "/hoe-het-werkt", "/paskamerx"]) expect(toegestaan(pad), pad).toBe(false);
  });

  it("de service worker laat deze bestanden met rust: hij onderschept alleen navigaties", () => {
    const sw = readFileSync(path.join(root, "public", "sw.js"), "utf8");
    expect(sw).toContain('if (request.mode !== "navigate") return;');
  });
});