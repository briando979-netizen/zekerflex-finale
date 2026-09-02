// ---------------------------------------------------------------------------
// Minimal, dependency-free PDF writer. Enough for invoices / agreements /
// payslips: A4, Helvetica, text lines, headings, rules and simple two-column
// rows. Produces a valid PDF 1.4 byte buffer. No fonts embedded (uses the PDF
// standard-14 Helvetica), so only WinAnsi/Latin-1 text is safe — callers pass
// text through `latin1()` which strips anything outside it.
// ---------------------------------------------------------------------------

const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const MARGIN = 56;

type Align = "left" | "right";

interface Op {
  kind: "text" | "rule" | "gap";
  text?: string;
  size?: number;
  bold?: boolean;
  align?: Align;
  x?: number; // absolute x for right-aligned or columns
  color?: [number, number, number];
  height?: number; // gap
}

export class SimplePdf {
  private ops: Op[] = [];

  heading(text: string, size = 18): this {
    this.ops.push({ kind: "text", text, size, bold: true });
    this.ops.push({ kind: "gap", height: 6 });
    return this;
  }

  line(text = "", size = 10.5, opts: { bold?: boolean; color?: [number, number, number] } = {}): this {
    this.ops.push({ kind: "text", text, size, bold: opts.bold ?? false, ...(opts.color ? { color: opts.color } : {}) });
    return this;
  }

  row(label: string, value: string, opts: { bold?: boolean; size?: number } = {}): this {
    const size = opts.size ?? 10.5;
    this.ops.push({ kind: "text", text: label, size, bold: opts.bold ?? false });
    this.ops.push({ kind: "text", text: value, size, bold: opts.bold ?? false, align: "right", x: PAGE_W - MARGIN });
    return this;
  }

  rule(): this {
    this.ops.push({ kind: "rule" });
    return this;
  }

  gap(height = 10): this {
    this.ops.push({ kind: "gap", height });
    return this;
  }

  private buildContent(): string {
    const parts: string[] = [];
    let y = PAGE_H - MARGIN;
    // true right after a left-aligned text line, so a following right-aligned
    // value renders on the same baseline (a label/value row).
    let canPairRight = false;

    for (const op of this.ops) {
      if (op.kind === "gap") {
        y -= op.height ?? 10;
        canPairRight = false;
        continue;
      }
      if (op.kind === "rule") {
        y -= 6;
        parts.push(
          `0.85 0.85 0.85 RG 0.7 w ${MARGIN.toFixed(2)} ${y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${y.toFixed(
            2,
          )} l S`,
        );
        y -= 12;
        canPairRight = false;
        continue;
      }
      // text
      const size = op.size ?? 10.5;
      const font = op.bold ? "F2" : "F1";
      const isRight = op.align === "right";

      if (isRight && canPairRight) {
        // stay on the current baseline (pair with the label just drawn)
      } else {
        y -= size + 5;
      }

      const text = escapePdf(latin1(op.text ?? ""));
      const width = isRight ? helveticaWidth(latin1(op.text ?? ""), size) : 0;
      const x = isRight ? (op.x ?? PAGE_W - MARGIN) - width : MARGIN;
      const [r, g, b] = op.color ?? [0.09, 0.13, 0.11];
      parts.push(`BT ${r} ${g} ${b} rg /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${text}) Tj ET`);

      canPairRight = !isRight;
      if (y < MARGIN + 30) break; // single page only — truncate rather than overflow
    }
    return parts.join("\n");
  }

  toBuffer(): Buffer {
    const content = this.buildContent();
    const objs: string[] = [];
    objs.push("<< /Type /Catalog /Pages 2 0 R >>");
    objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    );
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const stream = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
    objs.push(stream);

    let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets: number[] = [];
    objs.forEach((body, i) => {
      offsets.push(Buffer.byteLength(pdf, "latin1"));
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefPos = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    return Buffer.from(pdf, "latin1");
  }
}

function latin1(s: string): string {
  // Replace common typographic chars, then drop anything non-Latin-1.
  return s
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u20AC/g, "EUR ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

// Helvetica AFM widths (per-1000 em) for the WinAnsi printable range we care
// about. Anything unmapped falls back to 500 — right-alignment stays close.
const HELV_W: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
  "@": 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278,
  J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667,
  T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, "[": 278, "\\": 278,
  "]": 278, "^": 469, _: 556, "`": 333, a: 556, b: 556, c: 500, d: 556, e: 556,
  f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556,
  p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500,
  z: 500, "{": 334, "|": 260, "}": 334, "~": 584,
};

function helveticaWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += HELV_W[ch] ?? 500;
  return (w / 1000) * size;
}
