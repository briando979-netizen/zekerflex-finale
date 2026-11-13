import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Toegankelijkheid en toetsenbord van de nieuwe werkerschermen van 12 nov (schermlezer, focus, doelgrootte 44 px).
// Bronkontrole: vitest draait hier zonder browser, dus dit bewaakt dat de reparaties blijven staan.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const aantal = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

describe("de rondleiding", () => {
  const s = bron("components/app/WerkerRondleiding.tsx");
  it("is een echte dialoog: Escape, Tab blijft binnen, focus terug naar waar hij vandaan kwam (useDialog)", () => {
    expect(s).toContain('role="dialog"');
    expect(s).toContain('aria-modal="true"');
    expect(s).toContain("useDialog(open, sluit)");
    expect(s).toContain("ref={dialoog}");
    // één Escape-afhandeling (die van useDialog), geen tweede op window
    expect(s).not.toContain('e.key === "Escape"');
  });
  it("de focus staat op Volgende na useDialog, en de nieuwe stap wordt voorgelezen (live-regio)", () => {
    expect(s.indexOf("useDialog(open, sluit)")).toBeLessThan(s.indexOf("knop.current?.focus()"));
    expect(s).toContain('aria-live="polite"');
  });
  it("de knoppen zijn minstens 44 px hoog", () => {
    expect(aantal(s, /min-h-\[44px\]/g)).toBeGreaterThanOrEqual(3);
  });
});

describe("de bevestiging vóór het insturen (OnderSheet)", () => {
  it("de sheet geeft de uitleg door als beschrijving van de dialoog", () => {
    const sheet = bron("components/app/OnderSheet.tsx");
    expect(sheet).toContain("aria-describedby={beschrijvingId}");
    expect(sheet).toContain('role="dialog"');
    expect(sheet).toContain("useDialog(");
  });
  it("beide plekken koppelen de uitleg, de knoppen zijn 44 px, en een foto-voorbeeld wordt niet dubbel voorgelezen", () => {
    for (const [f, id] of [["components/app/OnboardingForm.tsx", "bevestig-insturen-uitleg"], ["components/app/IdScan.tsx", "idscan-bevestig-uitleg"]] as const) {
      const s = bron(f);
      expect(s, f).toContain(`beschrijvingId="${id}"`);
      expect(s, f).toContain(`id="${id}"`);
      expect(aantal(s, /min-h-\[44px\] flex-1/g), f).toBe(2);
    }
    const scan = bron("components/app/IdScan.tsx");
    expect(scan).toContain('alt=""');
    expect(scan).toContain('<figcaption className="mt-1 text-xs text-neutralx-500">');
  });
});

describe("de kaart met het BSN-veld", () => {
  const s = bron("components/app/GegevensMist.tsx");
  it("label aan het veld, foutmelding role=alert, knop en links 44 px", () => {
    expect(s).toContain('htmlFor="gegevens-bsn"');
    expect(s).toContain('role="alert"');
    expect(s).toContain("min-h-[44px] px-4");
    // de overeenkomst, de fiscale gegevens (alleen nog als terugval) en "KOR nog aanvragen" bij het btw-veld (13 nov)
    expect(aantal(s, /inline-flex min-h-\[44px\] items-center/g)).toBe(3);
  });
  it("na het opslaan gaat de focus naar de kop (het veld verdwijnt), en die kop kan focus krijgen", () => {
    expect(s).toContain('document.getElementById("gegevens-mist-kop")?.focus()');
    expect(s).toContain('id="gegevens-mist-kop" tabIndex={-1}');
  });
  it("de sprong naar de overeenkomst landt op een element dat focus kan krijgen", () => {
    expect(bron("app/dashboard/verificatie/page.tsx")).toContain('id="uitzendovereenkomst" tabIndex={-1}');
  });
});

describe("de uitzendovereenkomst lezen vóór het tekenen", () => {
  const s = bron("components/app/UitzendContractCard.tsx");
  it("lezen/verbergen is gekoppeld aan het paneel (aria-controls) en minstens 44 px", () => {
    expect(aantal(s, /aria-controls=\{paneelId\}/g)).toBe(2);
    expect(aantal(s, /id=\{paneelId\}|id=\{id\}/g)).toBeGreaterThanOrEqual(1);
    expect(s).toContain('id={id} role="region"');
  });
  it("het vakje 'gelezen' is groot genoeg, en de uitleg waarom het uit staat hangt eraan", () => {
    expect(s).toContain("aria-describedby={geopend ? undefined : hintId}");
    expect(s).toContain("h-5 w-5");
    expect(s).toContain("min-h-[44px] items-center gap-3");
  });
  it("laden wordt aangekondigd, een fout is role=alert, en na het tekenen gaat de focus naar de melding", () => {
    expect(aantal(s, /role="status"/g)).toBeGreaterThanOrEqual(3);
    expect(s).toContain('role="alert"');
    expect(s).toContain("focusNaTekenen.current = true");
    expect(s).toContain("getekendRef.current?.focus()");
  });
  it("geen tekst kleiner dan 12 px", () => {
    expect(s).not.toContain("text-[11px]");
  });
});

describe("de stappen bovenaan Klussen", () => {
  const s = bron("components/app/WerkerStartWizard.tsx");
  it("alleen een afgeronde stap is een knop (geen uitgeschakelde knop als titel)", () => {
    expect(s).not.toContain("disabled={stand !== \"klaar\"}");
    expect(s).toContain('stand === "klaar" ? (');
  });
  it("elke 'Wijzigen' heeft een eigen naam per stap, en doelen zijn 44 px", () => {
    expect(aantal(s, /aria-label=\{`\$\{t\.wijzig\}: \$\{label\[k\]\}`\}/g)).toBe(3);
    expect(s).toContain("h-11 w-11");
    expect(aantal(s, /min-h-\[44px\]/g)).toBeGreaterThanOrEqual(10);
  });
  it("het keuzerondje van de werkvorm werkt met de pijltjestoetsen en heeft één tabstop", () => {
    expect(s).toContain('role="radiogroup"');
    expect(s).toContain("ArrowRight");
    expect(s).toContain("pick === null && opt === KINDS[0]");
  });
  it("de foutmeldingen hebben role=alert en de voortgang een naam", () => {
    expect(aantal(s, /role="alert"/g)).toBeGreaterThanOrEqual(2);
    expect(s).toContain('role="progressbar"');
  });
});
