/**
 * ZekerFlex FAQ & Knowledge Base
 * Technical en bedrijfsconcepten
 */

export const FAQ_SECTIONS = {
  kilometers: {
    title: "Kilometers & Reiskosten",
    items: [
      {
        q: "Hoe worden kilometers berekend?",
        a: `Kilometers worden automatisch berekend van het thuisadres van de flexwerker naar de werkplek.

• Basis: postcodegebied flexwerker → GPS-locatie werkgever
• IVU-tarief 2024: €0,23/km (jaarlijks aangepast)
• Auto-opslag: extra opslag voor auto-afhankelijke klussen
• Geen aftrek voor inzet via openbaar vervoer
• Opslag berekend → factuur werkgever → betaald via timesheet-flow`,
      },
      {
        q: "Kan een flexwerker kilometers aftrekken?",
        a: `Ja, van belasting als ZZP'er (geen loonbelasting):

• Gebruik IVU-tarief (€0,23/km) of werkelijke kosten (bewijs nodig)
• Geef routegegevens in jaaroverzicht mee naar accountant
• Opgeslagen in /dashboard/ritten (automatisch uit GPS-events)
• Voor uitzendkrachten: kilometers gaan naar werkgever, niet aftrekbaar voor werker`,
      },
    ],
  },

  aangifte: {
    title: "Aangifte & Belastingen",
    items: [
      {
        q: "Wie doet aangifte voor flexwerkers?",
        a: `Afhankelijk van werkstatus:

• ZZP'er / Flexwerker: ZELF (jaarlijkse inkomstenbelastingaangifte)
  - Inkomsten uit ZekerFlex: vakinhoud diensten
  - Aftrekposten: kilometers, kantoorspullen, verzekering, software
  - Voorgegeven totaal in /dashboard/jaaroverzicht

• Uitzendkracht: WERKGEVER doet aangifte (loonbelasting)
  - Loonstroken automatisch gegenereerd
  - IPA-koppeling voor belastingdienst (optioneel)
  - Verwerkt via Payroll module → StiPP aangifte`,
      },
      {
        q: "Wat is het jaaroverzicht?",
        a: `Jaarlijks document (jan 1 - dec 31, UTC) per flexwerker:

• Totale inkomsten (bruto)
• Uitgaven & aftrekposten (kilometers, verzekering, etc.)
• Belastingbelemmering (wat werd al ingehouden?)
• BTW-informatie (als ondernemer)
• Exporteerbaar als PDF voor belastingadviseur
• Beschikbaar 1 jan volgende jaar (t/m 31 maart aangifte-deadline)`,
      },
    ],
  },

  verzekerd: {
    title: "Verzekering & Aansprakelijkheid",
    items: [
      {
        q: "Ben ik verzekerd als ik werk via ZekerFlex?",
        a: `Verschilt per soort werk:

• Algemene burgerlijke aansprakelijkheid: check je eigen polis
• Ongevallen op het werk: werkgever is verantwoordelijk
• ZekerFlex: geen eigen arbeidsongeschiktheidsverzekering (nog niet)
• Advies: als ZZP'er zelf WAO-verzekering afsluiten
• Uitzendkrachten: werkgever regelt wettelijke dekking
• Check voorwaarden: sommige werkgevers eisen VIM-kaart`,
      },
      {
        q: "Wat als ik gewond raak op het werk?",
        a: `Procedure:

1. Meld direct aan werkgever (verzekering werkgever)
2. GPS-check-in bewijst je aanwezigheid (opgeslagen in timesheet)
3. Werkgever meldt bij eigen verzekering
4. ZekerFlex helpt met documentatie (audit-trail)
5. Geen rechtstreekse claim via ZekerFlex (indirect risico)

Tip: neem foto's, verzamel getuigencontacten, meld schriftelijk`,
      },
    ],
  },

  aftrekken: {
    title: "Aftrekbare Uitgaven (ZZP)",
    items: [
      {
        q: "Wat kan ik aftrekken van mijn inkomsten?",
        a: `Veel voorkomend (belastingadviseur raadplegen):

✓ KILOMETERS: IVU-tarief (€0,23/km) of werkelijk
✓ VERZEKERING: AOV, werkgeversaansprakelijkheid
✓ KANTOORSPULLEN: computer, telefoon, bureau (afschrijving)
✓ INTERNET/TELEFOON: gedeelte zakelijk gebruik
✓ SOFTWARE: ZekerFlex licenties, tools, etc.
✓ SCHOLING: cursussen, certificaten
✓ ACCOUNTANT: boekhoudkosten
✗ HUISVESTINGCOSTEN: alleen thuishuis-gedeelte
✗ ETEN/DRINKEN: tenzij voor klanten
✗ AUTO AANKOOP: alleen onderhouds/verzekeringsdelen`,
      },
      {
        q: "Hoe registreer ik mijn aftrekposten?",
        a: `In ZekerFlex dashboard:

• /dashboard/administratie: invoer uitgaven per maand
• Kilometers: automatisch uit GPS-events
• Overige: upload bonnetjes/facturen
• Jaaroverzicht genereert totaaloverzicht
• Export naar boekhoudprogramma (later)
• Bewaar originelen 7 jaar (wettelijk)`,
      },
    ],
  },

  uitzendkracht: {
    title: "Uitzendkrachten & Payroll",
    items: [
      {
        q: "Wat is het verschil: ZZP vs Uitzendkracht?",
        a: `ZZP'er (Zelfstandige):
✓ Zelf inkomsten regelen
✓ Eigen facturen verzenden
✓ Kunnen kilometers aftrekken
✓ Zelf aangifte doen
✗ Geen loonstrook
✗ Geen werknemersbescherming

Uitzendkracht (Werknemer):
✓ Werkgever geeft loonstrook
✓ Werknemersbescherming (WW, ziekte)
✓ Betaald verlof
✗ Workingour zien (no off-hours)
✗ Ingehouden loonbelasting
✗ Minder vrijheid roostering`,
      },
      {
        q: "Hoe werkt payroll/loonstroken?",
        a: `Voor uitzendkrachten via ZekerFlex:

1. Flexwerker meldt uren (timesheet)
2. Werkgever keurt goed (management)
3. Loonstrook automatisch gegenereerd
4. Berekening: uren × tarief - belastingen
5. Betaald naar IBAN (wekelijks/maandelijks)
6. Jaaroverzicht voor belastingdienst
7. StiPP-aankoppeling (pensioen)

Tarief zet werkgever in, ZekerFlex berekent automatisch.`,
      },
    ],
  },

  daemon: {
    title: "Daemon Processen & Background Jobs",
    items: [
      {
        q: "Wat is een daemon in ZekerFlex?",
        a: `Daemon = achtergrond-serviceproces dat 24/7 draait:

• rondgang: nachtelijks alle pagina's checken (04:20 UTC)
• health-check: elke 5 min DB/Redis status
• reminder-mails: factuurherinnering verzenden
• payments: dagelijks SEPA-betalingen verwerken
• AI-warm: own model warmladen voor snelle responses
• scraper: achtergrond-bronnen indexeren

Draait op cron-container via docker-compose.vps.yml
Monitor via Admin → Systeem → Taken (heartbeat)`,
      },
      {
        q: "Wat als een daemon stuck/crashed?",
        a: `Monitoring & recovery:

1. Admin → Systeem → Taken → zie hartslag per daemon
2. Als rood/uitgevallen: handmatig trigger of herstart
3. Logs in /logs/cron of docker logs
4. Fallback: restart via vps-update.sh
5. Alert: slack/email als critical daemon down

Failsafe: kritische taken (payment) hebben manual override.`,
      },
    ],
  },

  prisma: {
    title: "Prisma & Database Migraties",
    items: [
      {
        q: "Hoe werk ik met Prisma migrations?",
        a: `Workflow:

1. Wijzig schema.prisma
2. Lokaal (dev): npx prisma migrate dev --name beschrijving
3. Generate: npx prisma generate (types)
4. Commit naar main
5. Op VPS: ZF_MIGREER=1 ./deploy/scripts/vps-update.sh
6. Migration draait: BEGIN...COMMIT
7. Rollback: BEGIN...ROLLBACK (dry-run eerst!)

BELANGRIJK: Nooit direct SQL op prod!`,
      },
      {
        q: "Hoe test ik migrations veilig?",
        a: `Best practice:

1. Droge run: BEGIN TRANSACTION + ROLLBACK
   - Geeft error zonder wat te veranderen
2. Op test-DB
3. Backup maken vóór echte run
4. Versieing: prisma/migrations/<timestamp>_description
5. Atomic: één transaction per feature
6. Downtime minimaal: geen LOCK, geen DELETE

Aftrap: schaling schema stap-voor-stap, niet in één migrate.`,
      },
    ],
  },

  retry: {
    title: "Retry Logic & Resilience",
    items: [
      {
        q: "Hoe werken retries in ZekerFlex?",
        a: `Systeem-retries:

• Betaling mislukt → 3x opnieuw (exponential backoff)
• Mail-verzending faalt → queue, later opnieuw
• API-aanroep timeout → fallback (eigen model)
• DB-conflict → transaction retry
• SEPA-transfer → wachtrij met tracking

User-visible:
• Mislukte payment → knop "Opnieuw proberen"
• Timesheet-fout → "Controleer gegevens + opnieuw"`,
      },
      {
        q: "Wat is exponential backoff?",
        a: `Intelligente wachttijd tussen retries:

1e poging: DIRECT
Fout → wacht 1 sec, poging 2
Fout → wacht 2 sec, poging 3
Fout → wacht 4 sec, poging 4
...max 60 sec

Voordeel: geen spam, server krijgt ruimte om te herstellen.
Gebruik: Stripe webhooks, Redis-connection, SEPA-transfers`,
      },
    ],
  },

  ollama: {
    title: "Ollama & Eigen AI-Model",
    items: [
      {
        q: "Wat is Ollama in ZekerFlex?",
        a: `Ollama = lokale LLM-server op de VPS:

• Draait: gemma2:9b (9 miljard parameters) + granite-embedding
• Host: localhost:11434
• Doel: AI-taken zonder Stripe/API-afhankelijkheid
• Failover: als Stripe 429, valt terug op Ollama
• Knop: Admin → ZekerFlex AI → "Alles gratis" (eigen model)
• Geheugen: ~4GB model + 3.8GB runtime

Performance: traag dan Gemini, maar genoeg voor NL-taken`,
      },
      {
        q: "Hoe schakel ik model om?",
        a: `Admin → ZekerFlex AI panel:

• Per taak kan je model kiezen (dropdown)
• Optie "Alles gratis" = alle taken via Ollama
• Knop "Model warmladen" = start LLM (duurt ~30s)
• Log: welk model gebruikte (audit-trail)
• Fallback: als model crashed, valt terug

Grootte modellen:
• gemma2:9b (huidige) = balans quality/speed
• qwen2.5:3b (fallback) = snel, minder context`,
      },
    ],
  },
};

export function getFaqByTopic(topic: string) {
  const section = FAQ_SECTIONS[topic as keyof typeof FAQ_SECTIONS];
  return section || null;
}

export function getAllFaqTopics() {
  return Object.keys(FAQ_SECTIONS) as (keyof typeof FAQ_SECTIONS)[];
}
