// Maakt de eigen stickerset van de chat (15 nov 2026) in public/chat-stickers/<id>.svg. Eén stijl: een witte rand eromheen
// (zoals een uitgesneden sticker), de kleuren van ZekerFlex, geen tekst in het plaatje (de naam staat in vijf talen in de
// chatteksten). Alleen vormen, geen scripts en niets van buiten.
// Gebruik: node scripts/chat-stickers.mjs   (vanuit de projectmap; overschrijft public/chat-stickers/*.svg)
// Een nieuwe sticker: hier tekenen, het id in lib/messaging/stickers.ts en de naam in vijf talen (stickerNamen).
import fs from "node:fs";
import path from "node:path";
const uit = path.join(process.cwd(), "public", "chat-stickers");
fs.mkdirSync(uit, { recursive: true });

const C = { groen: "#0E5C4A", mint: "#4FE0A0", donker: "#083A2F", goud: "#F5C451", geel: "#FFD25A", koraal: "#FF5A6E", blauw: "#2563EB", lucht: "#5BB8F5", violet: "#9B7BF0", roze: "#FF8FA3", wit: "#FFFFFF" };
// de uitgesneden rand: dezelfde vorm, dik wit omlijnd, onder de echte vorm
const rand = (vorm) => vorm.replace(/fill="[^"]*"/, `fill="${C.wit}"`).replace("/>", ` stroke="${C.wit}" stroke-width="14" stroke-linejoin="round"/>`);
const svg = (binnen) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">${binnen}</svg>\n`;
const ster = (cx, cy, R, r, n = 5) => {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (-90 + (i * 180) / n) * (Math.PI / 180);
    const s = i % 2 ? r : R;
    p.push(`${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`);
  }
  return p.join(" ");
};
const gezicht = `<circle cx="80" cy="80" r="60" fill="${C.geel}"/>`;

const S = {
  duim: (() => {
    const vuist = `<rect x="56" y="70" width="54" height="56" rx="14" fill="${C.geel}"/>`;
    const duim = `<rect x="62" y="30" width="22" height="54" rx="11" fill="${C.geel}"/>`;
    const mouw = `<rect x="34" y="68" width="22" height="62" rx="6" fill="${C.groen}"/>`;
    return [rand(vuist), rand(duim), rand(mouw), mouw, vuist, duim,
      `<g stroke="${C.donker}" stroke-width="4" stroke-linecap="round" fill="none"><path d="M84 84h22M84 98h22M84 112h20"/><rect x="56" y="70" width="54" height="56" rx="14"/><path d="M62 72V41a11 11 0 0 1 22 0v31"/></g>`,
      `<circle cx="45" cy="80" r="4" fill="${C.mint}"/>`].join("");
  })(),
  hart: (() => {
    const v = `<path d="M80 134C30 100 20 64 46 44c16-12 30-4 34 8 4-12 18-20 34-8 26 20 16 56-34 90Z" fill="${C.koraal}"/>`;
    return rand(v) + v + `<ellipse cx="56" cy="62" rx="11" ry="6" fill="${C.wit}" opacity=".55" transform="rotate(-35 56 62)"/>`;
  })(),
  ster: (() => {
    const v = `<polygon points="${ster(80, 84, 62, 27)}" fill="${C.goud}"/>`;
    return rand(v) + v + `<polygon points="${ster(80, 84, 36, 16)}" fill="#FFE08A"/>` +
      `<polygon points="${ster(132, 30, 14, 4, 4)}" fill="${C.mint}"/><polygon points="${ster(26, 128, 11, 3, 4)}" fill="${C.mint}"/>`;
  })(),
  koffie: (() => {
    const kop = `<path d="M40 66h76v32c0 22-14 32-34 32h-8c-20 0-34-10-34-32Z" fill="${C.groen}"/>`;
    const schotel = `<ellipse cx="78" cy="134" rx="50" ry="8" fill="${C.donker}"/>`;
    return rand(schotel) + rand(kop) + schotel + kop +
      `<path d="M116 76h6a14 14 0 0 1 0 28h-8" fill="none" stroke="${C.wit}" stroke-width="16" stroke-linecap="round"/><path d="M116 76h6a14 14 0 0 1 0 28h-8" fill="none" stroke="${C.groen}" stroke-width="8" stroke-linecap="round"/>` +
      `<ellipse cx="78" cy="67" rx="36" ry="7" fill="#7A4A2E"/>` +
      `<g fill="none" stroke="#9AA9A3" stroke-width="5" stroke-linecap="round"><path d="M62 52c-6-7 0-14 0-20"/><path d="M78 50c-6-7 0-14 0-22"/><path d="M94 52c-6-7 0-14 0-20"/></g>` +
      `<path d="M58 84v22" stroke="${C.mint}" stroke-width="6" stroke-linecap="round"/>`;
  })(),
  onderweg: (() => {
    const v = `<path d="M92 132s32-36 32-64a32 32 0 0 0-64 0c0 28 32 64 32 64Z" fill="${C.blauw}"/>`;
    return rand(v) + v + `<circle cx="92" cy="66" r="13" fill="${C.wit}"/>` +
      `<g stroke="${C.wit}" stroke-width="15" stroke-linecap="round"><path d="M18 58h22M12 78h26M20 98h20"/></g><g stroke="${C.blauw}" stroke-width="7" stroke-linecap="round"><path d="M18 58h22M12 78h26M20 98h20"/></g>`;
  })(),
  klaar: (() => {
    const v = `<circle cx="80" cy="80" r="60" fill="${C.groen}"/>`;
    return rand(v) + v + `<path d="M50 82l20 20 42-44" fill="none" stroke="${C.mint}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`;
  })(),
  helm: (() => {
    const koepel = `<path d="M32 104c0-34 20-58 48-58s48 24 48 58Z" fill="${C.goud}"/>`;
    const klep = `<rect x="20" y="98" width="120" height="18" rx="9" fill="#E0A42A"/>`;
    return rand(koepel) + rand(klep) + koepel + klep + `<rect x="72" y="46" width="16" height="54" rx="7" fill="#E0A42A"/><path d="M48 92c2-14 8-24 16-30" fill="none" stroke="#FFE08A" stroke-width="6" stroke-linecap="round"/>`;
  })(),
  klok: (() => {
    const v = `<circle cx="80" cy="80" r="58" fill="${C.wit}"/>`;
    return rand(v) + `<circle cx="80" cy="80" r="54" fill="${C.wit}" stroke="${C.blauw}" stroke-width="10"/>` +
      `<g fill="${C.blauw}"><rect x="76" y="32" width="8" height="12" rx="3"/><rect x="76" y="116" width="8" height="12" rx="3"/><rect x="32" y="76" width="12" height="8" rx="3"/><rect x="116" y="76" width="12" height="8" rx="3"/></g>` +
      `<g stroke="${C.donker}" stroke-width="8" stroke-linecap="round"><path d="M80 80V50"/><path d="M80 80l22 12"/></g><circle cx="80" cy="80" r="7" fill="${C.koraal}"/>`;
  })(),
  feest: (() => {
    const v = `<polygon points="28,134 60,62 100,102" fill="${C.violet}"/>`;
    return rand(v) + v + `<g stroke="${C.wit}" stroke-width="6" stroke-linecap="round"><path d="M44 98l22 22"/><path d="M52 80l28 28"/></g>` +
      `<circle cx="112" cy="40" r="7" fill="${C.koraal}"/><circle cx="88" cy="28" r="5" fill="${C.mint}"/><circle cx="134" cy="76" r="5" fill="${C.lucht}"/>` +
      `<rect x="118" y="56" width="14" height="7" rx="2" fill="${C.goud}" transform="rotate(30 125 59)"/><rect x="70" y="40" width="12" height="6" rx="2" fill="${C.goud}" transform="rotate(-25 76 43)"/>` +
      `<path d="M98 66c8-4 6-12 14-14s8-10 14-10" fill="none" stroke="${C.blauw}" stroke-width="5" stroke-linecap="round"/>` +
      `<polygon points="${ster(136, 112, 10, 3, 4)}" fill="${C.goud}"/>`;
  })(),
  zon: (() => {
    const stralen = [0, 45, 90, 135, 180, 225, 270, 315].map((g) => {
      const a = (g * Math.PI) / 180;
      return `M${(80 + 48 * Math.cos(a)).toFixed(1)} ${(80 + 48 * Math.sin(a)).toFixed(1)}L${(80 + 64 * Math.cos(a)).toFixed(1)} ${(80 + 64 * Math.sin(a)).toFixed(1)}`;
    }).join("");
    const kern = `<circle cx="80" cy="80" r="36" fill="#FFC93C"/>`;
    return `<path d="${stralen}" stroke="${C.wit}" stroke-width="22" stroke-linecap="round"/><path d="${stralen}" stroke="#FFC93C" stroke-width="11" stroke-linecap="round"/>` + rand(kern) + kern +
      `<g fill="none" stroke="${C.donker}" stroke-width="5" stroke-linecap="round"><path d="M64 76q5-6 10 0M86 76q5-6 10 0"/><path d="M66 90q14 12 28 0"/></g><circle cx="60" cy="88" r="5" fill="${C.koraal}" opacity=".5"/><circle cx="100" cy="88" r="5" fill="${C.koraal}" opacity=".5"/>`;
  })(),
  maan: (() => {
    // sikkel als echte vorm: buitencirkel (74,84) r52 min binnencirkel (104,62) r42, via de twee snijpunten
    const [x1, y1, r1, x2, y2, r2] = [74, 84, 52, 104, 62, 42];
    const d = Math.hypot(x2 - x1, y2 - y1);
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(r1 * r1 - a * a);
    const mx = x1 + (a * (x2 - x1)) / d, my = y1 + (a * (y2 - y1)) / d;
    const P = [mx + (h * (y2 - y1)) / d, my - (h * (x2 - x1)) / d].map((n) => n.toFixed(1));
    const Q = [mx - (h * (y2 - y1)) / d, my + (h * (x2 - x1)) / d].map((n) => n.toFixed(1));
    const v = `<path d="M${P[0]} ${P[1]}A${r1} ${r1} 0 1 0 ${Q[0]} ${Q[1]}A${r2} ${r2} 0 0 1 ${P[0]} ${P[1]}Z" fill="#7C6BE0"/>`;
    return rand(v) + v +
      `<path d="M44 92q8 8 16 0" fill="none" stroke="${C.wit}" stroke-width="5" stroke-linecap="round"/>` +
      `<polygon points="${ster(126, 108, 13, 4, 4)}" fill="${C.goud}"/><polygon points="${ster(136, 40, 9, 3, 4)}" fill="${C.goud}"/><polygon points="${ster(110, 22, 6, 2, 4)}" fill="${C.goud}"/>`;
  })(),
  lach: rand(gezicht) + gezicht +
    `<g fill="none" stroke="${C.donker}" stroke-width="6" stroke-linecap="round"><path d="M50 68q10-12 20 0M90 68q10-12 20 0"/></g>` +
    `<path d="M46 86q34 52 68 0Z" fill="${C.donker}"/><ellipse cx="80" cy="110" rx="15" ry="8" fill="${C.koraal}"/>` +
    `<path d="M30 80q-8 14 0 18q8-4 0-18Z" fill="${C.lucht}"/><path d="M130 80q-8 14 0 18q8-4 0-18Z" fill="${C.lucht}"/>`,
  sorry: rand(gezicht) + gezicht +
    `<g fill="${C.donker}"><circle cx="60" cy="74" r="6"/><circle cx="100" cy="74" r="6"/></g>` +
    `<g fill="none" stroke="${C.donker}" stroke-width="5" stroke-linecap="round"><path d="M50 62l16-6M110 62l-16-6"/><path d="M56 106q8-6 16 0t16 0t16 0"/></g>` +
    `<path d="M124 34q-12 18 0 24q12-6 0-24Z" fill="${C.lucht}" stroke="${C.wit}" stroke-width="4" stroke-linejoin="round"/>`,
  bloem: (() => {
    const bladen = [0, 60, 120, 180, 240, 300].map((g) => {
      const a = ((g - 90) * Math.PI) / 180;
      return `<circle cx="${(80 + 26 * Math.cos(a)).toFixed(1)}" cy="${(62 + 26 * Math.sin(a)).toFixed(1)}" r="20" fill="${C.roze}"/>`;
    });
    const steel = `<path d="M80 86v58" stroke="${C.groen}" stroke-width="8" stroke-linecap="round"/>`;
    const blad = `<path d="M80 120c-20 0-30-12-32-22 14 0 28 6 32 22Z" fill="${C.mint}"/>`;
    return `<path d="M80 86v58" stroke="${C.wit}" stroke-width="20" stroke-linecap="round"/>` + rand(blad) + bladen.map(rand).join("") + steel + blad + bladen.join("") + `<circle cx="80" cy="62" r="16" fill="${C.goud}"/><circle cx="74" cy="58" r="4" fill="#FFE08A"/>`;
  })(),
  wow: rand(gezicht) + gezicht +
    `<g fill="${C.wit}"><circle cx="60" cy="70" r="12"/><circle cx="100" cy="70" r="12"/></g><g fill="${C.donker}"><circle cx="60" cy="72" r="6"/><circle cx="100" cy="72" r="6"/></g>` +
    `<ellipse cx="80" cy="108" rx="13" ry="16" fill="${C.donker}"/>` +
    `<g fill="none" stroke="${C.donker}" stroke-width="5" stroke-linecap="round"><path d="M48 48q12-8 22-2M112 48q-12-8-22-2"/></g>`,
};

for (const [id, binnen] of Object.entries(S)) fs.writeFileSync(path.join(uit, `${id}.svg`), svg(binnen));
console.log(`${Object.keys(S).length} stickers in ${uit}: ${Object.keys(S).join(", ")}`);
