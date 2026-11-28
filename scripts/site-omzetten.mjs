// Zet de vaste Nederlandse tekst van een pagina van de openbare site om naar tx("…") (28 nov 2026, lib/i18n/site.ts).
//   node scripts/site-omzetten.mjs --proef [--meld] <bestand…>   alleen tellen en melden, niets schrijven
//   node scripts/site-omzetten.mjs [--meld] <bestand…>           omzetten
// Alleen een bestand zonder "use client": elke component met tekst krijgt `const tx = await getSiteT();`. Een losse tekst
// wordt {tx("…")}; alt, title, placeholder en aria-label krijgen tx("…"). Tekst die vastzit aan een {waarde} of midden in
// een zin met een <strong> of <Link> wordt NIET automatisch omgezet maar gemeld: die zet je met de hand om.
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

const ATTR = new Set(["alt", "title", "placeholder", "aria-label", "aria-description", "eyebrow", "intro", "body", "lead", "primaryLabel", "secondaryLabel", "label", "subtitle", "caption", "description", "summary"]);
// tekstvelden van een lijst of object: {item.titel} wordt {tx(item.titel)} (de zin zelf staat met vt("…") in de lijst)
const VELDEN = new Set(["titel", "title", "tekst", "text", "label", "naam", "kop", "lead", "desc", "sub", "q", "a", "vraag", "antwoord", "omschrijving", "beschrijving", "uitleg", "eyebrow", "knop", "cta", "badge", "hint", "body", "intro", "alt", "fotoAlt", "primaryLabel", "secondaryLabel"]);
const ENTITEIT = [["&nbsp;", " "], ["&amp;", "&"], ["&lt;", "<"], ["&gt;", ">"], ["&quot;", '"'], ["&apos;", "'"], ["&rsquo;", "’"], ["&lsquo;", "‘"], ["&ldquo;", "“"], ["&rdquo;", "”"], ["&mdash;", "—"], ["&ndash;", "–"], ["&hellip;", "…"], ["&euro;", "€"], ["&middot;", "·"], ["&rarr;", "→"]];
const heeftLetter = (s) => /\p{L}/u.test(s);

function decodeer(raw) {
  let s = raw.replace(/&#(x[0-9a-f]+|[0-9]+);/giu, (_, c) => String.fromCodePoint(c[0].toLowerCase() === "x" ? parseInt(c.slice(1), 16) : Number(c)));
  for (const [e, v] of ENTITEIT) s = s.split(e).join(v);
  return /&[a-z]+;/iu.test(s) ? null : s;
}

/** Breekt dit kind een zin: een {waarde} of een inline-element (strong, Link, …)? */
function plakt(kind) {
  if (ts.isJsxExpression(kind)) {
    const e = kind.expression;
    if (!e) return false;
    if (ts.isStringLiteral(e) && e.text.trim() === "") return false;
    return true;
  }
  if (ts.isJsxElement(kind) || ts.isJsxSelfClosingElement(kind)) {
    const tag = (ts.isJsxElement(kind) ? kind.openingElement.tagName : kind.tagName).getText();
    return /^(strong|em|b|i|span|a|Link|br|code|mark|small|sup|sub|abbr)$/.test(tag);
  }
  return false;
}

export function zetOm(pad, schrijf) {
  const bron = readFileSync(pad, "utf8");
  if (/^\s*["']use client["']/u.test(bron)) return { pad, overgeslagen: "use client", omgezet: 0, gemeld: [] };
  const sf = ts.createSourceFile(pad, bron, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const wijzigingen = [];
  const gemeld = [];
  const componenten = new Set();
  const regel = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

  /** De omringende component: een functie met een hoofdletter of de standaard-export; anders null. */
  function component(node) {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) || ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
        const naam = ts.isFunctionDeclaration(p) ? p.name?.text : ts.isVariableDeclaration(p.parent) ? p.parent.name.getText() : undefined;
        const isStandaard = ts.isFunctionDeclaration(p) && (p.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
        if ((naam && /^[A-Z]/.test(naam)) || isStandaard) return p;
        // een callback binnen een component (.map(…)): verder omhoog zoeken
        if (ts.isArrowFunction(p) || ts.isFunctionExpression(p)) {
          if (ts.isCallExpression(p.parent) || ts.isJsxExpression(p.parent)) continue;
        }
        return null;
      }
    }
    return null;
  }

  function bezoek(node) {
    if (ts.isJsxText(node) && heeftLetter(node.getText())) {
      const raw = node.getText();
      const ouder = node.parent;
      const kinderen = ouder && (ts.isJsxElement(ouder) || ts.isJsxFragment(ouder)) ? [...ouder.children] : [];
      const i = kinderen.indexOf(node);
      const wsVoor = /^\s*/u.exec(raw)?.[0] ?? "";
      const wsNa = /\s*$/u.exec(raw)?.[0] ?? "";
      const geplakt = (buur, ws) => buur !== undefined && plakt(buur) && !ws.includes("\n");
      if (geplakt(kinderen[i - 1], wsVoor) || geplakt(kinderen[i + 1], wsNa)) {
        gemeld.push(`r${regel(node.getStart())}: zin met een {waarde} of opmaak erin: "${raw.trim().slice(0, 70)}"`);
      } else {
        const tekst = decodeer(raw.trim().replace(/\s+/gu, " "));
        const comp = component(node);
        if (tekst === null) gemeld.push(`r${regel(node.getStart())}: onbekende HTML-code in "${raw.trim().slice(0, 70)}"`);
        else if (!comp) gemeld.push(`r${regel(node.getStart())}: tekst buiten een component: "${tekst.slice(0, 70)}"`);
        else {
          componenten.add(comp);
          wijzigingen.push({ begin: node.getStart() + wsVoor.length, eind: node.getEnd() - wsNa.length, tekst: `{tx(${JSON.stringify(tekst)})}` });
        }
      }
    }
    if (ts.isJsxAttribute(node) && ATTR.has(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer) && heeftLetter(node.initializer.text)) {
      const comp = component(node);
      if (!comp) gemeld.push(`r${regel(node.getStart())}: ${node.name.getText()} buiten een component`);
      else {
        componenten.add(comp);
        wijzigingen.push({ begin: node.initializer.getStart(), eind: node.initializer.getEnd(), tekst: `{tx(${JSON.stringify(node.initializer.text)})}` });
      }
    }
    // {item.titel} als kind van een element: vertalen
    if (ts.isJsxExpression(node) && node.expression && ts.isPropertyAccessExpression(node.expression) && VELDEN.has(node.expression.name.text)
        && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const comp = component(node);
      if (comp) {
        componenten.add(comp);
        const e = node.expression;
        wijzigingen.push({ begin: e.getStart(), eind: e.getEnd(), tekst: `tx(${e.getText()})` });
      }
    }
    // title={item.titel}, alt={foto.alt}, …: vertalen
    if (ts.isJsxAttribute(node) && ATTR.has(node.name.getText()) && node.initializer && ts.isJsxExpression(node.initializer)
        && node.initializer.expression && ts.isPropertyAccessExpression(node.initializer.expression) && VELDEN.has(node.initializer.expression.name.text)) {
      const comp = component(node);
      if (comp) {
        componenten.add(comp);
        const e = node.initializer.expression;
        wijzigingen.push({ begin: e.getStart(), eind: e.getEnd(), tekst: `tx(${e.getText()})` });
      }
    }
    // <FaqList items={FAQ} />: de vragen vertalen vóór ze erin gaan (FaqList zelf blijft ongemoeid; ook de Poolse pagina's gebruiken hem)
    if (ts.isJsxAttribute(node) && node.name.getText() === "items" && node.initializer && ts.isJsxExpression(node.initializer)
        && node.initializer.expression && ts.isIdentifier(node.initializer.expression)) {
      const el = node.parent?.parent;
      const tag = el && (ts.isJsxSelfClosingElement(el) || ts.isJsxOpeningElement(el)) ? el.tagName.getText() : "";
      const comp = component(node);
      if (tag === "FaqList" && comp) {
        componenten.add(comp);
        const e = node.initializer.expression;
        wijzigingen.push({ begin: e.getStart(), eind: e.getEnd(), tekst: `${e.getText()}.map((f) => ({ q: tx(f.q), a: tx(f.a) }))` });
      }
    }
    ts.forEachChild(node, bezoek);
  }
  bezoek(sf);

  for (const f of componenten) {
    const body = f.body;
    if (!body) continue;
    const isAsync = (f.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (!isAsync) {
      const start = f.getStart();
      const kop = bron.slice(start, body.getStart());
      const iFunctie = kop.search(/\bfunction\b/u);
      wijzigingen.push({ begin: iFunctie >= 0 ? start + iFunctie : start, eind: iFunctie >= 0 ? start + iFunctie : start, tekst: "async " });
    }
    if (ts.isBlock(body)) {
      wijzigingen.push({ begin: body.getStart() + 1, eind: body.getStart() + 1, tekst: "\n  const tx = await getSiteT();" });
    } else {
      wijzigingen.push({ begin: body.getStart(), eind: body.getStart(), tekst: "{\n  const tx = await getSiteT();\n  return " });
      wijzigingen.push({ begin: body.getEnd(), eind: body.getEnd(), tekst: ";\n}" });
    }
  }

  let uit = bron;
  for (const w of wijzigingen.sort((a, b) => b.begin - a.begin || b.eind - a.eind)) uit = uit.slice(0, w.begin) + w.tekst + uit.slice(w.eind);
  if (componenten.size > 0 && !/getSiteT/.test(bron)) {
    const imps = [...uit.matchAll(/^import [^;]+;\n/gmu)];
    const laatste = imps.at(-1);
    const pos = laatste ? (laatste.index ?? 0) + laatste[0].length : 0;
    uit = uit.slice(0, pos) + 'import { getSiteT } from "@/lib/i18n/server";\n' + uit.slice(pos);
  }
  const omgezet = wijzigingen.filter((w) => w.tekst.startsWith("{tx(") || w.tekst.startsWith("tx(") || w.tekst.includes(".map((f) => ({ q: tx(")).length;
  if (schrijf && uit !== bron) writeFileSync(pad, uit);
  return { pad, omgezet, gemeld, componenten: componenten.size };
}

const args = process.argv.slice(2);
const proef = args.includes("--proef");
let totOm = 0;
let totMeld = 0;
for (const pad of args.filter((a) => !a.startsWith("--"))) {
  const r = zetOm(pad, !proef);
  if (r.overgeslagen) {
    console.log(`${pad}: overgeslagen (${r.overgeslagen})`);
    continue;
  }
  totOm += r.omgezet;
  totMeld += r.gemeld.length;
  console.log(`${pad}: ${r.omgezet} omgezet, ${r.gemeld.length} met de hand`);
  if (args.includes("--meld")) for (const m of r.gemeld) console.log(`    ${m}`);
}
console.log(`\nSAMEN: ${totOm} omgezet, ${totMeld} met de hand${proef ? " (proef: niets geschreven)" : ""}`);
