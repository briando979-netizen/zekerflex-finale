import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

// De tweede motor van de Bouwer (deploy/bouwer/werker/claude-motor.mjs, 15 nov 2026): Claude Code zelf in de werkkopie
// op de server, met dezelfde controle, hetzelfde schrijfverbod en hetzelfde goedkeuren als de eigen lus.

type Stroom = {
  sessie?: string | null;
  stappen?: { soort: string; tekst: string }[];
  klaar?: { fout: boolean; tekst: string; sessie: string | null; verbruik: { prompt_tokens: number; completion_tokens: number } };
};
type Motor = {
  CLAUDE_MOTOR: string;
  isClaudeLlm: (llm: unknown) => boolean;
  leesSlot: (t: string) => { vraag?: string; samenvatting?: string; commitbericht?: string };
  leesStroomRegel: (r: string) => Stroom;
};

let m: Motor;
let verbodenPaden: (p: string[]) => string[];

beforeAll(async () => {
  m = (await import(/* @vite-ignore */ new URL("../deploy/bouwer/werker/claude-motor.mjs", import.meta.url).href)) as Motor;
  ({ verbodenPaden } = (await import(/* @vite-ignore */ new URL("../deploy/bouwer/werker/werkkopie.mjs", import.meta.url).href)) as {
    verbodenPaden: (p: string[]) => string[];
  });
});

const SLEUTEL = `sk-ant-oat01-${"a".repeat(40)}`;

describe("welke opdracht naar Claude Code gaat", () => {
  it("alleen met de motor, een sleutel en een gewone modelnaam", () => {
    expect(m.isClaudeLlm({ motor: m.CLAUDE_MOTOR, apiKey: SLEUTEL, model: "opus" })).toBe(true);
    expect(m.isClaudeLlm({ motor: m.CLAUDE_MOTOR, apiKey: "", model: "opus" })).toBe(false);
    expect(m.isClaudeLlm({ motor: m.CLAUDE_MOTOR, apiKey: SLEUTEL, model: "opus; rm -rf /" })).toBe(false);
    expect(m.isClaudeLlm({ baseUrl: "https://generativelanguage.googleapis.com", apiKey: "x", model: "gemini-3.5-flash" })).toBe(false);
    expect(m.isClaudeLlm(null)).toBe(false);
  });
});

describe("de slotregel van Claude", () => {
  it("een samenvatting met COMMIT op de laatste regel", () => {
    expect(m.leesSlot("Ik heb de knop verplaatst.\nZie /admin/sales.\n\nCOMMIT: fix(sales): knop Bellen bovenaan")).toEqual({
      samenvatting: "Ik heb de knop verplaatst.\nZie /admin/sales.",
      commitbericht: "fix(sales): knop Bellen bovenaan",
    });
    expect(m.leesSlot("Klaar, zonder commitregel.").commitbericht).toBe("");
  });

  it("een vraag of plan wacht op de eigenaar", () => {
    expect(m.leesSlot("Ik zie twee pagina's met die naam.\nVRAAG: Bedoel je /bedrijven of /voor-bedrijven?")).toEqual({
      vraag: "Bedoel je /bedrijven of /voor-bedrijven?",
    });
  });
});

describe("de stroom van claude -p --output-format stream-json", () => {
  it("de sessie, de stappen en het resultaat met verbruik", () => {
    expect(m.leesStroomRegel(JSON.stringify({ type: "system", subtype: "init", session_id: "s-123" }))).toEqual({ sessie: "s-123" });
    const stap = m.leesStroomRegel(
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "  Ik kijk eerst naar de pagina.  " },
            { type: "tool_use", name: "Edit", input: { file_path: "app/(marketing)/bedrijven/page.tsx", old_string: "a", new_string: "b" } },
            { type: "tool_use", name: "Bash", input: { command: "npx vitest run tests/x.test.ts" } },
          ],
        },
      }),
    );
    expect(stap.stappen).toEqual([
      { soort: "denk", tekst: "Ik kijk eerst naar de pagina." },
      { soort: "bestand", tekst: "Edit(app/(marketing)/bedrijven/page.tsx)" },
      { soort: "tool", tekst: "Bash(npx vitest run tests/x.test.ts)" },
    ]);
    const klaar = m.leesStroomRegel(
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Klaar.\nCOMMIT: feat: iets",
        session_id: "s-123",
        usage: { input_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 50, output_tokens: 300 },
      }),
    );
    expect(klaar.klaar).toEqual({ fout: false, tekst: "Klaar.\nCOMMIT: feat: iets", sessie: "s-123", verbruik: { prompt_tokens: 2150, completion_tokens: 300 } });
  });

  it("een fout van Claude telt als fout; kapotte of onbekende regels doen niets", () => {
    expect(m.leesStroomRegel(JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "" })).klaar?.fout).toBe(true);
    expect(m.leesStroomRegel("{niet-json")).toEqual({});
    expect(m.leesStroomRegel(JSON.stringify({ type: "user", message: { content: [] } }))).toEqual({});
  });
});

describe("het schrijfverbod geldt ook voor Claude Code", () => {
  it("beveiliging, migraties, pakketten, geheimen, uitrol en paden buiten de codebase", () => {
    const paden = [
      "app/(marketing)/bedrijven/page.tsx",
      "prisma/schema.prisma",
      "lib/auth/session.ts",
      "prisma/migrations/20261115000000_x/migration.sql",
      "package.json",
      ".env.local",
      "deploy/scripts/vps-update.sh",
      "lib/bouwer/werker.ts",
      "../buiten.txt",
    ];
    expect(verbodenPaden(paden)).toEqual([
      "lib/auth/session.ts",
      "prisma/migrations/20261115000000_x/migration.sql",
      "package.json",
      ".env.local",
      "deploy/scripts/vps-update.sh",
      "lib/bouwer/werker.ts",
      "../buiten.txt",
    ]);
  });
});

describe("de werker kiest per opdracht de motor", () => {
  it("server.mjs laat een Claude-opdracht toe, de container heeft Claude Code en geeft het kind geen geheimen", () => {
    const server = readFileSync(new URL("../deploy/bouwer/werker/server.mjs", import.meta.url), "utf8");
    expect(server).toContain("if (isClaudeLlm(llm)) return true;");
    expect(server).toContain("werkMetClaude(taak, llm, log, abort.signal");
    const docker = readFileSync(new URL("../deploy/bouwer/werker/Dockerfile", import.meta.url), "utf8");
    expect(docker).toMatch(/npm install -g @anthropic-ai\/claude-code/);
    const motor = readFileSync(new URL("../deploy/bouwer/werker/claude-motor.mjs", import.meta.url), "utf8");
    expect(motor).toContain("...omgevingZonderSleutel()");
    expect(motor).not.toMatch(/process\.env\.BOUWER_TOKEN/);
  });
});
