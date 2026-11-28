// Markeert de zinnen in een teksten-bestand van de site met vt("…") (28 nov 2026, lib/i18n/site.ts), zodat
// scripts/site-teksten.mjs ze vindt. Alleen een tekst als waarde van een eigenschap met een "tekstnaam" (titel, tekst, kop, …)
// of als element van een lijst onder zo'n naam (punten); nooit een pad, url of bestandsnaam.
//   node scripts/site-markeren.mjs [--proef] <bestand…>
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

export const TEKSTNAMEN = new Set([
  "titel", "title", "tekst", "text", "kop", "kopAccent", "lead", "eyebrow", "knop", "knop2", "vraag", "q", "a", "alt", "fotoAlt",
  "naam", "label", "omschrijving", "beschrijving", "description", "uitleg", "intro", "slot", "sub", "ondertitel", "subtitel",
  "cta", "ctaTekst", "desc", "sub", "body", "primaryLabel", "secondaryLabel", "caption", "subtitle", "punten", "voordelen", "bullets", "regels", "stappen", "antwoord", "melding", "hint", "toelichting", "badge",
]);
const lijktTekst = (s) => /\p{L}/u.test(s) && !/^(\/|https?:|mailto:|tel:|#)/u.test(s) && !/\.(jpe?g|png|webp|svg|mp4|webm|pdf)$/iu.test(s);

export function markeer(pad, schrijf) {
  const bron = readFileSync(pad, "utf8");
  const sf = ts.createSourceFile(pad, bron, ts.ScriptTarget.ESNext, true, pad.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const wijzigingen = [];
  const naamVan = (p) => (p && ts.isPropertyAssignment(p) ? p.name.getText().replace(/["']/g, "") : null);
  function bezoek(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && lijktTekst(node.text)) {
      const ouder = node.parent;
      let naam = null;
      if (ts.isPropertyAssignment(ouder) && ouder.initializer === node) naam = naamVan(ouder);
      else if (ts.isArrayLiteralExpression(ouder)) naam = naamVan(ouder.parent);
      // al gemarkeerd (vt("…")) of een sleutel/import: overslaan
      const alVt = ts.isCallExpression(ouder) && ouder.expression.getText() === "vt";
      if (naam && TEKSTNAMEN.has(naam) && !alVt) {
        wijzigingen.push({ begin: node.getStart(), eind: node.getEnd(), tekst: `vt(${JSON.stringify(node.text)})` });
      }
    }
    ts.forEachChild(node, bezoek);
  }
  bezoek(sf);
  let uit = bron;
  for (const w of wijzigingen.sort((a, b) => b.begin - a.begin)) uit = uit.slice(0, w.begin) + w.tekst + uit.slice(w.eind);
  if (wijzigingen.length > 0 && !/import \{[^}]*\bvt\b[^}]*\} from "@\/lib\/i18n\/site"/u.test(bron)) {
    const imps = [...uit.matchAll(/^import [^;]+;\n/gmu)];
    const laatste = imps.at(-1);
    const pos = laatste ? (laatste.index ?? 0) + laatste[0].length : 0;
    uit = uit.slice(0, pos) + 'import { vt } from "@/lib/i18n/site";\n' + uit.slice(pos);
  }
  if (schrijf && uit !== bron) writeFileSync(pad, uit);
  return wijzigingen.length;
}

const args = process.argv.slice(2);
const proef = args.includes("--proef");
let n = 0;
for (const pad of args.filter((a) => !a.startsWith("--"))) {
  const k = markeer(pad, !proef);
  n += k;
  console.log(`${pad}: ${k} zinnen gemarkeerd`);
}
console.log(`SAMEN: ${n}${proef ? " (proef: niets geschreven)" : ""}`);
