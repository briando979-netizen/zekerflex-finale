"use client";

import Link from "next/link";

// ---------------------------------------------------------------------------
// "Hoe werkt het?" — de handleiding van de werkbank, in gewone taal, voor de
// eigenaar die ZekerFlex zelf bedient (zonder Claude). Elke taak verwijst met
// een knop naar het tabblad waar het gebeurt. Bewust statisch: geen API nodig,
// dus ook leesbaar als de Bouwer of de live-zetter even niet reageert.
// ---------------------------------------------------------------------------

export type HandleidingTab = "ai" | "bouwer" | "live";

interface Taak {
  titel: string;
  stappen: string[];
  tip?: string;
  naar?: { tab: HandleidingTab; label: string } | { href: string; label: string };
}

const TAKEN: Taak[] = [
  {
    titel: "Iets laten bouwen of veranderen",
    stappen: [
      "Open het tabblad Bouwer en beschrijf in gewone taal wat er moet veranderen. Hoe preciezer (welke pagina, wat moet er staan), hoe beter.",
      "Kijk mee: je ziet elke stap die de Bouwer zet. Na een paar minuten staat er \"Klaar voor jouw oordeel\". Je hoeft niet te wachten: als hij klaar is, iets wil vragen of vastloopt, krijg je een melding op je telefoon.",
      "Bekijk onderaan precies welke regels veranderen. Klik op Start voorbeeld en dan Open voorbeeld om de gewijzigde site echt te zien (inloggen met admin@zekerflex.nl / Zeker!2026, alleen demogegevens).",
      "Goed? Klik Goedkeuren en live zetten. Niet goed? Typ bij Bijsturen wat er anders moet, of klik Weggooien.",
      "Is er een nieuwe tabel of kolom nodig, dan maakt de Bouwer die zelf (alleen toevoegen, nooit iets weghalen). Bij het live zetten zie je die databasewijziging apart en geef je er akkoord op.",
    ],
    tip: "Je kunt het ook in de chat vragen: begin je bericht met \"bouw:\".",
    naar: { tab: "bouwer", label: "Naar de Bouwer" },
  },
  {
    titel: "De nieuwste versie live zetten",
    stappen: [
      "Open het tabblad Live zetten. Links zie je wat er nu live staat, rechts het nieuwste op GitHub, en daaronder wat er nieuw is.",
      "Klik Zet nieuwste versie live. Na een paar minuten staat er Klaar, en je krijgt een melding op je telefoon.",
      "Verandert de nieuwe versie de database, dan stopt hij eerst en laat hij die wijzigingen zien. Lees ze, vink aan dat je ze bekeken hebt en klik Akkoord.",
    ],
    tip: "Start de nieuwe versie niet goed, dan zet de server zelf de vorige terug. In de chat kan het ook: typ \"zet live\".",
    naar: { tab: "live", label: "Naar Live zetten" },
  },
  {
    titel: "Terug naar de vorige versie",
    stappen: [
      "Open Live zetten en klik Vorige versie terugzetten.",
      "Let op: wijzigingen aan de database blijven staan. Gaat het om de database, vraag dan eerst raad.",
    ],
    naar: { tab: "live", label: "Naar Live zetten" },
  },
  {
    titel: "Een fout laten oplossen",
    stappen: [
      "Ga naar Admin → Systeem → Foutmeldingen. Bij elke fout staat Laat de Bouwer dit oplossen.",
      "De Bouwer zoekt de oorzaak en stelt een reparatie voor. Die keur je zelf goed in het tabblad Bouwer, net als elke andere wijziging.",
      "Wil je dat hij dit vanzelf doet bij fouten die steeds terugkomen? Zet in Bouwer → instellingen Automatisch reparaties voorstellen aan. Je krijgt een melding als er een reparatie klaarstaat.",
    ],
    naar: { href: "/admin/systeem", label: "Naar Systeem" },
  },
  {
    titel: "Zien wat er gebeurt",
    stappen: [
      "Admin → Systeem laat zien of alles werkt, ook de live-zetter en de Bouwer.",
      "Elke dag na 18:00 krijg je een mail met wat er die dag live is gegaan.",
      "Vraag in de chat \"hoe staat de bouwer?\" voor de stand van nu.",
    ],
    naar: { tab: "ai", label: "Naar de chat" },
  },
  {
    titel: "Eenmalig instellen",
    stappen: [
      "GitHub-sleutel: nodig om goedgekeurde wijzigingen live te zetten. Bouwer → instellingen; daar staat ook hoe je hem maakt.",
      "Model: de Bouwer gebruikt standaard gemini-3.5-flash. Een sterker model kies je in dezelfde instellingen.",
      "Je ziet in Admin → Te doen welke van deze stappen nog open staan; ze vinken zichzelf af.",
    ],
    naar: { tab: "bouwer", label: "Naar de instellingen" },
  },
];

export function Handleiding({ naarTab }: { naarTab: (tab: HandleidingTab) => void }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#0b0e13] p-4 text-sm">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <header>
          <h2 className="font-display text-lg font-bold text-white">Hoe werkt het?</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            Met deze werkbank bouw, bekijk en zet je ZekerFlex zelf live. Er gaat nooit iets live zonder jouw klik, en bij problemen gaat de server vanzelf terug naar
            de vorige versie.
          </p>
        </header>

        {TAKEN.map((t) => (
          <section key={t.titel} className="rounded-xl border border-white/10 bg-[#0e1116] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white/90">{t.titel}</h3>
              {t.naar &&
                ("tab" in t.naar ? (
                  <button
                    type="button"
                    onClick={() => naarTab((t.naar as { tab: HandleidingTab }).tab)}
                    className="ml-auto rounded-md border border-brand-mint/40 px-2.5 py-1 text-[11px] text-brand-mint hover:bg-[rgba(79,224,160,0.08)]"
                  >
                    {t.naar.label} →
                  </button>
                ) : (
                  <Link href={t.naar.href} className="ml-auto rounded-md border border-brand-mint/40 px-2.5 py-1 text-[11px] text-brand-mint hover:bg-[rgba(79,224,160,0.08)]">
                    {t.naar.label} →
                  </Link>
                ))}
            </div>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-white/70">
              {t.stappen.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {t.tip && <p className="mt-2 text-[11px] text-white/45">Tip: {t.tip}</p>}
          </section>
        ))}

        <section className="rounded-xl border border-[#F07C6B]/25 bg-[rgba(240,124,107,0.05)] p-4 text-xs leading-relaxed text-white/70">
          <h3 className="text-sm font-semibold text-[#F07C6B]">Noodgeval: de hele site is onbereikbaar</h3>
          <p className="mt-1">Dan kom je ook niet in deze werkbank. Doe dit:</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>Wacht vijf minuten. Er kan een uitrol of een automatische terugzet bezig zijn.</li>
            <li>Nog steeds plat? Log in bij TransIP, ga naar je VPS en kies Herstarten. De site, de database en de live-zetter starten daarna vanzelf weer op.</li>
            <li>
              Helpt dat niet, schakel dan een ontwikkelaar in. Elke nacht wordt er een back-up gemaakt en op proef teruggezet. Die staat wel op dezelfde server; een kopie
              erbuiten staat nog in Admin → Te doen.
            </li>
          </ol>
        </section>

        <section className="rounded-xl border border-[#FFC46B]/25 bg-[rgba(255,196,107,0.05)] p-4 text-xs leading-relaxed text-white/70">
          <h3 className="text-sm font-semibold text-[#FFC46B]">Wat de Bouwer bewust niet doet</h3>
          <p className="mt-1">
            De Bouwer verandert geen database, geen betalingen of beveiliging, geen pakketten en geen uitrol-instellingen. Daar is een fout te duur voor. Zegt hij in zijn
            samenvatting dat zoiets nodig is, laat dat dan door een ontwikkelaar doen.
          </p>
        </section>
      </div>
    </div>
  );
}
