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
  DIALOOG_BREEDTE,
  FORMULIER_RIJ,
  KAART,
  KOP_TERUG,
  KOP_TITEL,
  SCHIL_INHOUD,
  SCHIL_KOPBALK,
  SCHIL_RASTER_IN,
  SCHIL_RASTER_UIT,
  SCHIL_ZIJBALK_IN,
  SCHIL_ZIJBALK_UIT,
  TABEL_CEL,
} from "@/components/werkgever/bouwstenen";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { HOOFD_ADRESSEN, perSectie, splitsMenu } from "@/lib/werkgever/menu-groepen";
import { menuVoor } from "@/lib/werkgever/werkruimte";

// De gedeelde bouwstenen van de werkgeversapp (eigenaar, 23 nov 2026: dezelfde rust, indeling en vormen als het dashboard van
// YoungOnes, in de huisstijl van ZekerFlex): Ã©Ã©n kop per pagina, een kaart, een lijst als tabel, een formulier in twee kolommen,
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

  it("de stand van elke stap: klaar, Ã©Ã©n actieve, de rest open", () => {
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

  it("de paginatitel staat in hoofdletters in de donkere merkkleur, breekt een lang woord af en is 22 px op een telefoon en 32 px op een laptop", () => {
    for (const k of ["uppercase", "break-words", "text-[1.375rem]", "lg:text-[2rem]", "font-extrabold", "text-brand-700", "wg-titel"]) expect(KOP_TITEL.split(" "), k).toContain(k);
    expect(KOP_TITEL.split(" ")).not.toContain("text-ink");
    // in het donker is de titel wit, niet mint (de algemene regel maakt text-brand-700 daar mint)
    expect(lees("app/globals.css")).toContain('.app-scope[data-app="werkgever"][data-theme="dark"] .wg-titel { color: var(--app-fg) !important; }');
    expect(KOP_TERUG.split(" ")).toContain("min-h-11");
  });

  it("een formulier heeft twee kolommen op een laptop en staat onder elkaar op een telefoon", () => {
    expect(FORMULIER_RIJ).toContain("lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]");
    expect(FORMULIER_RIJ.split(" ")).toContain("grid");
    // minmax(0, â€¦): een lang veld maakt de pagina niet breder dan het scherm
    expect(FORMULIER_RIJ).not.toMatch(/grid-cols-\[\d+fr/);
  });

  it("de cellen van een lijst staan op een telefoon onder elkaar (geen zijwaarts schuiven)", () => {
    expect(TABEL_CEL.split(" ")).toContain("block");
    expect(TABEL_CEL.split(" ")).toContain("sm:table-cell");
    expect(lees("components/werkgever/LijstTabel.tsx")).not.toContain("overflow-x-auto");
  });

  it("de knoppen van een dialoog: op een telefoon de hoofdknop bovenaan, op een laptop links met de hoofdknop vÃ³Ã³r Annuleren", () => {
    const k = DIALOOG_ACTIES.split(" ");
    expect(k).toContain("flex-col-reverse");
    // de rij is omgekeerd (in de code staat Annuleren eerst), dus justify-end is de linkerkant
    expect(k).toContain("sm:flex-row-reverse");
    expect(k).toContain("sm:justify-end");
    expect(k).not.toContain("sm:flex-row");
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

  it("een lege lijst is Ã©Ã©n regel tekst in dezelfde kaart", () => {
    const bron = lees("components/werkgever/LijstTabel.tsx");
    expect(bron).toContain("if (rijen.length === 0) {");
    expect(bron).toContain("{leeg}");
    // de verborgen kolomnaam voor een schermlezer staat in een cel die `relative` is (TABEL_KOP)
    expect(bron).toContain('<span className="sr-only">{actieKop}</span>');
    expect(lees("components/werkgever/bouwstenen.ts")).toMatch(/TABEL_KOP = "relative /);
  });

  it("de dialoog is het bestaande sheet-patroon, met Ã©Ã©n formulier en geen formulier in een formulier", () => {
    const bron = lees("components/werkgever/Dialoog.tsx");
    expect(bron).toContain("<OnderSheet open={open}");
    expect(bron.match(/<form\b/g)?.length).toBe(1);
    expect(bron).toContain("{onVerstuur ? (");
  });

  it("de dialoog is op een laptop een breed venster: titel links, sluitknop rechtsboven, een scheidslijn en minder ronde hoeken", () => {
    expect(lees("components/werkgever/Dialoog.tsx")).toContain('vorm="venster"');
    expect(DIALOOG_BREEDTE).toBe("max-w-[640px]");
    const sheet = lees("components/app/OnderSheet.tsx");
    const venster = sheet.slice(sheet.indexOf('if (vorm === "venster") {'), sheet.indexOf("  return (\n    <div className=\"fixed inset-0 z-[210] flex items-end justify-center bg-ink/50 lg:items-center\""));
    expect(venster).toContain(DIALOOG_BREEDTE);
    expect(venster).toContain("lg:rounded-lg");
    expect(venster).not.toContain("rounded-3xl");
    expect(venster).not.toContain("text-center");
    expect(venster).toContain("border-b border-hair");
    // de sluitknop heeft een naam en een tikdoel van 44 px
    expect(venster).toContain("aria-label={sluitLabel}");
    expect(venster).toContain("grid h-11 w-11");
    // op een telefoon blijft het een sheet vanaf de onderkant
    expect(venster).toContain("items-end");
    expect(venster).toContain("lg:items-center");
    // de kop staat in de code na de inhoud: de focus gaat bij het openen naar het eerste veld, niet naar de sluitknop
    expect(venster.indexOf("{children}")).toBeLessThan(venster.indexOf('className="order-first'));
    // het venster staat buiten de schil (Portal) en zet daarom zelf de vormen van de werkgeversapp aan
    expect(venster).toContain('data-app="werkgever" className="app-scope ');
    // de gewone sheet (werker-app) is niet veranderd
    expect(sheet).toContain("max-w-md flex-col rounded-t-3xl bg-white");
    expect(sheet).toContain('vorm = "sheet"');
  });

  it("Locaties vraagt het verwijderen in de dialoog en meldt het netjes: geen venster van de browser", () => {
    const bord = lees("components/app/BranchesBoard.tsx");
    const code = bord.split("\n").filter((r) => !r.trim().startsWith("//")).join("\n");
    expect(code).not.toContain("window.confirm");
    expect(code).not.toContain("window.alert");
    expect(bord.match(/<Dialoog\b/g)?.length).toBe(2);
    expect(bord).toContain("aria-label={fmt(l.verwijderNaam, { naam: b.name })}");
    expect(bord).toContain('role="status"');
    expect(bord).toContain('role="alert"');
    // straat en huisnummer breken niet (op 1024 px stond "Grote Markt 1" op twee regels)
    expect(bord).toContain('<span key="straat" className="sm:whitespace-nowrap">');
    for (const d of [nl, en]) {
      for (const s of ["verwijderNaam", "verwijderTitel", "verwijderVraag", "verwijderKnop", "annuleren", "sluiten", "gedaanWeg", "foutWeg", "baken", "telling"] as const) {
        expect(d.locaties[s].length, s).toBeGreaterThan(3);
      }
    }
    expect(en.locaties.verwijderVraag).not.toBe(nl.locaties.verwijderVraag);
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
  const css = lees("app/globals.css");

  it("de maten zijn die van de meting: zijbalk 94 en 221 px, kopbalk 78 px, inhoud hooguit 1192 px en links uitgelijnd", () => {
    expect(SCHIL_RASTER_IN).toBe("lg:grid-cols-[94px_minmax(0,1fr)]");
    expect(SCHIL_RASTER_UIT).toBe("lg:grid-cols-[221px_minmax(0,1fr)]");
    expect(SCHIL_ZIJBALK_IN).toBe("lg:w-[94px]");
    expect(SCHIL_ZIJBALK_UIT).toBe("lg:w-[221px]");
    expect(SCHIL_KOPBALK.split(" ")).toContain("lg:h-[78px]");
    expect(SCHIL_INHOUD).toBe("max-w-[1192px]");
    expect(shell).toContain("collapsed ? SCHIL_RASTER_IN : SCHIL_RASTER_UIT");
    expect(shell).toContain("collapsed ? SCHIL_ZIJBALK_IN : SCHIL_ZIJBALK_UIT");
    expect(shell).toContain("<div className={SCHIL_INHOUD}>");
    // niet meer gecentreerd: links 32 px van de zijbalk (lg:px-8), geen gat
    expect(shell).not.toContain("mx-auto max-w-6xl");
    expect(shell).toMatch(/<main [^>]*lg:px-8/);
    expect(shell).not.toMatch(/\[72px|\[256px/);
  });

  it("de kopbalk heeft een zachte schaduw in plaats van een rand; in het donker een dunne lijn", () => {
    expect(shell).toMatch(/<header className=\{`wg-kop sticky top-0 z-20 flex items-center gap-3 bg-white px-4 lg:px-8 \$\{SCHIL_KOPBALK\}`\}>/);
    expect(css).toContain('.app-scope[data-app="werkgever"] .wg-kop { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); }');
    expect(css).toContain('.app-scope[data-app="werkgever"][data-theme="dark"] .wg-kop { box-shadow: none; border-bottom: 1px solid var(--app-edge); }');
  });

  it("de zijbalk staat op een laptop standaard uitgeklapt (zoals YoungOnes) en onthoudt alleen een bewuste keuze", () => {
    expect(shell).toContain("const [collapsed, setCollapsed] = useState(false);");
    expect(shell).toContain('setCollapsed(localStorage.getItem("zf-emp-collapsed") === "1");');
  });

  it("op een telefoon is het een lade met namen: inklappen geldt alleen vanaf een laptop", () => {
    expect(shell).toContain('<span className={collapsed ? "lg:sr-only" : ""}>{item.label}</span>');
    expect(shell).not.toMatch(/collapsed \? "w-\[/);
    expect(shell).toContain('aria-controls="employer-sidebar"');
  });

  it("de knop in- en uitklappen heeft een naam en zegt of de zijbalk open is; een ingeklapte regel heeft een tooltip", () => {
    expect(shell).toContain("aria-expanded={!collapsed}");
    expect(shell).toContain("aria-label={collapsed ? t.shell.expand : t.shell.collapse}");
    expect(shell).toContain("title={collapsed ? item.label : undefined}");
    expect(nl.shell.expand).toBe("Menu uitklappen");
    expect(en.shell.expand).toBe("Expand menu");
  });

  it("elke regel in de zijbalk is 48 px hoog (de tweede groep 44), `relative`, met een pictogram van 24 px op een vaste plek", () => {
    expect(shell).toMatch(/const railRij = "group relative mx-3 flex min-h-12 items-center gap-2 rounded-md pl-\[23px\] /);
    expect(shell).toMatch(/const railRijRustig = "group relative mx-3 flex min-h-11 /);
    expect(shell).toMatch(/const railIcoon = "[^"]*\[&>svg\]:h-6 \[&>svg\]:w-6"/);
    // de actieve regel is een lichter vlak, zonder streep ervoor
    expect(shell).toContain('active ? "bg-white/15 text-white"');
    expect(shell).not.toContain("w-[3px] rounded-full bg-brand-mint");
  });

  it("de zijbalk heeft twee groepen: de hoofdregels met Instellingen erachter, en een rustiger tweede groep", () => {
    expect(HOOFD_ADRESSEN).toEqual(["/werkgever", "/werkgever/diensten", "/werkgever/kalender", "/werkgever/favorieten"]);
    const adres: Record<string, string> = { start: "/werkgever", klussen: "/werkgever/diensten", planning: "/werkgever/kalender", werkers: "/werkgever/favorieten" };
    // een bedrijf met klussen (vlag aan): Jouw start, Klussen, Planning en Mijn werkers staan bovenaan; er valt niets weg
    const menu = menuVoor({ inApp: false, alleenFlexwerk: true }).map((p) => ({ href: adres[p.sleutel] ?? `/werkgever/x-${p.sleutel}`, sleutel: p.sleutel }));
    const { hoofd, rest } = splitsMenu(menu);
    expect(hoofd.map((m) => m.sleutel)).toEqual(["start", "klussen", "planning", "werkers"]);
    expect(rest.map((m) => m.sleutel)).toEqual(expect.arrayContaining(["berichten", "uren", "facturen", "hulp"]));
    expect(hoofd.length + rest.length).toBe(menu.length);
    // een bedrijf zonder klussen heeft Mijn werkers nog niet (lib/werkgever/werkruimte.ts, NA_EERSTE_KLUS)
    const kort = menuVoor({ inApp: false, alleenFlexwerk: true, nogGeenKlussen: true }).map((p) => p.sleutel as string);
    expect(kort).not.toContain("werkers");
    // de kopjes van de tweede groep: opeenvolgende regels met dezelfde naam bij elkaar
    expect(perSectie([{ section: "a" }, { section: "a" }, {}, { section: "b" }]).map((g) => [g.section, g.items.length])).toEqual([["a", 2], [null, 1], ["b", 1]]);
    expect(shell).toContain("const { hoofd, rest } = splitsMenu(nav);");
    expect(shell.indexOf("{hoofd.map(")).toBeLessThan(shell.indexOf("item={instellingen}"));
    expect(shell.indexOf("item={instellingen}")).toBeLessThan(shell.indexOf("{restGroepen.map("));
    expect(shell).toMatch(/<RailLink key=\{n\.href\} item=\{n\} active=\{isActive\(n\.href\)\} collapsed=\{collapsed\} rustig /);
  });

  it("Uitloggen staat alleen nog in het gebruikersmenu, niet meer in de zijbalk", () => {
    const zijbalk = shell.slice(shell.indexOf("<aside"), shell.indexOf("</aside>"));
    expect(zijbalk).not.toContain("logoutAction");
    expect(zijbalk).not.toContain("t.shell.logout");
    expect(shell.slice(shell.indexOf("{userMenu && ("))).toContain("{t.shell.logout}");
  });

  it("op een telefoon krijgt de bedrijfsnaam de ruimte: de menuknop is 44 px breed, de weergave staat in het gebruikersmenu en de hulp in de lade", () => {
    expect(shell).toContain('className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-lg border border-hairstrong text-ink lg:hidden"');
    expect(shell).toContain("line-clamp-2 min-w-0 break-words font-display text-sm font-bold leading-tight text-ink sm:line-clamp-1");
    expect(shell).toContain('<div className="hidden sm:block">'); // thema-toggle weg uit kopbalk: hulp staat nu in hidden sm:block
    expect(shell).toContain('<div className="overflow-hidden rounded-lg sm:hidden">');
    expect(shell).toContain("<ThemeToggleRow theme={theme}");
    // de taalkeuze is op een laptop even hoog als de knoppen ernaast (was 17 px)
    expect(shell).toMatch(/<label className="hidden h-11 items-center /);
  });

  it("de zijbalk is in beide thema's donker; de achtergrond is koel en licht en loopt door tot onderaan", () => {
    expect(shell).toContain("bg-gradient-to-b from-ink via-brand-700 to-ink text-white");
    expect(shell).not.toContain("app-bg noise");
    expect(shell).toContain('data-app="werkgever"');
    expect(css).toContain("--wg-vlak: #F1F3F8;");
    expect(css).toContain('html:has(.app-scope[data-app="werkgever"]) body { background-color: #F1F3F8; }');
    expect(css).toContain('html:has(.app-scope[data-app="werkgever"][data-theme="dark"]) body { background-color: #0B0D11; }');
    expect(css).toContain('.app-scope[data-app="werkgever"] { min-height: 100vh; min-height: 100dvh; }');
    // de donkere achtergrond van de pagina is dezelfde als die van de app
    expect(css).toContain("--app-surface: #0B0D11;");
  });

  it("de vormen van de werkgeversapp staan in globals.css, ook voor het donkere thema", () => {
    expect(css).toContain('.app-scope[data-app="werkgever"] .surface {');
    expect(css).toContain('.app-scope[data-app="werkgever"][data-theme="dark"] .surface { border-color: var(--app-edge); }');
    expect(css).toContain('.app-scope[data-app="werkgever"] .btn-primary,');
  });
});

describe("contrast en tikdoelen (ronde 2, gemeten op 390 px)", () => {
  const css = lees("app/globals.css");

  it("op een telefoon is elke knop van de werkgeversapp minstens 44 px hoog", () => {
    const blok = css.slice(css.indexOf("@media (max-width: 639px) {\n  .app-scope[data-app=\"werkgever\"] .btn-primary,"));
    expect(blok.startsWith("@media (max-width: 639px) {")).toBe(true);
    expect(blok.slice(0, 260)).toContain('.app-scope[data-app="werkgever"] .btn-ghost,');
    expect(blok.slice(0, 260)).toContain("{ min-height: 44px; }");
  });

  it("de gekozen optie bij Inchecken heeft een dikke groene rand op een licht vlak met donkere tekst, geen fel mint met grijs", () => {
    const scherm = lees("components/werkgever/IncheckenInstelling.tsx");
    expect(scherm).toContain('const gekozen = "border-brand-600 bg-brand-50";');
    expect(scherm).toContain("border-2");
    expect(scherm).not.toContain("bg-brand-mint");
    expect(scherm).not.toContain("text-neutralx-500");
    // bg-brand-50 heeft een regel voor het donkere thema
    expect(css).toMatch(/\.app-scope\[data-theme="dark"\] \.bg-brand-50/);
  });

  it("Planning: de dagen van de vorige en volgende maand zijn leesbaar, en Vorige en Volgende zijn 44 px op een telefoon", () => {
    const pagina = lees("app/werkgever/kalender/page.tsx");
    expect(pagina).not.toContain("text-neutralx-400/60");
    expect(pagina).toContain('? "font-semibold text-neutralx-700"');
    expect(pagina.match(/className="btn-ghost min-h-11 px-3 py-1\.5 text-sm sm:min-h-0"/g)?.length).toBe(2);
  });

  it("de schakelaars van de e-mailvoorkeuren hebben een tikvlak van 44 px; het bolletje blijft klein", () => {
    const m = lees("components/marketing/MailPrefsToggles.tsx");
    expect(m).toContain("relative mt-1 h-6 w-11 flex-shrink-0 rounded-full transition-colors before:absolute before:-inset-2.5 before:content-['']");
  });

  it("de sectietitels zijn groot en vet (20 px), ook op de kaarten van het Bedrijfsprofiel", () => {
    expect(lees("components/werkgever/bouwstenen.ts")).toContain('export const BLOK_KOP = "font-display text-xl font-bold leading-snug text-ink";');
    expect(lees("components/werkgever/VolumeCard.tsx")).toContain('<span className="block font-display text-xl font-bold leading-snug text-ink">{v.kop}</span>');
    expect(lees("components/werkgever/FastPaySettings.tsx")).toContain('<h2 className="font-display text-xl font-bold leading-snug text-ink">{f.kop}</h2>');
  });

  it("de titel van een pagina onder een samengevoegde ingang is de naam uit het menu, in beide talen", () => {
    for (const [pagina, groep] of [["kalender", "planning"], ["favorieten", "werkers"], ["uren", "uren"]] as const) {
      expect(lees(`app/werkgever/${pagina}/page.tsx`), pagina).toContain(`samenTitel("${groep}", `);
    }
    const layout = lees("app/werkgever/layout.tsx");
    for (const g of ["planning", "werkers", "regels", "cijfers", "uren"]) expect(layout, g).toContain(`samenLabel("${g}", locale)`);
    const tabs = lees("lib/werkgever/samen-tabs.ts");
    expect(tabs).toContain('werkers: "My workers",');
    expect(tabs).toContain('locale === "en" ? SAMEN_LABEL_EN[groep] : SAMEN_GROEPEN[groep].label');
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
