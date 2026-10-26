import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "@/lib/clipboard";

// Vergrendelt het fail-safe gedrag achter de client-side-exception die de
// "Kopiëren"-knop veroorzaakte: navigator.clipboard bestaat niet in elke
// context, dus copyText moet terugvallen en NOOIT gooien.

function fakeDoc(exec: boolean | (() => never)) {
  const ta = { value: "", setAttribute: vi.fn(), style: {} as Record<string, string>, focus: vi.fn(), select: vi.fn() };
  const execCommand = typeof exec === "function" ? vi.fn(exec) : vi.fn(() => exec);
  const doc = { createElement: vi.fn(() => ta), body: { appendChild: vi.fn(), removeChild: vi.fn() }, execCommand };
  return { doc, ta, execCommand };
}

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("gebruikt de Clipboard API in een veilige context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("window", { isSecureContext: true });
    expect(await copyText("hallo")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hallo");
  });

  it("valt terug op execCommand als navigator.clipboard ontbreekt", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { isSecureContext: true });
    const { doc, execCommand } = fakeDoc(true);
    vi.stubGlobal("document", doc);
    expect(await copyText("x")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("valt terug op execCommand buiten een veilige context", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("window", { isSecureContext: false });
    const { doc, execCommand } = fakeDoc(true);
    vi.stubGlobal("document", doc);
    expect(await copyText("x")).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalled();
  });

  it("valt terug als writeText een rejected promise geeft (gooit niet)", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("window", { isSecureContext: true });
    const { doc, execCommand } = fakeDoc(true);
    vi.stubGlobal("document", doc);
    expect(await copyText("x")).toBe(true);
    expect(execCommand).toHaveBeenCalled();
  });

  it("gooit nooit en geeft false als alles faalt", async () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("window", undefined);
    const { doc } = fakeDoc(() => {
      throw new Error("execCommand kapot");
    });
    vi.stubGlobal("document", doc);
    await expect(copyText("x")).resolves.toBe(false);
  });
});
