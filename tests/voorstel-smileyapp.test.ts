import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BASE, BLOG, PAKKETTEN, VOORSTEL_BAND, blogBericht, euro, pakket, veelgesteld } from "@/lib/voorstel/smileyapp";
import { smileyappKennis } from "@/lib/voorstel/smileyapp-chat";
import { smileyappManifest } from "@/lib/voorstel/smileyapp-app";
import { gezichtKleur, mondPad } from "@/lib/voorstel/smileyapp-gezicht";
import { voorstelServiceWorker } from "@/lib/voorstel/service-worker";
import { kortPad, voorstelPad } from "@/lib/voorstel/subdomein";
import { buildContentSecurityPolicy } from "@/lib/security/csp";
import { antwoordZonderModel, bouwSysteem } from "@/lib/sitechat/regels";

// ---------------------------------------------------------------------------
// Ontwerpvoorstel SmileyApp (smileyapp.zekerflex.com, 18 nov 2026). Tot Martijn
// akkoord geeft: op elke pagina de voorstelband, noindex (meta én X-Robots-Tag),
// geen hotlinks naar smileyapp.nl (alles staat in public/voorstel/smileyapp) en
// de prijzen uit één bestand (lib/voorstel/smileyapp.ts), ook in de FAQ en de chat.
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8").split("\r\n").join("\n");

function bestanden(map: string): string[] {
  const uit: string[] = [];
  const loop = (rel: string) => {
    for (const naam of readdirSync(path.join(ROOT, rel))) {
      const r = `${rel}/${naam}`;
      if (statSync(path.join(ROOT, r)).isDirectory()) loop(r);
      else if (/\.(ts|tsx|css)$/.test(naam)) uit.push(r);
    }
  };
  loop(map);
  return uit;
}

/** Alle code van het voorstel: pagina's, onderdelen, API en de lib-bestanden. */
const CODE = [
  ...bestanden("app/voorstel/smileyapp"),
  ...bestanden("components/voorstel/smileyapp"),
  ...bestanden("app/api/voorstel/smileyapp"),
  ...readdirSync(path.join(ROOT, "lib/voorstel"))
    .filter((n) => n.startsWith("smileyapp"))
    .map((n) => `lib/voorstel/${n}`),
];
const PAGINAS = CODE.filter((f) => f.startsWith("app/voorstel/smileyapp/") && f.endsWith("/page.tsx"));

describe("SmileyApp-voorstel: band en noindex", () => {
  it("de scan vindt de pagina's", () => {
    expect(PAGINAS.length).toBeGreaterThanOrEqual(5);
    expect(CODE).toContain("lib/voorstel/smileyapp.ts");
  });

  it("de band staat in de layout, dus op elke pagina, met precies de afgesproken tekst", () => {
    expect(VOORSTEL_BAND).toBe("Ontwerpvoorstel van ZekerFlex voor SmileyApp. De officiële website staat op smileyapp.nl.");
    const layout = lees("app/voorstel/smileyapp/layout.tsx");
    expect(layout).toContain('VOORSTEL_BAND.split("smileyapp.nl")');
    expect(layout).toMatch(/\{voorBand\}\s*<a href=\{OFFICIELE_SITE\}/);
  });

  it("noindex als meta en als X-Robots-Tag, op zekerflex.com én op het subdomein", () => {
    expect(lees("app/voorstel/smileyapp/layout.tsx")).toContain("robots: { index: false, follow: false");
    expect(lees("next.config.mjs")).toMatch(/source: "\/voorstel\/smileyapp\/:pad\*",\s*headers: \[\{ key: "X-Robots-Tag", value: "noindex, nofollow" \}\]/);
    const mw = lees("middleware.ts");
    expect(mw).toContain('const VOORSTEL_ROBOTS = "noindex, nofollow";');
    expect(mw).toContain('res.headers.set("X-Robots-Tag", VOORSTEL_ROBOTS);');
    expect(lees("app/voorstel/smileyapp/manifest.webmanifest/route.ts")).toContain('"X-Robots-Tag": "noindex, nofollow"');
  });

  it("niet in de sitemap, geen canonical en geen LocalBusiness-gegevens", () => {
    expect(lees("app/sitemap.ts")).not.toContain("/voorstel/smileyapp");
    for (const f of CODE) {
      const s = lees(f);
      expect(s, f).not.toMatch(/canonical\(/);
      expect(s, f).not.toMatch(/LocalBusiness|application\/ld\+json|ldJson\(/);
    }
  });

  it("elke pagina heeft precies één h1; de layout geen", () => {
    expect(lees("app/voorstel/smileyapp/layout.tsx")).not.toContain("<h1");
    for (const f of [...PAGINAS.filter((p) => !p.includes("[...pad]")), "app/voorstel/smileyapp/not-found.tsx"]) {
      expect(lees(f).match(/<h1[\s>]/g) ?? [], f).toHaveLength(1);
    }
  });

  // Tot 19 nov 2026 stond hier: nergens een <form> in SmileyApp-code. Die dag vroeg de eigenaar om een werkende
  // demo-aanvraag en een beheer voor Martijn en zijn medewerkers. Daarom mag een <form> nu in precies deze bestanden en
  // nergens anders: het demo- en partnerformulier (één onderdeel) en de schermen van het beheer. Een aanvraag gaat
  // alleen naar het eigen beheer (KV voorstel-smileyapp:); er gaat geen mail met gegevens naar derden. Het
  // contactformulier blijft dicht: GeslotenFormulier houdt zijn uitgeschakelde fieldset, zonder <form>.
  const MET_FORMULIER = [
    "components/voorstel/smileyapp/AanvraagFormulier.tsx",
    "components/voorstel/smileyapp/beheer/Gesprekken.tsx",
    "components/voorstel/smileyapp/beheer/Inloggen.tsx",
    "components/voorstel/smileyapp/beheer/SmileyBeheer.tsx",
    "components/voorstel/smileyapp/beheer/Team.tsx",
  ];

  it("het contactformulier staat dicht; een <form> staat alleen in de afgesproken bestanden", () => {
    const f = lees("components/voorstel/smileyapp/GeslotenFormulier.tsx");
    expect(f).not.toMatch(/<form[\s>]/);
    expect(f).toContain("<fieldset disabled");
    expect(lees("app/voorstel/smileyapp/contact/page.tsx")).toContain("<GeslotenFormulier ");
    const metForm = CODE.filter((p) => /<form[\s>]/.test(lees(p)));
    expect(metForm.sort()).toEqual(MET_FORMULIER);
    // de openbare formulieren sturen alleen naar de eigen aanvraagroute, nooit naar een adres van buiten
    const formulier = lees("components/voorstel/smileyapp/AanvraagFormulier.tsx");
    expect(formulier).toContain('fetch("/api/voorstel/smileyapp/aanvraag"');
    expect(formulier).not.toMatch(/action=|https?:\/\//);
  });
});

describe("SmileyApp-voorstel: geen hotlinks, alles uit de eigen opslag", () => {
  it("geen beeld, video of script van smileyapp.nl, hun CDN of Vimeo's beeldserver", () => {
    for (const f of CODE) {
      const s = lees(f);
      expect(s, f).not.toMatch(/wp-content|nitrocdn|vimeocdn|i\.vimeo/);
      // src, poster, srcSet en url() alleen naar eigen paden
      expect(s, f).not.toMatch(/(?:src|poster|srcSet)=\{?["'`]https?:\/\/(?!player\.vimeo\.com\/)/);
      expect(s, f).not.toMatch(/url\(\s*["']?https?:/);
    }
  });

  it("elk beeld dat de code noemt, staat in public/voorstel/smileyapp en in CREDITS.md", () => {
    const credits = lees("public/voorstel/smileyapp/CREDITS.md");
    const genoemd = new Set(CODE.flatMap((f) => [...lees(f).matchAll(/beeld\("([^"]+)"\)/g)].map((m) => m[1] ?? "")));
    expect(genoemd.size).toBeGreaterThan(15);
    for (const b of genoemd) {
      expect(existsSync(path.join(ROOT, "public/voorstel/smileyapp", b)), b).toBe(true);
      expect(credits, b).toContain(b);
    }
    // en andersom: niets in de map zonder herkomst
    for (const b of readdirSync(path.join(ROOT, "public/voorstel/smileyapp")).filter((n) => n !== "CREDITS.md")) expect(credits, b).toContain(b);
  });

  it("de video laadt pas na een klik, via player.vimeo.com met dnt=1", () => {
    const v = lees("components/voorstel/smileyapp/VimeoVideo.tsx");
    expect(v).toContain("https://player.vimeo.com/video/${id}?dnt=1");
    expect(v).toMatch(/speel \? \(\s*<iframe/);
  });
});

describe("SmileyApp-voorstel: de prijzen komen uit één bestand", () => {
  it("de bedragen van smileyapp.nl, met vaste opmaak", () => {
    expect(PAKKETTEN.map((p) => [p.id, p.prijs, p.minimaalMaanden])).toEqual([
      ["basis", 49.95, 12],
      ["iso", 249.95, 6],
      ["mkb", 1499.95, 6],
      ["maatwerk", null, null],
    ]);
    expect(euro(49.95)).toBe("€ 49,95");
    expect(euro(1499.95)).toBe("€ 1.499,95");
    expect(pakket("iso")?.naam).toBe("ISO Pakket");
    expect(pakket("constructor")).toBeUndefined();
  });

  it("geen bedrag in een pagina, onderdeel of de chat: alleen in lib/voorstel/smileyapp.ts", () => {
    const BEDRAG = /\b(?:49|249|1499)[.,]95\b|1\.499,95|€\s?\d/;
    for (const f of CODE.filter((x) => x !== "lib/voorstel/smileyapp.ts")) expect(lees(f), f).not.toMatch(BEDRAG);
    const data = lees("lib/voorstel/smileyapp.ts");
    for (const p of ["49.95", "249.95", "1499.95"]) expect(data.split(`prijs: ${p},`).length - 1, p).toBe(1);
  });

  it("de veelgestelde vragen en de chat noemen dezelfde prijzen", () => {
    const kost = veelgesteld().find((v) => v.vraag === "Wat kost Smileyapp?")?.antwoord ?? "";
    const kennis = smileyappKennis();
    const prijzen = kennis.fragmenten.find((f) => f.titel === "Pakketten en prijzen")?.tekst ?? "";
    for (const p of PAKKETTEN) {
      const bedrag = p.prijs === null ? "op aanvraag" : euro(p.prijs);
      expect(kost, p.naam).toContain(bedrag);
      expect(prijzen, p.naam).toContain(bedrag);
    }
  });
});

describe("SmileyApp-voorstel: subdomein, CSP en app", () => {
  it("smileyapp.zekerflex.com toont alleen het voorstel en zijn eigen API", () => {
    expect(voorstelPad("smileyapp", "/")).toBe(BASE);
    expect(voorstelPad("smileyapp", "/blog")).toBe(`${BASE}/blog`);
    expect(voorstelPad("smileyapp", "/api/voorstel/smileyapp/chat")).toBe("/api/voorstel/smileyapp/chat");
    expect(voorstelPad("smileyapp", "/api/voorstel/schwarzwald/agenda")).toBeNull();
    expect(voorstelPad("smileyapp", "/api/admin/users")).toBeNull();
    expect(voorstelPad("schwarzwald", "/api/voorstel/smileyapp/chat")).toBeNull();
    expect(kortPad(`${BASE}/blog/${BLOG[0]?.slug ?? ""}`, BASE)).toBe(`/blog/${BLOG[0]?.slug ?? ""}`);
    const caddy = lees("deploy/caddy/Caddyfile");
    expect(caddy).toMatch(/smileyapp\.zekerflex\.com \{[\s\S]*?header_up -X-ZF-Site-Host\s+header_up X-ZF-Voorstel smileyapp/);
  });

  it("Vimeo mag in een frame, alleen in de omgeving van dit voorstel", () => {
    const frame = (pathname: string) => buildContentSecurityPolicy({ dev: false, nonce: "n", pathname }).split("; ").find((d) => d.startsWith("frame-src")) ?? "";
    for (const p of [BASE, `${BASE}/blog`, `${BASE}/contact`]) expect(frame(p), p).toContain("https://player.vimeo.com");
    for (const p of ["/", "/voorstel/schwarzwald", "/voorstel/smileyappx", "/admin", "/login"]) expect(frame(p), p).not.toContain("vimeo");
  });

  it("de app (PWA): manifest met iconen die bestaan, en een eigen service worker met offline-melding", () => {
    for (const sub of [true, false]) {
      const m = smileyappManifest(sub);
      expect(m.start_url).toBe(sub ? "/" : BASE);
      expect(m.scope).toBe(m.start_url);
      expect(m.display).toBe("standalone");
      expect(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
      expect(m.icons.some((i) => i.sizes === "192x192")).toBe(true);
      for (const i of m.icons) expect(existsSync(path.join(ROOT, "public", i.src)), i.src).toBe(true);
    }
    expect(lees("app/voorstel/smileyapp/layout.tsx")).toContain("manifest: `${BASE}/manifest.webmanifest`");
    const sw = voorstelServiceWorker("smileyapp");
    expect(sw).toContain("addEventListener('fetch'");
    expect(sw).toContain("Je bent offline");
    expect(voorstelServiceWorker("schwarzwald")).toContain("registration.unregister()");
    expect(voorstelServiceWorker(null)).toContain("registration.unregister()");
  });

  it("de smiley lacht bij een 10 en fronst bij een 1, in de kleuren van het logo", () => {
    expect(gezichtKleur(10)).toBe("#5ABA8E");
    expect(gezichtKleur(1)).toBe("#F0705F");
    const y = (pad: string) => pad.split(" ").map(Number).filter((n) => !Number.isNaN(n));
    const [, hoek10, , midden10] = y(mondPad(10));
    const [, hoek1, , midden1] = y(mondPad(1));
    expect(midden10 ?? 0).toBeGreaterThan(hoek10 ?? 0);
    expect(midden1 ?? 0).toBeLessThan(hoek1 ?? 0);
  });
});

describe("SmileyApp-voorstel: de AI-assistent", () => {
  // 19 nov 2026: de chat belooft alleen een medewerker als iemand van SmileyApp echt in het beheer kan inloggen
  // (heeftTeam: een account met wachtwoord dat niet geblokkeerd is). Zonder team blijft alles zoals het was.
  it("zonder team: weet alleen wat op hun site staat en belooft geen medewerker", () => {
    const k = smileyappKennis();
    expect(k.medewerker).toBe(false);
    expect(smileyappKennis({ medewerker: false }).medewerker).toBe(false);
    expect(k.contact).toBe("mail naar info@smileyapp.nl");
    const systeem = bouwSysteem({ bedrijf: k.bedrijf, omschrijving: k.omschrijving, regels: k.regels ?? [], medewerker: false }, k.fragmenten);
    expect(systeem).not.toContain('knop "Medewerker"');
    expect(systeem).toContain("Er leest geen medewerker mee");
    expect(systeem).toContain("ontwerpvoorstel van ZekerFlex");
    expect(antwoordZonderModel("parkeren", k.fragmenten, k.contact, false)).not.toContain("Medewerker");
    // de standaard blijft zoals hij was
    expect(bouwSysteem({ bedrijf: "X", omschrijving: "Y" }, [])).toContain('knop "Medewerker"');
  });

  it("met team: de knop Medewerker verschijnt, en alleen dan", () => {
    const k = smileyappKennis({ medewerker: true });
    expect(k.medewerker).toBe(true);
    // dezelfde kennis, alleen de belofte verschilt
    expect(k.fragmenten).toEqual(smileyappKennis().fragmenten);
    // lib/sitechat/antwoord.ts geeft medewerker alleen door als het false is; true is de standaard van bouwSysteem
    expect(bouwSysteem({ bedrijf: k.bedrijf, omschrijving: k.omschrijving, regels: k.regels ?? [] }, k.fragmenten)).toContain('knop "Medewerker"');
    // de route en de layout vragen het aan dezelfde bron, en de actie "mens" wordt zonder team geweigerd vóór er iets bewaard is
    const r = lees("app/api/voorstel/smileyapp/chat/route.ts");
    expect(r).toContain("const medewerker = await heeftTeam();");
    expect(r).toContain("smileyappKennis({ medewerker })");
    expect(r.indexOf("if (!medewerker) throw")).toBeGreaterThan(0);
    expect(r.indexOf("if (!medewerker) throw")).toBeLessThan(r.indexOf("await voegBerichtToe("));
    const layout = lees("app/voorstel/smileyapp/layout.tsx");
    expect(layout).toContain("const team = await heeftTeam();");
    expect(layout).toContain("<SmileyChat team={team} />");
    expect(lees("components/voorstel/smileyapp/SmileyChat.tsx")).toContain("medewerker={team}");
    expect(lees("lib/voorstel/smileyapp-accounts.ts")).toMatch(/heeftTeam[\s\S]{0,200}some\(\(a\) => !!a\.wachtwoord && !a\.geblokkeerd\)/);
  });

  it("de blog staat er helemaal in, en een onbekend bericht bestaat niet", () => {
    expect(BLOG).toHaveLength(4);
    expect(blogBericht("constructor")).toBeUndefined();
    const titels = smileyappKennis().fragmenten.map((f) => f.titel);
    for (const b of BLOG) expect(titels).toContain(`Blog: ${b.titel}`);
  });

  it("de chat-API is openbaar maar begrensd en alleen van de eigen site", () => {
    const r = lees("app/api/voorstel/smileyapp/chat/route.ts");
    expect(r).toContain("zelfdeHerkomst(request.headers, request.url)");
    expect(r).toMatch(/enforceRateLimit\(\{ name: "smileyapp-chat-ip"/);
    expect(r).toContain("jsonBegrensd(request, 16_000)");
    expect(r.indexOf("await enforceRateLimit")).toBeGreaterThan(0);
    expect(r.indexOf("await enforceRateLimit")).toBeLessThan(r.indexOf("await jsonBegrensd"));
  });
});

describe("SmileyApp-voorstel: koppen breken op een breed scherm niet midden in een woord", () => {
  // 19 nov 2026 (71): op 1440 stond "Klanttevreden-heid", "sim-pelste", "een-voudig" in de koppen. Oorzaak: [hyphens:auto]
  // op elke breedte, en de hero-kop liep op lg tot 4,4rem (70,4 px) terwijl de kolom 589 px is en het woord 618 px: dat
  // past nooit, dus brak de browser het af. Op de telefoon blijft het afbreken aan (daar is het nodig op 320 px).
  const KOPPEN = [
    ["app/voorstel/smileyapp/page.tsx", "<h1 "],
    ["components/voorstel/smileyapp/Blokken.tsx", "<h2 "],
    ["app/voorstel/smileyapp/blog/[slug]/page.tsx", "<h1 "],
  ] as const;

  it("elke grote kop houdt afbreken op de telefoon en zet het vanaf md uit", () => {
    for (const [bestand, tag] of KOPPEN) {
      const regel = lees(bestand).split("\n").find((r) => r.includes(tag) && r.includes("font-display"));
      expect(regel, bestand).toBeDefined();
      expect(regel, bestand).toContain("[hyphens:auto] md:[hyphens:manual]");
    }
  });

  it("de hero-kop is op lg ten hoogste 4rem, zodat het langste woord in de kolom past", () => {
    const regel = lees("app/voorstel/smileyapp/page.tsx").split("\n").find((r) => r.includes("<h1 ")) ?? "";
    expect(regel).toContain("lg:text-[clamp(3rem,5.3vw,4rem)]");
    // 4rem = 64 px: "Klanttevredenheid" is dan 560 px (gemeten) in een kolom van 589 px; bij 4,4rem was het 618 px.
    expect(64 * (618 / 70.4)).toBeLessThan(589);
  });

  it("Schwarzwald is niet geraakt", () => {
    for (const f of readdirSync(path.join(ROOT, "app/voorstel/schwarzwald")).filter((f) => f.endsWith(".tsx"))) {
      expect(lees("app/voorstel/schwarzwald/" + f)).not.toContain("md:[hyphens:manual]");
    }
  });
});
