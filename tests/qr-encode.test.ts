import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { qrEncode, qrSvgPath, type QrMatrix } from "@/lib/qr/encode";
import { SimplePdf } from "@/lib/pdf/simple";

function hasFinder(m: QrMatrix, x0: number, y0: number): boolean {
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      if (m[y0 + dy]![x0 + dx] !== (ring !== 2)) return false;
    }
  }
  return true;
}

describe("qrEncode", () => {
  it("picks the smallest version that fits at error-correction level M", () => {
    expect(qrEncode("A")).toHaveLength(21); // version 1
    expect(qrEncode("x".repeat(14))).toHaveLength(21); // v1-M holds 14 bytes
    expect(qrEncode("x".repeat(15))).toHaveLength(25); // version 2
    expect(qrEncode("https://www.zekerflex.com/betaal/cmg7x1abc000008l4a2b3c4d5.Xk3_9aQwErTyUiOp12")).toHaveLength(37); // v5
  });

  it("draws the three finder patterns and the alternating timing lines", () => {
    const m = qrEncode("ZekerFlex");
    const n = m.length;
    expect(hasFinder(m, 0, 0)).toBe(true);
    expect(hasFinder(m, n - 7, 0)).toBe(true);
    expect(hasFinder(m, 0, n - 7)).toBe(true);
    for (let i = 8; i < n - 8; i++) {
      expect(m[6]![i]).toBe(i % 2 === 0);
      expect(m[i]![6]).toBe(i % 2 === 0);
    }
  });

  it("is deterministic and matches a reference code that an independent decoder (zxing) read back", () => {
    const m = qrEncode("https://www.zekerflex.com/betaal/test.golden");
    const rows = m.map((r) => r.map((d) => (d ? "1" : "0")).join(""));
    expect(m).toHaveLength(33);
    expect(createHash("sha256").update(rows.join("\n")).digest("hex")).toBe(
      "ad69688acb3f8bfd67a82d63ec8ac6c3158800a3abd70e3cb8c2f96a9a6ddbb6",
    );
  });

  it("refuses data beyond the largest version", () => {
    expect(() => qrEncode("x".repeat(3000))).toThrow(/too long/);
  });
});

describe("rendering", () => {
  it("merges horizontal runs into one SVG rectangle each, offset by the quiet zone", () => {
    expect(qrSvgPath([[true, true, false, true]], 4)).toBe("M4 4h2v1h-2zM7 4h1v1h-1z");
  });

  it("SimplePdf.qr fills one rectangle per dark run", () => {
    const m = qrEncode("https://www.zekerflex.com/betaal/x");
    const runs = m.reduce((sum, row) => sum + row.filter((d, i) => d && !row[i - 1]).length, 0);
    const pdf = new SimplePdf().line("Direct betalen").qr(m, 92).toBuffer().toString("latin1");
    expect(pdf).toContain("0 0 0 rg");
    expect(pdf.match(/ re\n/g)?.length ?? 0).toBe(runs);
    expect(pdf).toMatch(/ re\nf/);
  });
});
