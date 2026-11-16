import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ERASABLE_KV_PREFIXES } from "@/lib/privacy/user-kv";

// Bewaker (16 nov 2026, controle van heel ZekerFlex; AGENTS.md "sr-only in een vegende rij"): een vak met
// overflow-x-auto zonder `relative`, met daarbinnen sr-only-tekst. Die tekst is position: absolute; zonder
// gepositioneerde ouder ontsnapt hij aan het afknippen en maakt hij de hele pagina breder dan het scherm.
// Gemeten op de telefoon (390 px): /werkgever/horeca/allergenen werd 929 px breed. De controle vond er 11.

const ROOT = process.cwd();

function tsxBestanden(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return tsxBestanden(rel);
    return e.name.endsWith(".tsx") ? [rel] : [];
  });
}

const KLASSE = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/;
const inspringing = (r: string) => (r.match(/^\s*/)?.[0] ?? "").length;

/** Elk vegend vak zonder positie met sr-only-tekst erin, als "bestand:regel". */
function zoekVegendeVakken(bestand: string, bron: string): string[] {
  const regels = bron.split("\n");
  const fout: string[] = [];
  regels.forEach((r, i) => {
    const m = KLASSE.exec(r);
    const klasse = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
    if (!/\boverflow-x-(auto|scroll)\b/.test(klasse) || /\b(relative|absolute|fixed|sticky)\b/.test(klasse)) return;
    const diepte = inspringing(r);
    for (let j = i + 1; j < Math.min(regels.length, i + 80); j++) {
      const s = regels[j] ?? "";
      if (s.trim().startsWith("</") && inspringing(s) <= diepte) return;
      if (/\bsr-only\b/.test(s) && !/focus:not-sr-only/.test(s)) {
        // een ouder met relative tussen het vak en de tekst is ook goed
        for (let k = i + 1; k < j; k++) {
          const t = regels[k] ?? "";
          if (/className=[^>]*\brelative\b/.test(t) && inspringing(t) < inspringing(s)) return;
        }
        fout.push(`${bestand.split(path.sep).join("/")}:${i + 1}`);
        return;
      }
    }
  });
  return fout;
}

describe("sr-only in een vegend vak", () => {
  it("vindt een vak zonder positie (proef op de som)", () => {
    const fout = '<div className="overflow-x-auto">\n  <table>\n    <caption className="sr-only">x</caption>\n  </table>\n</div>';
    const goed = '<div className="relative overflow-x-auto">\n  <table>\n    <caption className="sr-only">x</caption>\n  </table>\n</div>';
    expect(zoekVegendeVakken("proef.tsx", fout)).toEqual(["proef.tsx:1"]);
    expect(zoekVegendeVakken("proef.tsx", goed)).toEqual([]);
  });

  it("geen vegend vak in app/ of components/ laat sr-only-tekst ontsnappen", () => {
    const fout = ["app", "components"].flatMap((d) => tsxBestanden(d)).flatMap((f) => zoekVegendeVakken(f, readFileSync(path.join(ROOT, f), "utf8")));
    expect(fout).toEqual([]);
  });
});

describe("AVG: het eigen wifi-wachtwoord", () => {
  it("hoort bij wissen en export (lib/netwerk/store.ts, netwerk-wifi-ww:<userId>)", () => {
    expect(ERASABLE_KV_PREFIXES).toContain("netwerk-wifi-ww:");
  });
});
