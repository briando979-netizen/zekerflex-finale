// ---------------------------------------------------------------------------
// Multi-page, dependency-free PDF writer for ZekerFlex whitepapers. A4,
// Helvetica standard-14 (no embedded fonts, so Latin-1 text only). Produces a
// branded cover page plus flowing content pages with headings, bullets and
// note boxes, page numbers and a running footer. Same PDF-1.4 byte approach as
// lib/pdf/simple.ts — no external libraries.
// ---------------------------------------------------------------------------

import { WHITEPAPERS, type Whitepaper } from "@/lib/kennis/whitepapers";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 64;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = 72;

const INK: RGB = [0.047, 0.055, 0.071];
const MINT: RGB = [0.31, 0.878, 0.627];
const BODY: RGB = [0.2, 0.23, 0.26];
const MUTED: RGB = [0.42, 0.45, 0.48];
const HAIR: RGB = [0.86, 0.86, 0.83];
const NOTEBG: RGB = [0.93, 0.98, 0.95];

type RGB = [number, number, number];

class Writer {
  private pages: string[][] = [];
  private cur: string[] = [];
  private y = 0;
  private pageNo = 0;

  constructor(private readonly wp: Whitepaper) {}

  build(): Buffer {
    this.cover();
    this.newContentPage();
    this.paragraph(this.wp.intro, 11.5, BODY, 6);
    this.gap(8);
    for (const s of this.wp.sections) {
      this.sectionHeading(s.heading);
      for (const b of s.blocks) {
        if (b.t === "p") this.paragraph(b.text, 10.5, BODY, 5);
        else if (b.t === "h3") this.subHeading(b.text);
        else if (b.t === "ul") this.bullets(b.items);
        else if (b.t === "note") this.note(b.text);
      }
      this.gap(10);
    }
    this.flushPage();
    return this.assemble();
  }

  // ---- pages -------------------------------------------------------------

  private cover(): void {
    const p: string[] = [];
    // full-bleed ink background
    p.push(`${rg(INK)} 0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)} re f`);
    // mint accent bar
    p.push(`${rg(MINT)} ${MARGIN} ${(PAGE_H - 150).toFixed(2)} 132 6 re f`);
    // brand glyph, top-left
    p.push(glyph(MARGIN, PAGE_H - 128, 60));
    // wordmark
    p.push(text("ZekerFlex", MARGIN + 74, PAGE_H - 108, 20, true, [1, 1, 1]));
    // title (wrapped, large)
    let ty = PAGE_H - 300;
    for (const ln of wrap(this.wp.title, 34, true)) {
      p.push(text(ln, MARGIN, ty, 34, true, [1, 1, 1]));
      ty -= 40;
    }
    ty -= 6;
    for (const ln of wrap(this.wp.subtitle, 15, false)) {
      p.push(text(ln, MARGIN, ty, 15, false, MINT));
      ty -= 21;
    }
    // footer
    p.push(text("Whitepaper", MARGIN, 110, 12, false, [0.6, 0.63, 0.68]));
    p.push(
      text(
        `Bijgewerkt ${nlDate(this.wp.updated)}  ·  zekerflex.com`,
        MARGIN,
        90,
        10,
        false,
        [0.6, 0.63, 0.68],
      ),
    );
    this.pages.push(p);
  }

  private newContentPage(): void {
    if (this.cur.length) this.flushPage();
    this.cur = [];
    this.pageNo += 1;
    // running header
    this.cur.push(glyph(MARGIN, PAGE_H - 46, 16));
    this.cur.push(
      text(
        latin1(`ZekerFlex — ${this.wp.title}`),
        MARGIN + 24,
        PAGE_H - 40,
        8.5,
        false,
        MUTED,
      ),
    );
    this.cur.push(`${rg(HAIR)} 0.7 w ${MARGIN} ${(PAGE_H - 56).toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${(PAGE_H - 56).toFixed(2)} l S`);
    // footer
    this.cur.push(text(`${this.pageNo}`, PAGE_W - MARGIN - 6, 44, 9, false, MUTED));
    this.cur.push(text("zekerflex.com", MARGIN, 44, 9, false, MUTED));
    this.y = PAGE_H - 84;
  }

  private flushPage(): void {
    if (this.cur.length) {
      this.pages.push(this.cur);
      this.cur = [];
    }
  }

  private ensure(space: number): void {
    if (this.y - space < BOTTOM) this.newContentPage();
  }

  // ---- content primitives ---------------------------------------------

  private gap(h: number): void {
    this.y -= h;
  }

  private sectionHeading(t: string): void {
    this.ensure(46);
    this.y -= 14;
    this.cur.push(`${rg(MINT)} ${MARGIN} ${(this.y + 14).toFixed(2)} 26 3 re f`);
    for (const ln of wrap(t, 15.5, true)) {
      this.y -= 19;
      this.cur.push(text(ln, MARGIN, this.y, 15.5, true, INK));
    }
    this.y -= 8;
  }

  private subHeading(t: string): void {
    this.ensure(26);
    this.y -= 16;
    for (const ln of wrap(t, 11.5, true)) {
      this.cur.push(text(ln, MARGIN, this.y, 11.5, true, INK));
      this.y -= 15;
    }
    this.y -= 2;
  }

  private paragraph(t: string, size: number, color: RGB, lead: number): void {
    for (const ln of wrap(t, size, false)) {
      this.ensure(size + lead);
      this.y -= size + lead;
      this.cur.push(text(ln, MARGIN, this.y, size, false, color));
    }
    this.y -= 4;
  }

  private bullets(items: string[]): void {
    for (const it of items) {
      const lines = wrap(it, 10.5, false, CONTENT_W - 16);
      lines.forEach((ln, i) => {
        this.ensure(16);
        this.y -= 15;
        if (i === 0) this.cur.push(text("-", MARGIN, this.y, 10.5, true, MINT));
        this.cur.push(text(ln, MARGIN + 16, this.y, 10.5, false, BODY));
      });
      this.y -= 3;
    }
    this.y -= 3;
  }

  private note(t: string): void {
    const lines = wrap(`Let op: ${t}`, 10, false, CONTENT_W - 28);
    const h = lines.length * 14 + 20;
    this.ensure(h + 10);
    const top = this.y;
    this.cur.push(`${rg(NOTEBG)} ${MARGIN} ${(top - h).toFixed(2)} ${CONTENT_W.toFixed(2)} ${h.toFixed(2)} re f`);
    this.cur.push(`${rg(MINT)} ${MARGIN} ${(top - h).toFixed(2)} 3 ${h.toFixed(2)} re f`);
    let ly = top - 16;
    for (const ln of lines) {
      this.cur.push(text(ln, MARGIN + 14, ly, 10, false, [0.12, 0.32, 0.24]));
      ly -= 14;
    }
    this.y = top - h - 10;
  }

  // ---- assembly -------------------------------------------------------

  private assemble(): Buffer {
    const objs: string[] = [];
    const pageObjNums: number[] = [];
    // 1 Catalog, 2 Pages, 3 F1, 4 F2, then per page: [Page obj, Content obj]
    objs.push(""); // placeholder for catalog (obj 1)
    objs.push(""); // placeholder for pages (obj 2)
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    for (const page of this.pages) {
      const content = page.join("\n");
      const contentObjNum = objs.length + 2; // 1-indexed, +1 for content after page obj
      const pageObjNum = objs.length + 1;
      pageObjNums.push(pageObjNum);
      objs.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>`,
      );
      objs.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    }

    objs[0] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[1] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjNums.length} >>`;

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

export function renderWhitepaperPdf(wp: Whitepaper): Buffer {
  return new Writer(wp).build();
}

export function whitepaperPdfFilename(wp: Whitepaper): string {
  return `ZekerFlex-whitepaper-${wp.slug}.pdf`;
}

export function allWhitepaperSlugs(): string[] {
  return WHITEPAPERS.map((w) => w.slug);
}

// ---- low-level helpers ------------------------------------------------

function rg([r, g, b]: RGB): string {
  return `${r} ${g} ${b} rg`;
}

function text(s: string, x: number, y: number, size: number, bold: boolean, color: RGB): string {
  const t = escapePdf(latin1(s));
  return `BT ${rg(color)} /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${t}) Tj ET`;
}

/** Word-wrap to a pixel width (default: full content width). */
function wrap(s: string, size: number, bold: boolean, maxW = CONTENT_W): string[] {
  const words = latin1(s).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (helvWidth(test, size, bold) > maxW && line) {
      out.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]+/g, " ");
}

function latin1(s: string): string {
  return s
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u20AC/g, "\u0080") // WinAnsi euro sign
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function nlDate(iso: string): string {
  const d = new Date(iso);
  const m = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
}

/** Brand glyph: ink squircle + skewed ZF ligature, drawn in PDF coords. */
function glyph(x: number, y: number, size: number): string {
  const s = size / 512;
  // skew + flip: SVG (px,py) with matrix(1,0,-0.1228,1,31,0), then flip vertically
  const P = (px: number, py: number): [number, number] => {
    const sx = px - 0.1228 * py + 31;
    return [x + sx * s, y + (512 - py) * s];
  };
  const rrect = `${rg(INK)} ${x.toFixed(2)} ${y.toFixed(2)} ${size.toFixed(2)} ${size.toFixed(2)} re f`;
  const w = (46 * s).toFixed(2);
  const seg = (pts: [number, number][]) =>
    pts.map(([a, b], i) => `${a.toFixed(2)} ${b.toFixed(2)} ${i === 0 ? "m" : "l"}`).join(" ") + " S";
  const white = "1 1 1 RG";
  const z = seg([P(104, 150), P(250, 150), P(104, 372), P(262, 372)]);
  const fStem = seg([P(300, 372), P(300, 150), P(424, 150)]);
  const fArm = seg([P(300, 258), P(396, 258)]);
  return `${rrect}\n${white} ${w} w 1 J 0 j\n${z}\n${fStem}\n${fArm}`;
}

// Helvetica AFM widths per-1000 em (WinAnsi printable range we use).
const HELV: Record<string, number> = {
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
  z: 500, "{": 334, "|": 260, "}": 334, "~": 584, "\u0080": 556,
};

function helvWidth(t: string, size: number, bold: boolean): number {
  let w = 0;
  for (const ch of t) w += HELV[ch] ?? 556;
  // Helvetica-Bold runs ~6% wider on average; good enough for wrapping.
  return (w / 1000) * size * (bold ? 1.06 : 1);
}
