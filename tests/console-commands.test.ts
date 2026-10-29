import { describe, expect, it } from "vitest";
import { runConsoleCommand, type ConsoleContext } from "@/lib/console/commands";

const ctx: ConsoleContext = { userId: "u1", email: "jan@example.com", fullName: "Jan Jansen" };

describe("runConsoleCommand", () => {
  it("lege invoer geeft lege output zonder fout", async () => {
    expect(await runConsoleCommand("   ", ctx)).toEqual({ output: "", ok: true });
  });

  it("help somt commando's op", async () => {
    const r = await runConsoleCommand("help", ctx);
    expect(r.ok).toBe(true);
    expect(r.output).toContain("whoami");
    expect(r.output).toContain("geen shell");
  });

  it("whoami toont de ingelogde admin", async () => {
    const r = await runConsoleCommand("whoami", ctx);
    expect(r.output).toContain("Jan Jansen");
    expect(r.output).toContain("jan@example.com");
    expect(r.output).toContain("u1");
  });

  it("echo herhaalt de tekst en is hoofdletterongevoelig op de naam", async () => {
    expect((await runConsoleCommand("echo hallo wereld", ctx)).output).toBe("hallo wereld");
    expect((await runConsoleCommand("ECHO x", ctx)).output).toBe("x");
  });

  it("ping → pong", async () => {
    expect((await runConsoleCommand("ping", ctx)).output).toBe("pong");
  });

  it("version en time geven runtime-info", async () => {
    expect((await runConsoleCommand("version", ctx)).output).toContain("Node:");
    expect((await runConsoleCommand("time", ctx)).output).toContain("UTC:");
  });

  it("onbekend commando geeft ok:false met hint", async () => {
    const r = await runConsoleCommand("rm -rf /", ctx);
    expect(r.ok).toBe(false);
    expect(r.output).toContain("Onbekend commando");
  });
});
