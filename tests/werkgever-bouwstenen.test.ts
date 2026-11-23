import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  aantalKolommen,
  blokVoortgang,
  kl,
  schakelaarKlassen,
  stapStanden,
  DIALOOG_ACTIES,
  FORMULIER_RIJ,
  KAART,
  KOP_TERUG,
  KOP_TITEL,
  TABEL_CEL,
} from "@/components/werkgever/bouwstenen";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";

// De gedeelde bouwstenen van de werkgeversapp (eigenaar, 23 nov 2026: dezelfde rust, indeling en vormen als het dashboard van
// YoungOnes, in de huisstijl van ZekerFlex): één kop per pagina, een kaart, een lijst als tabel, een formulier in twee kolommen,
// een dialoog en een schakelaar. De klassen en de rekenregels staan puur in components/werkgever/bouwstenen.ts.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const BOUWSTENEN = ["PaginaKop", "Kaart", "LijstTabel", "FormulierRij", "Dialoog", "Schakelaar"].map((n) => `components/werkgever/${n}.tsx`);
const STANDAARDKLEUR = /(?:bg|text|border)-(?:red|orange|amber|yellow|green|emerald|sky|blue|violet|purple|pink|rose|slate|gray|zinc)-\d{2,3}/;

describe("de rekenregels", () => {
  it("kl voegt klassen samen en laat lege delen weg", () => {
    expect(kl("a", false, null, undefined, "", "b")).toBe("a b");
    expect(kl()).toBe("");
  });

  it("de voortgang van een blok: de stap is de eerste die open staat, het percentage is wat klaar is", () => {
    expect(blokVoortgang([false, false, false, false, false])).toEqual({ stap: 1, totaal: 5, pct: 0 });
    expect(blokVoortgang([true, false, false, false])).toEqual({ stap: 2, totaal: 4, pct: 25 });
    expect(blokVoortgang([true, true, false, false])).toEqual({ stap: 3, totaal: 4, pct: 50 });
    // een stap die je oversloeg telt als klaar; een open stap ervoor blijft de stap waar je bent
    expect(blokVoortgang([true, false, true, true])).toEqual({ stap: 2, totaal: 4, pct: 75 });
    expect(blokVoortgang([true, true, true])).toEqual({ stap: 3, totaal: 3, pct: 100 });
    expect(blokVoortgang([])).toEqual({ stap: 0, totaal: 0, pct: 100 });
  });

  it("de stand van elke stap: klaar, één actieve, de rest open", () => {
    expect(stapStanden([true, false, false])).toEqual(["klaar", "actief", "open"]);
    expect(stapStanden([false, true, false])).toEqual(["actief", "klaar", "open"]);
    expect(stapStanden([true, true])).toEqual(["klaar", "klaar"]);
    expect(stapStanden([])).toEqual([]);
  });

  it("de schakelaar is groen als hij aan staat en grijs als hij uit staat", () => {
    expect(schakelaarKlassen(true).baan).toContain("bg-brand-500");
    expect(schakelaarKlassen(false).baan).toContain("bg-neutralx-300");
    expect(schakelaarKlassen(true).knop).toContain("translate-x-[22px]");
    expect(schakelaarKlassen(false).knop).toContain("translate-x-0.5");
  });

  it("de kopregel van een lijst heeft een kolom voor de acties als een rij die heeft", () => {
    expect(aantalKolommen(3, true)).toBe(4);
    expect(aantalKolommen(3, false)).toBe(3);
    expect(aantalKolommen(-1, false)).toBe(0);
  });
});

describe("de vormen", () => {
  it("een kaart is wit met een dunne rand en afgeronde hoeken", () => {
    for (const k of ["rounded-xl", "border", "border-hair", "bg-white"]) expect(KAART.split(" "), k).toContain(k);
  });

  it("de paginatitel staat in hoofdletters, breekt een lang woord af en is kleiner op een telefoon", () => {
    for (const k of ["uppercase", "break-words", "text-xl", "sm:text-2xl"]) expect(KOP_TITEL.split(" "), k).toContain(k);
    expect(KOP_TERUG.split(" ")).toContain("min-h-11");
  });

  it("een formulier heeft twee kolommen op een laptop en staat onder elkaar op een telefoon", () => {
    expect(FORMULIER_RIJ).toContain("lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]");
    expect(FORMULIER_RIJ.split(" ")).toContain("grid");
    // minmax(0, …): een lang veld maakt de pagina niet breder dan het scherm
    expect(FORMULIER_RIJ).not.toMatch(/grid-cols-\[\d+fr/);
  });

  it("de cellen van een lijst staan op een telefoon onder elkaar (geen zijwaarts schuiven)", () => {
    expect(TABEL_CEL.split(" ")).toContain("block");
    expect(TABEL_CEL.split(" ")).toContain("sm:table-cell");
    expect(lees("components/werkgever/LijstTabel.tsx")).not.toContain("overflow-x-auto");
  });

  it("de knoppen van een dialoog: op een telefoon de hoofdknop bovenaan, op een laptop rechts naast elkaar", () => {
    expect(DIALOOG_ACTIES).toContain("flex-col-reverse");
    expect(DIALOOG_ACTIES).toContain("sm:flex-row");
    expect(DIALOOG_ACTIES).toContain("sm:justify-end");
  });
});

describe("de onderdelen", () => {
  it.each(BOUWSTENEN)("%s: geen servercode, geen vaste tekst en alleen eigen kleuren", (bestand) => {
    const bron = lees(bestand);
    expect(bron).not.toMatch(/from "@\/lib\/(prisma|storage|mail|kv|i18n\/server)|from "zod"|dictionary-en/);
    expect(bron).not.toMatch(STANDAARDKLEUR);
    // Tailwind dark: volgt het systeem, niet de themaknop (AGENTS.md)
    expect(bron).not.toMatch(/\bdark:/);
  });

  it("de kop, de kaart, de lijst en de formulierrij hebben geen hooks: ook een servercomponent kan ze tonen", () => {
    for (const n of ["PaginaKop", "Kaart", "LijstTabel", "FormulierRij"]) {
      const bron = lees(`components/werkgever/${n}.tsx`);
      expect(bron, n).not.toContain('"use client"');
      expect(bron, n).not.toMatch(/\buse[A-Z]\w+\(/);
    }
  });

  it("een lege lijst is één regel tekst in dezelfde kaart", () => {
    const bron = lees("components/werkgever/LijstTabel.tsx");
    expect(bron).toContain("if (rijen.length === 0) {");
    expect(bron).toContain("{leeg}");
    // de verborgen kolomnaam voor een schermlezer staat in een cel die `relative` is (TABEL_KOP)
    expect(bron).toContain('<span className="sr-only">{actieKop}</span>');
    expect(lees("components/werkgever/bouwstenen.ts")).toMatch(/TABEL_KOP = "relative /);
  });

  it("de dialoog is het bestaande sheet-patroon, met één formulier en geen formulier in een formulier", () => {
    const bron = lees("components/werkgever/Dialoog.tsx");
    expect(bron).toContain("<OnderSheet open={open}");
    expect(bron.match(/<form\b/g)?.length).toBe(1);
    expect(bron).toContain("{onVerstuur ? (");
  });

  it("de schakelaar is een echte schakelaar met een naam, een uitleg en een tikdoel van minstens 44 px", () => {
    const bron = lees("components/werkgever/Schakelaar.tsx");
    expect(bron).toContain('role="switch"');
    expect(bron).toContain("aria-checked={aan}");
    expect(bron).toContain("aria-label={label}");
    expect(bron).toContain("aria-describedby={beschrijvingId}");
    expect(bron).toContain("min-h-11");
  });
});

describe("de schil", () => {
  const shell = lees("components/app/EmployerShell.tsx");

  it("de zijbalk staat op een laptop standaard ingeklapt en onthoudt alleen een bewuste keuze", () => {
    expect(shell).toContain("const [collapsed, setCollapsed] = useState(true);");
    expect(shell).toContain('setCollapsed(localStorage.getItem("zf-emp-collapsed") !== "0");');
    expect(shell).toContain('collapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[256px_minmax(0,1fr)]"');
  });

  it("op een telefoon is het een lade met namen: inklappen geldt alleen vanaf een laptop", () => {
    expect(shell).toContain('<span className={collapsed ? "lg:sr-only" : ""}>{n.label}</span>');
    expect(shell).toContain('collapsed ? "lg:w-[72px]" : "lg:w-[256px]"');
    expect(shell).not.toMatch(/collapsed \? "w-\[/);
    expect(shell).toContain('aria-controls="employer-sidebar"');
  });

  it("de knop in- en uitklappen heeft een naam en zegt of de zijbalk open is; een ingeklapte regel heeft een tooltip", () => {
    expect(shell).toContain("aria-expanded={!collapsed}");
    expect(shell).toContain("aria-label={collapsed ? t.shell.expand : t.shell.collapse}");
    expect(shell).toContain("title={collapsed ? n.label : undefined}");
    expect(nl.shell.expand).toBe("Menu uitklappen");
    expect(en.shell.expand).toBe("Expand menu");
  });

  it("elke regel in de zijbalk is minstens 44 px hoog en `relative` (de naam voor een schermlezer blijft in de regel)", () => {
    expect(shell).toMatch(/const railRij = "group relative flex min-h-11 /);
  });

  it("de zijbalk is in beide thema's donker en de inhoud staat in één gecentreerde kolom op een effen achtergrond", () => {
    expect(shell).toContain("bg-gradient-to-b from-ink via-brand-700 to-ink text-white");
    expect(shell).toContain('<div className="mx-auto max-w-6xl">');
    expect(shell).not.toContain("app-bg noise");
    expect(shell).toContain('data-app="werkgever"');
  });

  it("de vormen van de werkgeversapp staan in globals.css, ook voor het donkere thema", () => {
    const css = lees("app/globals.css");
    expect(css).toContain('.app-scope[data-app="werkgever"] .surface {');
    expect(css).toContain('.app-scope[data-app="werkgever"][data-theme="dark"] .surface { border-color: var(--app-edge); }');
    expect(css).toContain('.app-scope[data-app="werkgever"] .btn-primary,');
  });
});

describe("elke pagina van de werkgeversapp heeft de ene kop", () => {
  it("de hoofdpagina's gebruiken PaginaKop of de kop van Instellingen, niet meer de oude kop", () => {
    const HOOFD = ["page.tsx", "diensten/page.tsx", "kalender/page.tsx", "favorieten/page.tsx", "berichten/page.tsx", "uren/page.tsx", "facturen/page.tsx", "compliance/page.tsx", "hulp/page.tsx"];
    for (const p of HOOFD) {
      const bron = lees(`app/werkgever/${p}`);
      expect(bron, p).toContain("<PaginaKop");
      expect(bron, p).toContain('from "@/components/werkgever/PaginaKop"');
      expect(bron, p).not.toContain("PageHeader");
    }
    expect(lees("app/werkgever/instellingen/page.tsx")).toContain("<PaginaKop title={s.title} />");
  });
});
