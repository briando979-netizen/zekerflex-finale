import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));

import { fillTemplate, getMailTools, withSignature } from "@/lib/mail/tools";

describe("mail tools", () => {
  it("starts with useful templates", async () => {
    const t = await getMailTools("u1");
    expect(t.templates.map((x) => x.id)).toContain("bevestiging");
    expect(t.appendSignature).toBe(true);
  });

  it("fills the known placeholders and leaves {naam} for the sender", () => {
    expect(fillTemplate("Beste {naam}, {datum} — {mijnnaam} van {bedrijf}", { mijnnaam: "Sanne", bedrijf: "Bakkerij", datum: "18 oktober 2026" })).toBe("Beste {naam}, 18 oktober 2026 — Sanne van Bakkerij");
  });

  it("appends the signature once, and only when switched on", () => {
    const sig = { signature: "Sanne\nBakkerij", appendSignature: true };
    const once = withSignature("Hoi!", sig);
    expect(once).toBe("Hoi!\n\n-- \nSanne\nBakkerij");
    expect(withSignature(once, sig)).toBe(once);
    expect(withSignature("Hoi!", { ...sig, appendSignature: false })).toBe("Hoi!");
    expect(withSignature("Hoi!", { signature: "  ", appendSignature: true })).toBe("Hoi!");
  });
});
