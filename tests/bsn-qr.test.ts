import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { bsnVoorstelUitQrTekst, leesBsnUitQr } from "@/lib/kyc/bsn-qr";
import { hashBsn } from "@/lib/fiscal/bsn";

// Het BSN uit de QR-code op de achterkant van een NL-ID-kaart (stap iii, 13 nov). Alleen nagemaakte QR's met verzonnen
// nummers: 999999990 haalt de elfproef (zoals in tests/bsn-uit-document.test.ts), 999999991 niet. De matrices zijn
// eenmalig gemaakt met het pakket qrcode (niveau M, versie 1, 21×21); de test tekent er zelf een "foto" van.

const GELDIG = "999999990";

const QR_GELDIG = [
  "#######....##.#######",
  "#.....#.###...#.....#",
  "#.###.#...##..#.###.#",
  "#.###.#..#..#.#.###.#",
  "#.###.#.#####.#.###.#",
  "#.....#....#..#.....#",
  "#######.#.#.#.#######",
  "..........#..........",
  "#.#.#.#.....#...#..#.",
  "...#....#..#.#.#..#.#",
  "..#.######.#.###.#.##",
  "...#....#..###.######",
  "#.#..#####.#.###.###.",
  "........##....#...#.#",
  "#######..##.#...##.##",
  "#.....#..##...#...###",
  "#.###.#.###.#.#.###.#",
  "#.###.#...##.#.#..##.",
  "#.###.#.#..#.###....#",
  "#.....#..#####.###...",
  "#######.#.##.###..#.#",
];
// 999999991: valt door de elfproef
const QR_ELFPROEF_FOUT = [
  "#######.......#######",
  "#.....#.#.##..#.....#",
  "#.###.#..##...#.###.#",
  "#.###.#...##..#.###.#",
  "#.###.#.#.###.#.###.#",
  "#.....#..#.#..#.....#",
  "#######.#.#.#.#######",
  "..........#..........",
  "#.#.#.#.....#...#..#.",
  "#......#...#.#.#..#.#",
  ".#.#.####..#.###.#.##",
  "...#.#..######.######",
  ".##.####.###.###.###.",
  "........#.....#...#.#",
  "#######..#..#...##.##",
  "#.....#..#....#...###",
  "#.###.#.###.#.#.###.#",
  "#.###.#...##.#.#..##.",
  "#.###.#.#..#.###.#..#",
  "#.....#..#####.###...",
  "#######.####.###..#.#",
];
// "999999990 123456782": twee reeksen van 9 cijfers, geen BSN-QR
const QR_TWEE_REEKSEN = [
  "#######..##.#.#######",
  "#.....#.#.#.#.#.....#",
  "#.###.#...##..#.###.#",
  "#.###.#...#...#.###.#",
  "#.###.#.#.###.#.###.#",
  "#.....#..###..#.....#",
  "#######.#.#.#.#######",
  "..........#..........",
  "#.#.#.#..#..#...#..#.",
  "...###.#.#.#...#..#.#",
  "#....#####.#..#.##.##",
  "...##...#..##########",
  "#...#.##.#.#..#.####.",
  "........##.#..##..#.#",
  "#######.....##...#.##",
  "#.....#....#...#..###",
  "#.###.#.####...#.##.#",
  "#.###.#..##...##..##.",
  "#.###.#.#...#...#...#",
  "#.....#...###..#.#...",
  "#######.#..##.#.#...#",
];

/** Een "foto" van een kaart (licht vlak met verloop), met de QR klein en 4° gedraaid rechtsonder; JPEG zoals een telefoon. */
async function foto(matrix: string[] | null, w = 1000, h = 1400): Promise<Buffer> {
  const n = matrix?.length ?? 0;
  const stil = 4;
  const modPx = 6;
  const qrPx = (n + 2 * stil) * modPx;
  const cx = w - qrPx * 0.8 - 30;
  const cy = h - qrPx * 0.8 - 50;
  const a = (4 * Math.PI) / 180;
  const data = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 210 + 25 * (x / w) - 15 * (y / h);
      if (matrix) {
        const dx = x - cx;
        const dy = y - cy;
        const qx = Math.cos(a) * dx + Math.sin(a) * dy + qrPx / 2;
        const qy = -Math.sin(a) * dx + Math.cos(a) * dy + qrPx / 2;
        if (qx >= 0 && qy >= 0 && qx < qrPx && qy < qrPx) {
          const mx = Math.floor(qx / modPx) - stil;
          const my = Math.floor(qy / modPx) - stil;
          v = mx >= 0 && my >= 0 && mx < n && my < n && matrix[my]?.[mx] === "#" ? 30 : 240;
        }
      }
      const i = (y * w + x) * 3;
      data[i] = v;
      data[i + 1] = v + 2;
      data[i + 2] = v + 6;
    }
  return sharp(data, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
}

describe("de tekst van de QR naar een voorstel (puur)", () => {
  it("precies één reeks van 9 cijfers die de elfproef haalt: hash en laatste 4", () => {
    expect(bsnVoorstelUitQrTekst(GELDIG)).toEqual(hashBsn(GELDIG));
    expect(bsnVoorstelUitQrTekst(" 9999 99990 ")).toEqual(hashBsn(GELDIG)); // witruimte telt niet
  });

  it("geen voorstel bij een foute elfproef, twee reeksen, een te lange reeks of geen tekst", () => {
    expect(bsnVoorstelUitQrTekst("999999991")).toBeNull();
    expect(bsnVoorstelUitQrTekst("999999990 123456782")).toBeNull();
    expect(bsnVoorstelUitQrTekst("9999999901")).toBeNull();
    expect(bsnVoorstelUitQrTekst("12345678")).toBeNull();
    expect(bsnVoorstelUitQrTekst("")).toBeNull();
    expect(bsnVoorstelUitQrTekst(null)).toBeNull();
  });

  it("het voorstel bevat de 9 cijfers nergens", () => {
    expect(JSON.stringify(bsnVoorstelUitQrTekst(GELDIG))).not.toContain(GELDIG);
  });
});

describe("de QR op een foto (sharp + jsQR)", () => {
  it("vindt het BSN op een nagemaakte achterkant", async () => {
    const v = await leesBsnUitQr([await foto(QR_GELDIG)], 10_000);
    expect(v).toEqual(hashBsn(GELDIG));
    expect(JSON.stringify(v)).not.toContain(GELDIG);
  });

  it("verwisselde foto's: zoekt ook op de andere foto", async () => {
    expect(await leesBsnUitQr([await foto(null), await foto(QR_GELDIG)], 10_000)).toEqual(hashBsn(GELDIG));
  });

  it("foute elfproef, twee reeksen of geen QR: geen voorstel", async () => {
    expect(await leesBsnUitQr([await foto(QR_ELFPROEF_FOUT)], 10_000)).toBeNull();
    expect(await leesBsnUitQr([await foto(QR_TWEE_REEKSEN)], 10_000)).toBeNull();
    expect(await leesBsnUitQr([await foto(null)], 10_000)).toBeNull();
  });

  it("een kapotte foto of een verlopen tijdslimiet: stil null, nooit een fout", async () => {
    expect(await leesBsnUitQr([Buffer.from("geen beeld")], 10_000)).toBeNull();
    let t = 0;
    const klok = () => (t += 5_000); // elke stap "duurt" 5 s
    expect(await leesBsnUitQr([await foto(QR_GELDIG)], 2_000, klok)).toBeNull();
  });
});
