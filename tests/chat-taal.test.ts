import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_NL } from "@/lib/chat/teksten";
import { CHAT_TEKSTEN } from "@/lib/chat/teksten-talen";
import { SHARED_NL } from "@/lib/chat/teksten-shared";
import { dayLabel, lastSeenLabel, listTime } from "@/components/chat/shared";

// De chat van de werker (InboxPage en wat daaronder hangt) is vijftalig; opdrachtgever en beheer blijven Nederlands.
// Alleen tekst: dit bewaakt dat alle talen compleet zijn en dat de koppeling klopt.

const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const ROOT = process.cwd();
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

const blad = (w: unknown, pad: string, uit: Map<string, string>): void => {
  if (typeof w === "string") uit.set(pad, w);
  else if (Array.isArray(w)) w.forEach((x, i) => blad(x, `${pad}.${i}`, uit));
  else if (w && typeof w === "object") for (const [k, v] of Object.entries(w)) blad(v, pad ? `${pad}.${k}` : k, uit);
  else throw new Error(`${pad}: geen tekst`);
};
const plaats = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

describe("de teksten in vijf talen", () => {
  const nl = new Map<string, string>();
  blad(CHAT_NL, "", nl);

  it("elke taal heeft precies dezelfde sleutels en plaatshouders als het Nederlands, en niets is leeg", () => {
    expect(nl.size).toBeGreaterThan(400);
    for (const taal of TALEN) {
      const m = new Map<string, string>();
      blad(CHAT_TEKSTEN[taal], "", m);
      expect([...m.keys()].sort(), taal).toEqual([...nl.keys()].sort());
      for (const [pad, x] of nl) {
        const v = m.get(pad) ?? "";
        if (x !== "") expect(v.length, `${taal} ${pad}`).toBeGreaterThan(0);
        expect(plaats(v), `${taal} ${pad}`).toBe(plaats(x));
      }
    }
  });

  it("de talen zijn echt vertaald: van de zinnen is hooguit een klein deel nog gelijk aan het Nederlands", () => {
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      const m = new Map<string, string>();
      blad(CHAT_TEKSTEN[taal], "", m);
      const zinnen = [...nl].filter(([, x]) => x.length > 24);
      const gelijk = zinnen.filter(([pad, x]) => m.get(pad) === x);
      expect(gelijk.length / zinnen.length, `${taal}: ${gelijk.map(([p]) => p).slice(0, 5).join(", ")}`).toBeLessThan(0.05);
    }
  });

  it("Nederlands blijft de standaard: CHAT_TEKSTEN.nl is dezelfde bron als CHAT_NL", () => {
    expect(CHAT_TEKSTEN.nl).toBe(CHAT_NL);
  });
});

describe("datums en tijden in de taal van de werker", () => {
  const nu = new Date("2026-11-12T10:00:00Z");
  it("Nederlands is ongewijzigd (zonder taal-parameter)", () => {
    expect(dayLabel("2026-11-12T08:00:00Z", nu)).toBe("Vandaag");
    expect(dayLabel("2026-11-11T08:00:00Z", nu)).toBe("Gisteren");
    expect(listTime("2026-11-11T08:00:00Z", nu)).toBe("Gisteren");
    expect(lastSeenLabel({ online: false, lastSeen: "2026-11-12T08:00:00Z" } as never, nu)).toBe("laatst gezien om 09:00");
    expect(lastSeenLabel({ online: true } as never, nu)).toBe("online");
  });
  it("de andere talen krijgen eigen woorden, de tijd blijft Amsterdamse tijd", () => {
    expect(dayLabel("2026-11-12T08:00:00Z", nu, CHAT_TEKSTEN.en.shared)).toBe("Today");
    expect(dayLabel("2026-11-11T08:00:00Z", nu, CHAT_TEKSTEN.pl.shared)).toBe("Wczoraj");
    expect(lastSeenLabel({ online: false, lastSeen: "2026-11-12T08:00:00Z" } as never, nu, CHAT_TEKSTEN.uk.shared)).toContain("09:00");
    expect(SHARED_NL.locale).toBe("nl-NL");
  });
});

describe("de koppeling", () => {
  it("de werkerpagina kiest de taal op de server en geeft de teksten mee; opdrachtgever en beheer niet", () => {
    expect(bron("app/dashboard/berichten/page.tsx")).toContain("texts={CHAT_TEKSTEN[await getLocale()]}");
    expect(bron("app/werkgever/berichten/page.tsx")).not.toContain("texts=");
    expect(bron("app/admin/berichten/page.tsx")).not.toContain("texts=");
  });

  it("InboxPage zet de provider om de inhoud; het gedrag (sticky scroll, failed + Opnieuw, say) staat er nog", () => {
    const inbox = bron("components/chat/InboxPage.tsx");
    expect(inbox).toContain("<ChatTekstenProvider texts={texts}>");
    expect(inbox).toContain("useStickyScroll");
    expect(inbox).not.toMatch(/window\.alert\(/);
  });

  it("de client-bestanden van de chat halen niet alle talen binnen (alleen CHAT_NL), en de teksten zijn puur", () => {
    for (const f of readdirSync(path.join(ROOT, "components/chat"))) {
      if (!/\.tsx?$/.test(f)) continue;
      const s = bron(`components/chat/${f}`);
      expect(s, f).not.toContain("teksten-talen");
      expect(s, f).not.toMatch(/-talen"/);
      expect(s, f).not.toContain("FREELANCER_DICTS");
    }
    for (const f of readdirSync(path.join(ROOT, "lib/chat"))) {
      if (!f.startsWith("teksten")) continue;
      expect(bron(`lib/chat/${f}`), f).not.toMatch(/from "@\/lib\/(prisma|storage|mail)|from "react"|zod/);
    }
  });

  it("geen lookbehind in de chat (Safari voor 16.4)", () => {
    for (const f of readdirSync(path.join(ROOT, "components/chat"))) {
      if (!/\.tsx?$/.test(f)) continue;
      expect(bron(`components/chat/${f}`), f).not.toMatch(/\(\?<[=!]/);
    }
  });
});
