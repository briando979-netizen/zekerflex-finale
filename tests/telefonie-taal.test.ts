import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TELEFONIE_NL, TELEFONIE_TEKSTEN } from "@/lib/telephony/teksten";
import { ANSWER_AT, BUNDLES, DEFAULT_PRICING, NUMBER_TYPES, OPTIONS, SHOW_ON, quote } from "@/lib/telephony/plans";

// "Je eigen werknummer" (/dashboard/telefonie) is in de taal van de werker. De Nederlandse bron blijft lib/telephony/plans.ts
// (werkgever en beheer); de werker-pagina geeft `texts` mee, zonder `texts` blijft de pagina Nederlands.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

const blad = (w: unknown, pad: string, uit: Map<string, string>): void => {
  if (typeof w === "string") uit.set(pad, w);
  else if (Array.isArray(w)) w.forEach((x, i) => blad(x, `${pad}.${i}`, uit));
  else if (w && typeof w === "object") for (const [k, v] of Object.entries(w)) blad(v, pad ? `${pad}.${k}` : k, uit);
};
const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

describe("teksten in vijf talen", () => {
  it("elke taal heeft precies dezelfde sleutels en plaatshouders, en is echt vertaald", () => {
    const nl = new Map<string, string>();
    blad(TELEFONIE_NL, "", nl);
    expect(nl.size).toBeGreaterThan(100);
    for (const taal of TALEN) {
      const m = new Map<string, string>();
      blad(TELEFONIE_TEKSTEN[taal], "", m);
      expect([...m.keys()].sort(), taal).toEqual([...nl.keys()].sort());
      for (const [pad, x] of nl) {
        const v = m.get(pad) ?? "";
        expect(v.length, `${taal} ${pad}`).toBeGreaterThan(0);
        expect(plaats(v), `${taal} ${pad}`).toBe(plaats(x));
        // korte of internationale woorden (Start, SMS, 06 …, "Bundel") mogen gelijk blijven; zinnen niet
        if (taal !== "nl" && x.length > 28 && !/^[\d\s…,]+$/.test(x)) expect(v, `${taal} ${pad}`).not.toBe(x);
      }
    }
  });

  it("de Nederlandse tekst is gelijk aan de catalogus in plans.ts (één bron, geen afwijking)", () => {
    for (const t of NUMBER_TYPES) expect(TELEFONIE_NL.nummer[t.id], t.id).toEqual({ label: t.label, example: t.example, blurb: t.blurb });
    for (const o of OPTIONS) expect(TELEFONIE_NL.optie[o.id], o.id).toEqual({ label: o.label, blurb: o.blurb });
    for (const b of BUNDLES) expect(TELEFONIE_NL.bundels[b.id], b.id).toEqual({ label: b.label, blurb: b.blurb });
    for (const a of ANSWER_AT) expect(TELEFONIE_NL.antwoord[a.id], a.id).toBe(a.label);
    for (const s of SHOW_ON) expect(TELEFONIE_NL.tonen[s.id], s.id).toBe(s.label);
  });

  it("twaalf maanden en alle vier de statussen", () => {
    for (const taal of TALEN) {
      expect(TELEFONIE_TEKSTEN[taal].maanden, taal).toHaveLength(12);
      expect(Object.keys(TELEFONIE_TEKSTEN[taal].status).sort(), taal).toEqual(["aangevraagd", "actief", "geannuleerd", "in_behandeling"]);
    }
  });
});

describe("de regels van de samenstelling", () => {
  it("elke regel heeft een sleutel, zodat het scherm de tekst in de taal van de werker kiest", () => {
    const q = quote({ kind: "mobiel06", bundle: "start", options: ["ai", "sms"] }, DEFAULT_PRICING);
    expect(q.lines.map((l) => l.key)).toEqual(["bundel", "nummer", "optie:ai", "optie:sms"]);
    expect(quote({ kind: "mobiel097", bundle: null, options: [] }, DEFAULT_PRICING).lines.map((l) => l.key)).toEqual(["lijn"]);
    // de Nederlandse labels blijven zoals ze waren (opgeslagen aanvragen en beheer)
    expect(q.lines[0]!.label).toBe("Bundel Start (lijn + 2 opties)");
  });
});

describe("het scherm", () => {
  const comp = bron("components/app/Telefonie.tsx");

  it("heeft een texts-prop met Nederlandse standaard en geen vaste Nederlandse zinnen meer", () => {
    expect(comp).toContain("texts?: TelefonieTeksten");
    expect(comp).toContain("texts ?? TELEFONIE_NL");
    for (const zin of ["Je eigen werknummer", "Je nummers", "Annuleren", "Aanvragen", "Bezig…", "Zonder bundel", "binnenkort", "Per maand", "Zo doen"]) {
      expect(comp.includes(`"${zin}`) || comp.includes(`>${zin}<`), zin).toBe(false);
    }
    expect(comp).toContain('role="alert"');
  });

  it("de werkerpagina kiest de taal op de server en geeft de teksten mee; werkgever en beheer geven niets mee", () => {
    const werker = bron("app/dashboard/telefonie/page.tsx");
    expect(werker).toContain("TELEFONIE_TEKSTEN[await getLocale()]");
    expect(werker).toContain("texts={tx}");
    expect(bron("app/werkgever/telefonie/page.tsx")).not.toContain("texts=");
  });

  it("het teksten-bestand haalt niets zwaars de browser in", () => {
    const t = bron("lib/telephony/teksten.ts");
    expect(t).not.toMatch(/from "@\/lib\/(prisma|storage|mail)/);
    expect(t).not.toContain("FREELANCER_DICTS");
  });
});
