import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dmarcNlTodo, dmarcStappenTodo, leesDmarcRecord } from "@/lib/admin/todo-dmarc";

// DMARC in stappen (14 nov): de nieuwsbrief van 7 nov werd door Microsoft geweigerd zonder DMARC-record. De taak geeft
// de stappen in gewoon Nederlands en vinkt zichzelf per stap af op een (nagemaakt) DNS-antwoord.

describe("een DNS-antwoord van _dmarc lezen", () => {
  it("beleid en rapportadressen, ook in stukken en met meerdere adressen", () => {
    expect(leesDmarcRecord([["v=DMARC1; p=none"]])).toEqual({ p: "none", rua: [] });
    expect(leesDmarcRecord([["v=DMARC1; p=none; rua=mai", "lto:dmarc@zekerflex.com"]])).toEqual({ p: "none", rua: ["dmarc@zekerflex.com"] });
    expect(leesDmarcRecord([["v=DMARC1;p=quarantine;rua=mailto:dmarc@zekerflex.com,mailto:a@rapport.test!10m"]])).toEqual({ p: "quarantine", rua: ["dmarc@zekerflex.com", "a@rapport.test"] });
    // sp= (subdomeinen) is niet het beleid van het domein zelf
    expect(leesDmarcRecord([["v=DMARC1; sp=reject; p=none"]])?.p).toBe("none");
  });

  it("geen DMARC-record: null; andere TXT-regels tellen niet", () => {
    expect(leesDmarcRecord([])).toBeNull();
    expect(leesDmarcRecord([["v=spf1 include:_spf.transip.email ~all"]])).toBeNull();
  });
});

describe("de stappen voor zekerflex.com", () => {
  it("geen record: aanzetten, niets afgevinkt", () => {
    const t = dmarcStappenTodo(null)!;
    expect(t).toMatchObject({ id: "dmarc-stappen", title: "DMARC aanzetten voor zekerflex.com", done: false, auto: true });
    expect(t.how.filter((h) => h.startsWith("✓"))).toEqual([]);
  });

  it("zoals nu (p=none, geen rua): de stappen 1 tot 4 in gewoon Nederlands, niets afgevinkt", () => {
    const t = dmarcStappenTodo(leesDmarcRecord([["v=DMARC1; p=none"]]))!;
    expect(t.title).toBe("DMARC-rapporten aanzetten en daarna strenger zetten");
    expect(t.how).toHaveLength(4);
    expect(t.how[0]).toContain("Beheer → Mail → knop 'Testmail'");
    expect(t.how[1]).toContain("dmarc@zekerflex.com");
    expect(t.how[2]).toContain("v=DMARC1; p=none; rua=mailto:dmarc@zekerflex.com");
    expect(t.how[3]).toContain("p=quarantine");
    expect(t.done).toBe(false);
    expect(t.why).toContain("7 november");
  });

  it("rua staat er: stap 2 en 3 afgevinkt, wachten op p=quarantine", () => {
    const t = dmarcStappenTodo(leesDmarcRecord([["v=DMARC1; p=none; rua=mailto:dmarc@zekerflex.com"]]))!;
    expect(t.title).toBe("DMARC: na twee schone weken op p=quarantine zetten");
    expect(t.how.map((h) => h.startsWith("✓"))).toEqual([false, true, true, false]);
    expect(t.done).toBe(false);
    expect(t.doneNote).toBe("stap 2 en 3 klaar: rapporten gaan naar dmarc@zekerflex.com; nog op p=none");
  });

  it("p=quarantine: helemaal klaar", () => {
    const t = dmarcStappenTodo(leesDmarcRecord([["v=DMARC1; p=quarantine; rua=mailto:dmarc@zekerflex.com"]]))!;
    expect(t).toMatchObject({ done: true, title: "DMARC staat streng (p=quarantine)", doneNote: "DMARC staat op p=quarantine; rapporten gaan naar dmarc@zekerflex.com" });
    expect(t.how[3]!.startsWith("✓")).toBe(true);
  });

  it("de DNS niet te lezen: geen taak (niets vals tonen)", () => {
    expect(dmarcStappenTodo(undefined)).toBeNull();
  });
});

describe("zekerflex.nl", () => {
  it("streng zonder DKIM: een taak (DKIM aan of niet mailen vanaf @zekerflex.nl)", () => {
    const t = dmarcNlTodo(leesDmarcRecord([["v=DMARC1; p=quarantine; sp=none; adkim=s; aspf=r;"]]), false)!;
    expect(t).toMatchObject({ id: "dmarc-zekerflex-nl", done: false });
    expect(t.title).toContain("DKIM aanzetten");
    expect(t.how.join(" ")).toContain("@zekerflex.nl");
  });

  it("met DKIM: afgevinkt; zonder streng beleid en zonder DKIM: geen taak; niet te lezen: geen taak", () => {
    expect(dmarcNlTodo(leesDmarcRecord([["v=DMARC1; p=quarantine"]]), true)).toMatchObject({ done: true, doneNote: "DKIM staat voor zekerflex.nl" });
    expect(dmarcNlTodo(leesDmarcRecord([["v=DMARC1; p=none"]]), false)).toBeNull();
    expect(dmarcNlTodo(null, false)).toBeNull();
    expect(dmarcNlTodo(undefined, false)).toBeNull();
    expect(dmarcNlTodo(null, undefined)).toBeNull();
  });
});

describe("aanhaking in Te doen", () => {
  it("de DNS wordt één keer gelezen en beide taken staan in de lijst", () => {
    const bron = readFileSync(path.join(process.cwd(), "lib/admin/owner-todos.ts"), "utf8");
    expect(bron).toContain("leesDmarc(hoofddomeinVan(base))");
    expect(bron).toContain("const dmarcStappen = dmarcStappenTodo(dmarcStand);");
    expect(bron).toContain("...(dmarcStappen ? [dmarcStappen] : [])");
    expect(bron).toContain("...(dmarcNl ? [dmarcNl] : [])");
  });
});
