import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clientDict } from "@/lib/i18n/server";
import { nl } from "@/lib/i18n/dictionaries";

// De browser krijgt alleen het Nederlandse woordenboek mee; Engels komt per
// pagina van de server (clientDict → <I18nProvider t>). Eén verkeerde import in
// een client-component zet alle talen weer in elke shop- en werkgeverspagina.

const ROOT = process.cwd();
function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const clientFiles = [...sourceFiles("app"), ...sourceFiles("components")].filter((f) => /^\s*["']use client["']/.test(read(f)));

describe("talen in de browsercode", () => {
  it("geen client-component haalt het Engelse woordenboek of de serverhelpers binnen", () => {
    expect(clientFiles.length).toBeGreaterThan(50);
    const wrong = clientFiles.filter((f) => /from ["']@\/lib\/i18n\/(dictionary-en|server)["']/.test(read(f)));
    expect(wrong).toEqual([]);
  });

  it("het gedeelde woordenboek en de provider trekken geen andere talen mee", () => {
    expect(read("lib/i18n/dictionaries.ts")).not.toMatch(/from ["'][^"']*(dictionary-en|freelancer)["']/);
    expect(read("components/i18n/I18nProvider.tsx")).not.toMatch(/from ["']@\/lib\/i18n\/(dictionary-en|freelancer|auth)["']/);
  });

  it("Nederlands gaat niet mee met de pagina, de andere talen krijgen Engels", () => {
    expect(clientDict("nl")).toBeUndefined();
    expect(clientDict("en")?.reviewPrompt.title).toBe("Rate your flex workers");
    for (const l of ["pl", "ro", "uk"] as const) expect(clientDict(l)).toBe(clientDict("en"));
    expect(nl.reviewPrompt.title).toBe("Beoordeel je flexwerkers");
  });
});
