import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// De voorpagina na het gebruikersonderzoek van 22 nov 2026 (rapport: punt 9, punt 10 en KAN WEG).

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8").split("\r\n").join("\n");

describe("de voorpagina na het gebruikersonderzoek", () => {
  const home = lees("app/(marketing)/page.tsx");

  it("'Zo ziet de app eruit': de knop gaat echt naar het voorbeeldaccount (of, met alleen-app, eerlijk naar /app)", () => {
    expect(home).not.toContain("Bekijk de app van binnen");
    expect(home).toContain("Zo ziet de app eruit");
    expect(home).toContain('<a href="/voorbeeld/werker"');
    expect(home).toContain("featureEnabled(ALLEEN_APP_VLAG)");
    // de route van het voorbeeld bestaat en opent de werker-app
    expect(lees("app/voorbeeld/werker/route.ts")).toContain('new URL("/dashboard/klussen"');
  });
});
