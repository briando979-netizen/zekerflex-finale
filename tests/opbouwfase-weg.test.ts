import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";
import { openbareRoutes } from "@/lib/ops/rondgang";

// 22 nov 2026: de pagina /opbouwfase ("nog in de opbouwfase") klopt niet meer: de app staat in de App Store (nog niet in de EU,
// daar via TestFlight) en in een testgroep op Google Play, de voorbeeldaccounts zijn gewist. Oude links gaan voorgoed naar de
// voorpagina. De melding op het werkgeversstartscherm (vlag opbouwfase-melding) is bewust niet aangeraakt.

const ROOT = process.cwd();
type Regel = { source: string; destination: string; permanent: boolean };

describe("/opbouwfase is weg", () => {
  it("het oude adres stuurt voorgoed (308) door naar de voorpagina", async () => {
    const mod = (await import(pathToFileURL(path.join(ROOT, "next.config.mjs")).href)) as { default: { redirects: () => Promise<Regel[]> } };
    const regels = await mod.default.redirects();
    expect(regels.find((r) => r.source === "/opbouwfase")).toMatchObject({ destination: "/", permanent: true });
  });

  it("de pagina is weg en staat niet meer in de routelijst of de rondgang", () => {
    expect(existsSync(path.join(ROOT, "app/(marketing)/opbouwfase/page.tsx"))).toBe(false);
    expect(APP_PAGES.some((p) => p.route === "/opbouwfase")).toBe(false);
    expect(openbareRoutes()).not.toContain("/opbouwfase");
  });
});
