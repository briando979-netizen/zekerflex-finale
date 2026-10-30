// ---------------------------------------------------------------------------
// Bakt de volledige routelijst van de app in lib/dev/app-pages.generated.ts.
// De source-boom (app/**) zit niet in de Next-standalone-runtime op de VPS, dus
// de ZekerFlex AI-studio kan die niet live lopen; deze generator legt hem vast.
//
// Draaien na het toevoegen/verwijderen van pagina's:
//   node scripts/gen-app-pages.mjs
// ---------------------------------------------------------------------------
import { readdirSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const APP = join(ROOT, "app");

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name === "page.tsx") acc.push(full);
  }
  return acc;
}

const isGroup = (s) => s.startsWith("(") && s.endsWith(")");

function toRoute(file) {
  const segs = relative(APP, file).split(sep).slice(0, -1).filter((s) => !isGroup(s));
  const route = "/" + segs.join("/");
  return route.length > 1 ? route.replace(/\/$/, "") : "/";
}

function areaOf(file) {
  const parts = relative(APP, file).split(sep);
  if (parts.some(isGroup) && parts.includes("(marketing)")) return "Marketing";
  const first = parts.find((s) => s !== "page.tsx" && !isGroup(s));
  switch (first) {
    case "admin":
      return "Admin";
    case "dashboard":
      return "Freelancer";
    case "werkgever":
      return "Werkgever";
    case "shop":
      return "Webshop";
    case undefined:
      return "Marketing";
    default:
      return "Account & overig";
  }
}

const files = walk(APP, []);
const pages = files
  .map((f) => {
    const route = toRoute(f);
    return {
      route,
      file: relative(ROOT, f).split(sep).join("/"),
      area: areaOf(f),
      dynamic: route.includes("["),
    };
  })
  .sort((a, b) => (a.area === b.area ? a.route.localeCompare(b.route) : a.area.localeCompare(b.area)));

const body = pages.map((p) => `  ${JSON.stringify(p)},`).join("\n");
const out = `// AUTO-GEGENEREERD door scripts/gen-app-pages.mjs — niet met de hand bewerken.
// Opnieuw draaien na pagina-wijzigingen: node scripts/gen-app-pages.mjs
//
// De volledige routelijst van ZekerFlex, gebruikt door de ZekerFlex AI-studio
// (components/admin/ZekerFlexAIStudio.tsx) om alle pagina's te verkennen en live
// te bekijken.

export interface AppPage {
  /** De URL van de pagina, bv. "/admin/cockpit" of "/betaal/[token]". */
  route: string;
  /** Het bronbestand, bv. "app/admin/cockpit/page.tsx". */
  file: string;
  /** Logische groep voor de boomweergave. */
  area: string;
  /** True als de route een dynamische parameter ([id]) bevat. */
  dynamic: boolean;
}

export const APP_PAGES: readonly AppPage[] = [
${body}
];

export const APP_PAGE_COUNT = APP_PAGES.length;
`;

writeFileSync(join(ROOT, "lib", "dev", "app-pages.generated.ts"), out, "utf8");
console.log(`app-pages.generated.ts geschreven: ${pages.length} pagina's`);
