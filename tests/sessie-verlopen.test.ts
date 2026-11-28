import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { HERLAAD_SLEUTEL, isNietIngelogd, isNietToegestaan, stopBijVerlopenSessie, type SessieOmgeving } from "@/lib/app/sessie-verlopen";

// 28 nov 2026 gemeten in het Caddy-log: 17.494 en 15.016 keer een 401 op /api/werkgever/recent-responses,
// /api/inbox en /api/me/notifications op 23 en 24 november, vanuit 24 adressen. Tabbladen met een verlopen
// sessie die eeuwig doorvroegen — en de werkgever zag géén reacties op zijn klus zonder te weten waarom.

/** Een nagemaakte browser: onthoudt wat er bewaard wordt en of er herladen is. */
function nepBrowser(begin: Record<string, string> = {}) {
  const opslag = { ...begin };
  let herladen = 0;
  const omgeving: SessieOmgeving = {
    lees: (s) => opslag[s] ?? null,
    bewaar: (s, v) => {
      opslag[s] = v;
    },
    herlaad: () => {
      herladen += 1;
    },
  };
  return { omgeving, opslag, keerHerladen: () => herladen };
}

describe("isNietIngelogd", () => {
  it("alleen 401 betekent 'niet meer ingelogd'", () => {
    expect(isNietIngelogd(401)).toBe(true);
    expect(isNietIngelogd(200)).toBe(false);
    expect(isNietIngelogd(403)).toBe(false); // 403 is iets anders: wel ingelogd, geen recht
    expect(isNietIngelogd(423)).toBe(false);
    expect(isNietIngelogd(500)).toBe(false);
  });
});

describe("stopBijVerlopenSessie", () => {
  it("laat een gewoon antwoord gewoon door", () => {
    const b = nepBrowser();
    expect(stopBijVerlopenSessie(200, b.omgeving)).toBe(false);
    expect(b.keerHerladen()).toBe(0);
  });

  it("zegt bij een 401 dat de aanroeper moet stoppen, en herlaadt één keer", () => {
    const b = nepBrowser();
    expect(stopBijVerlopenSessie(401, b.omgeving)).toBe(true);
    expect(b.keerHerladen()).toBe(1);
    expect(b.opslag[HERLAAD_SLEUTEL]).toBe("1");
  });

  it("herlaadt nooit twee keer in hetzelfde tabblad (geen herlaadlus)", () => {
    const b = nepBrowser();
    stopBijVerlopenSessie(401, b.omgeving);
    stopBijVerlopenSessie(401, b.omgeving);
    stopBijVerlopenSessie(401, b.omgeving);
    expect(b.keerHerladen()).toBe(1);
    // maar hij blijft wél zeggen dat er gestopt moet worden
    expect(stopBijVerlopenSessie(401, b.omgeving)).toBe(true);
  });

  it("een tabblad dat al herladen had, herlaadt niet opnieuw", () => {
    const b = nepBrowser({ [HERLAAD_SLEUTEL]: "1" });
    expect(stopBijVerlopenSessie(401, b.omgeving)).toBe(true);
    expect(b.keerHerladen()).toBe(0);
  });

  it("zonder bruikbare opslag (privémodus) wordt er niet herladen, maar wel gestopt", () => {
    let herladen = 0;
    const kapot: SessieOmgeving = {
      lees: () => {
        throw new Error("opslag geblokkeerd");
      },
      bewaar: () => {
        throw new Error("opslag geblokkeerd");
      },
      herlaad: () => {
        herladen += 1;
      },
    };
    expect(stopBijVerlopenSessie(401, kapot)).toBe(true);
    expect(herladen).toBe(0); // liever geen herlading dan een lus
  });

  it("een herlading die niet lukt laat de aanroeper alsnog stoppen", () => {
    const omgeving: SessieOmgeving = {
      lees: () => null,
      bewaar: () => undefined,
      herlaad: () => {
        throw new Error("navigatie geblokkeerd");
      },
    };
    expect(stopBijVerlopenSessie(401, omgeving)).toBe(true);
  });
});

describe("403: wel ingelogd, maar mag dit niet", () => {
  it("alleen 403 betekent 'dit mag je niet'", () => {
    expect(isNietToegestaan(403)).toBe(true);
    expect(isNietToegestaan(401)).toBe(false);
    expect(isNietToegestaan(200)).toBe(false);
    expect(isNietToegestaan(423)).toBe(false);
  });

  // /api/werkgever/recent-responses eist een van vier rollen en wordt elke 6 seconden gevraagd. Wijzigt
  // iemands rol of bedrijf terwijl zijn tabblad openstaat, dan weigert de route met 403. Gemeten op
  // 24 nov: 78 van die 403's op één dag. AGENTS.md: CrowdSec telt een reeks 403's als inbraakpoging en
  // blokkeert het hele IP vier uur — dus ook de app voor dat bedrijf. Eén 403 is geen reeks.
  it("stopt met vragen bij een 403, zodat er nooit een reeks ontstaat", () => {
    const b = nepBrowser();
    expect(stopBijVerlopenSessie(403, b.omgeving)).toBe(true);
  });

  it("herlaadt NIET bij een 403: die bezoeker is ingelogd, herladen helpt hem niet", () => {
    const b = nepBrowser();
    stopBijVerlopenSessie(403, b.omgeving);
    expect(b.keerHerladen()).toBe(0);
    // en het mag de herlaadmarkering niet verbruiken, zodat een latere 401 nog wel naar de inlogpagina gaat
    expect(b.opslag[HERLAAD_SLEUTEL]).toBeUndefined();
    expect(stopBijVerlopenSessie(401, b.omgeving)).toBe(true);
    expect(b.keerHerladen()).toBe(1);
  });

  it("andere foutcodes laten de poller gewoon doorgaan (een storing is tijdelijk)", () => {
    const b = nepBrowser();
    for (const code of [404, 422, 423, 429, 500, 502, 503]) {
      expect(stopBijVerlopenSessie(code, b.omgeving), String(code)).toBe(false);
    }
    expect(b.keerHerladen()).toBe(0);
  });
});

describe("bewaker: de pollers stoppen echt bij een verlopen sessie", () => {
  const lees = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("de drie schermen uit de meting gebruiken het hulpje", () => {
    for (const p of [
      "components/app/NotificationsBell.tsx",
      "components/app/RecentResponseAlert.tsx",
      "components/chat/ChatDock.tsx",
    ]) {
      expect(lees(p), `${p} moet stopMetPollen gebruiken, anders blijft het tabblad doorvragen`).toContain("stopMetPollen(");
    }
  });

  it("de meldingenbel stopt zijn eigen timer", () => {
    const src = lees("components/app/NotificationsBell.tsx");
    expect(src).toContain("gestopt.current = true");
    expect(src).toContain("clearInterval(id)");
  });

  it("de reactiemelding van de werkgever stopt zijn timer van 6 seconden", () => {
    const src = lees("components/app/RecentResponseAlert.tsx");
    expect(src).toContain("gestopt = true");
    // de timer mag niet meer blind elke 6 s doorvragen
    expect(src).not.toContain("setInterval(() => void poll(), POLL_MS)");
  });

  it("de chat laat zijn drie timers van available afhangen", () => {
    const src = lees("components/chat/ChatDock.tsx");
    expect(src).toContain("[loadThreads, available]");
    expect(src).toContain("[active, available, loadThread]");
    expect(src).toContain("[active, available]");
  });
});
