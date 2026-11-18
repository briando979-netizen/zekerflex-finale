import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "@/components/marketing/primitives";
import { canonical, SITE, CONTACTS } from "@/lib/seo";

const TITLE = "API-naslag — de ZekerFlex-API";
const DESCRIPTION =
  "Elk endpoint van de openbare ZekerFlex-API: diensten lezen en aanmaken, goedgekeurde uren, facturen en webhooks. Met velden, foutcodes, limieten en voorbeelden.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/developers/api", { title: TITLE, description: DESCRIPTION }),
};

const BASE = `${SITE.url}/api/public/v1`;

// ---------------------------------------------------------------------------
// Presentatie-hulpjes (server, geen staat). Alles server-gerenderd, geen
// scripts van derden — past bij de strikte CSP en "alles zelf".
// ---------------------------------------------------------------------------

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl bg-[#0C0E12] p-4 text-[13px] leading-relaxed text-white/90">
      <code>{children}</code>
    </pre>
  );
}

function Method({ m }: { m: "GET" | "POST" | "DELETE" }) {
  return (
    <span className="inline-block flex-shrink-0 rounded-md bg-ink px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide text-white">
      {m}
    </span>
  );
}

function Scope({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-200">
      <span aria-hidden>🔑</span>
      <code className="font-mono">{children}</code>
    </span>
  );
}

interface Veld {
  naam: string;
  type: string;
  verplicht?: boolean;
  uitleg: string;
}

function Veldtabel({ titel, rijen }: { titel: string; rijen: Veld[] }) {
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold text-ink">{titel}</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-hair">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-paper-soft text-xs uppercase tracking-wide text-neutralx-500">
              <th className="px-3 py-2 font-semibold">Veld</th>
              <th className="px-3 py-2 font-semibold">Type</th>
              <th className="px-3 py-2 font-semibold">Uitleg</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map((r) => (
              <tr key={r.naam} className="border-t border-hair align-top">
                <td className="px-3 py-2 font-mono text-[13px] text-ink">
                  {r.naam}
                  {r.verplicht ? <span className="ml-1 text-crit" title="verplicht">*</span> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px] text-neutralx-500">{r.type}</td>
                <td className="px-3 py-2 text-neutralx-600">{r.uitleg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Endpoint({
  id,
  method,
  path,
  scope,
  intro,
  children,
}: {
  id: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  scope: string;
  intro: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-hair pt-10">
      <div className="flex flex-wrap items-center gap-2">
        <Method m={method} />
        <code className="break-all font-mono text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{path}</code>
      </div>
      <div className="mt-2">
        <Scope>{scope}</Scope>
      </div>
      <p className="mt-3 max-w-2xl text-[0.975rem] leading-relaxed text-neutralx-600">{intro}</p>
      {children}
    </section>
  );
}

function NavGroep({ titel, items }: { titel: string; items: { id: string; label: string }[] }) {
  return (
    <div className="mt-5 first:mt-0">
      <p className="px-3 text-xs font-semibold uppercase tracking-wide text-neutralx-400">{titel}</p>
      <ul className="mt-1">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="block rounded-lg px-3 py-1.5 text-sm text-neutralx-600 transition hover:bg-paper-soft hover:text-brand-700">
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ApiReferencePage() {
  return (
    <>
      <div className="border-b border-hair bg-paper-soft">
        <div className="shell py-12 md:py-14">
          <p className="eyebrow text-brand-600">Ontwikkelaars</p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink md:text-[2.4rem]">API-naslag</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-neutralx-600">
            De openbare REST-API van {SITE.name}. Alle paden staan onder één basis-adres; elk verzoek heeft een API-sleutel
            nodig. De machineleesbare specificatie staat op{" "}
            <a href="/openapi.json" className="font-semibold text-brand-700 hover:underline">/openapi.json</a>.
          </p>
          <div className="mt-5 inline-flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-hair bg-white px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutralx-400">Basis</span>
            <code className="whitespace-nowrap font-mono text-sm text-ink">{BASE}</code>
          </div>
        </div>
      </div>

      <Section tone="paper">
        <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
          {/* Zijnavigatie: op grote schermen blijft hij meescrollen */}
          <aside className="lg:sticky lg:top-24 lg:h-max">
            <nav aria-label="Endpoints">
              <NavGroep titel="Aan de slag" items={[{ id: "aan-de-slag", label: "Verzoeken en sleutel" }]} />
              <NavGroep
                titel="Diensten en vestigingen"
                items={[
                  { id: "shifts-list", label: "Open diensten lezen" },
                  { id: "shifts-create", label: "Dienst aanmaken" },
                  { id: "shifts-get", label: "Eén dienst" },
                  { id: "branches", label: "Vestigingen lezen" },
                ]}
              />
              <NavGroep titel="Uren" items={[{ id: "timesheets", label: "Goedgekeurde uren" }]} />
              <NavGroep titel="Facturen" items={[{ id: "invoices", label: "Facturen lezen" }]} />
              <NavGroep
                titel="Webhooks"
                items={[
                  { id: "webhooks", label: "Melding registreren" },
                  { id: "webhooks-list", label: "Abonnementen lezen" },
                  { id: "webhooks-delete", label: "Abonnement verwijderen" },
                ]}
              />
              <NavGroep titel="AI" items={[{ id: "brain", label: "Het brein vragen" }]} />
              <NavGroep titel="Overig" items={[{ id: "agenda", label: "Agendafeed (iCal)" }, { id: "fouten", label: "Foutformaat" }, { id: "limieten", label: "Limieten" }]} />
            </nav>
          </aside>

          <div>
            {/* Aan de slag */}
            <section id="aan-de-slag" className="scroll-mt-28">
              <h2 className="font-display text-2xl font-bold text-ink">Verzoeken en sleutel</h2>
              <p className="mt-3 max-w-2xl text-[0.975rem] leading-relaxed text-neutralx-600">
                Elk verzoek gaat naar <code className="font-mono">{BASE}</code> en heeft een API-sleutel nodig, als Bearer-token of in de
                header <code className="font-mono">x-api-key</code>. Ingelogde werkgevers maken hun sleutel zelf aan (gratis) op{" "}
                <Link href="/werkgever/integraties" className="font-semibold text-brand-700 hover:underline">/werkgever/integraties</Link>.
              </p>
              <Code>{`curl ${BASE}/shifts \\
  -H "Authorization: Bearer zf_live_..."

# of met de header:
curl ${BASE}/shifts \\
  -H "x-api-key: zf_live_..."`}</Code>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutralx-600">
                Antwoorden zijn JSON. Een lijst staat altijd onder <code className="font-mono">data</code>. Elke sleutel heeft vaste
                rechten (scopes) en een limiet per abonnement — zie{" "}
                <a href="#limieten" className="font-semibold text-brand-700 hover:underline">Limieten</a> en{" "}
                <Link href="/developers#pricing" className="font-semibold text-brand-700 hover:underline">de prijzen</Link>.
              </p>
            </section>

            <div className="mt-10 space-y-10">
              {/* GET /shifts */}
              <Endpoint
                id="shifts-list"
                method="GET"
                path="/shifts"
                scope="shifts:read"
                intro="De open diensten van je organisatie. Een platformbrede sleutel ziet alle organisaties; een sleutel die aan één organisatie hangt, ziet alleen de eigen diensten."
              >
                <Code>{`curl ${BASE}/shifts \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
                <Veldtabel
                  titel="Elke dienst in data[]"
                  rijen={[
                    { naam: "id", type: "string", uitleg: "Het kenmerk van de dienst." },
                    { naam: "title", type: "string", uitleg: "De titel van de dienst." },
                    { naam: "startsAt", type: "date-time", uitleg: "Begin (UTC, ISO 8601)." },
                    { naam: "endsAt", type: "date-time", uitleg: "Einde (UTC, ISO 8601)." },
                    { naam: "hourlyRateCents", type: "integer", uitleg: "Bruto uurtarief in eurocenten (1650 = € 16,50)." },
                    { naam: "positions", type: "integer", uitleg: "Aantal plekken." },
                    { naam: "status", type: "string", uitleg: "OPEN, MATCHING of PARTIALLY_FILLED." },
                    { naam: "branch", type: "string", uitleg: "Naam van de vestiging." },
                    { naam: "city", type: "string", uitleg: "Plaats van de vestiging." },
                  ]}
                />
              </Endpoint>

              {/* POST /shifts */}
              <Endpoint
                id="shifts-create"
                method="POST"
                path="/shifts"
                scope="shifts:write"
                intro="Maak een nieuwe open dienst aan. Direct na het aanmaken draait de matching er meteen tegenaan."
              >
                <Veldtabel
                  titel="Verzoek (JSON) — * is verplicht"
                  rijen={[
                    { naam: "branchId", type: "string", verplicht: true, uitleg: "De vestiging waar de dienst hoort (moet van jouw organisatie zijn)." },
                    { naam: "title", type: "string", verplicht: true, uitleg: "Titel, 3 tot 120 tekens." },
                    { naam: "description", type: "string", uitleg: "Toelichting, maximaal 1000 tekens." },
                    { naam: "startsAt", type: "date-time", verplicht: true, uitleg: "Begin (UTC, ISO 8601)." },
                    { naam: "endsAt", type: "date-time", verplicht: true, uitleg: "Einde (UTC, ISO 8601), na het begin." },
                    { naam: "breakMinutes", type: "integer", uitleg: "Pauze in minuten, 0 tot 240 (standaard 0)." },
                    { naam: "hourlyRateCents", type: "integer", verplicht: true, uitleg: "Bruto uurtarief in eurocenten, 0 tot 20000." },
                    { naam: "positions", type: "integer", uitleg: "Aantal plekken, 1 tot 50 (standaard 1)." },
                  ]}
                />
                <Code>{`curl -X POST ${BASE}/shifts \\
  -H "Authorization: Bearer zf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "branchId": "br_123",
    "title": "Weekend bediening",
    "startsAt": "2026-11-01T16:00:00Z",
    "endsAt": "2026-11-01T23:00:00Z",
    "hourlyRateCents": 1650,
    "positions": 2
  }'`}</Code>
                <p className="mt-3 text-sm text-neutralx-600">
                  Antwoord <code className="font-mono">201</code>: de aangemaakte dienst onder <code className="font-mono">data</code> (id, title, startsAt, endsAt, status).
                </p>
              </Endpoint>

              {/* GET /shifts/{id} */}
              <Endpoint
                id="shifts-get"
                method="GET"
                path="/shifts/{id}"
                scope="shifts:read"
                intro="Eén dienst van je organisatie, met wie er ingepland staat. Van elke werker alleen de voornaam en de eerste letter van de achternaam — nooit meer."
              >
                <Code>{`curl ${BASE}/shifts/SHIFT_ID \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
                <Veldtabel
                  titel="Antwoord in data"
                  rijen={[
                    { naam: "id, title, status", type: "string", uitleg: "Kenmerk, titel en status van de dienst." },
                    { naam: "startsAt, endsAt", type: "date-time", uitleg: "Begin en einde (UTC)." },
                    { naam: "breakMinutes", type: "integer", uitleg: "Pauze in minuten." },
                    { naam: "hourlyRateCents", type: "integer", uitleg: "Bruto uurtarief in eurocenten." },
                    { naam: "positions", type: "integer", uitleg: "Aantal plekken." },
                    { naam: "branch", type: "object", uitleg: "De vestiging: id, name, city." },
                    { naam: "filled", type: "integer", uitleg: "Hoeveel plekken al gevuld zijn." },
                    { naam: "scheduled", type: "array", uitleg: "Wie er staat: assignmentId, workerId, name (voornaam + letter) en since (sinds wanneer)." },
                  ]}
                />
              </Endpoint>

              {/* GET /branches */}
              <Endpoint
                id="branches"
                method="GET"
                path="/branches"
                scope="shifts:read"
                intro="De vestigingen van je organisatie, zodat je het branchId kunt opzoeken dat POST /shifts nodig heeft. De sleutel moet aan een organisatie hangen (anders 412)."
              >
                <Code>{`curl ${BASE}/branches \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
                <Veldtabel
                  titel="Elke vestiging in data[]"
                  rijen={[
                    { naam: "id", type: "string", uitleg: "Het branchId voor POST /shifts." },
                    { naam: "name", type: "string", uitleg: "Naam van de vestiging." },
                    { naam: "city", type: "string", uitleg: "Plaats." },
                    { naam: "postalCode", type: "string", uitleg: "Postcode." },
                  ]}
                />
              </Endpoint>

              {/* GET /timesheets/approved */}
              <Endpoint
                id="timesheets"
                method="GET"
                path="/timesheets/approved"
                scope="timesheets:read"
                intro="Goedgekeurde en betaalde urenbriefjes van je organisatie, nieuwste goedkeuring eerst."
              >
                <Code>{`curl ${BASE}/timesheets/approved \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
                <Veldtabel
                  titel="Elk urenbriefje in data[]"
                  rijen={[
                    { naam: "id", type: "string", uitleg: "Het kenmerk van het urenbriefje." },
                    { naam: "scheduledStart", type: "date-time", uitleg: "Geplande begintijd (UTC)." },
                    { naam: "scheduledEnd", type: "date-time", uitleg: "Geplande eindtijd (UTC)." },
                    { naam: "billableMinutes", type: "integer", uitleg: "Aantal te factureren minuten." },
                    { naam: "hourlyRateCents", type: "integer", uitleg: "Bruto uurtarief in eurocenten." },
                    { naam: "status", type: "string", uitleg: "APPROVED of PAID." },
                    { naam: "branch", type: "object", uitleg: "De vestiging: id, name." },
                    { naam: "freelancer", type: "object", uitleg: "De werker: id en user.fullName." },
                  ]}
                />
              </Endpoint>

              {/* GET /invoices */}
              <Endpoint
                id="invoices"
                method="GET"
                path="/invoices"
                scope="invoices:read"
                intro="Facturen aan je organisatie, nieuwste eerst (maximaal 200, concepten niet meegerekend). Met ?since=2026-10-01 alleen vanaf die datum."
              >
                <Code>{`curl "${BASE}/invoices?since=2026-10-01" \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
                <Veldtabel
                  titel="Elke factuur in data[]"
                  rijen={[
                    { naam: "id, number", type: "string", uitleg: "Kenmerk en factuurnummer." },
                    { naam: "type, status", type: "string", uitleg: "Soort factuur en de status." },
                    { naam: "currency", type: "string", uitleg: "Munt, bijv. EUR." },
                    { naam: "subtotalCents", type: "integer", uitleg: "Bedrag vóór btw, in eurocenten." },
                    { naam: "vatRate", type: "number", uitleg: "Btw-percentage." },
                    { naam: "vatCents", type: "integer", uitleg: "Btw-bedrag in eurocenten." },
                    { naam: "totalCents", type: "integer", uitleg: "Totaal in eurocenten." },
                    { naam: "issuedAt", type: "date-time", uitleg: "Uitgiftedatum." },
                    { naam: "paidAt", type: "date-time", uitleg: "Datum betaald (leeg als nog niet betaald)." },
                    { naam: "timesheetId", type: "string", uitleg: "Het bijbehorende urenbriefje, indien van toepassing." },
                  ]}
                />
              </Endpoint>

              {/* POST /webhooks */}
              <Endpoint
                id="webhooks"
                method="POST"
                path="/webhooks"
                scope="webhooks:manage"
                intro="Registreer een URL die een melding krijgt bij gebeurtenissen. Het ondertekeningsgeheim krijg je één keer terug, in het antwoord — bewaar het meteen, het is daarna niet meer op te vragen."
              >
                <Veldtabel
                  titel="Verzoek (JSON) — * is verplicht"
                  rijen={[
                    { naam: "url", type: "string (uri)", verplicht: true, uitleg: "De URL die de melding ontvangt." },
                    { naam: "eventTypes", type: "string[]", verplicht: true, uitleg: "1 tot 20 gebeurtenissen (zie hieronder)." },
                  ]}
                />
                <p className="mt-4 text-sm text-neutralx-600">Beschikbare gebeurtenissen:</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {["shift.matched", "freelancer.checked_in", "timesheet.approved", "dispute.opened", "invoice.issued"].map((e) => (
                    <li key={e}>
                      <code className="rounded-md bg-paper-soft px-2 py-1 font-mono text-[13px] text-ink ring-1 ring-hair">{e}</code>
                    </li>
                  ))}
                </ul>
                <Code>{`curl -X POST ${BASE}/webhooks \\
  -H "Authorization: Bearer zf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/webhooks/zekerflex",
    "eventTypes": ["shift.matched", "timesheet.approved"]
  }'`}</Code>
                <p className="mt-3 text-sm text-neutralx-600">
                  Antwoord <code className="font-mono">201</code>: <code className="font-mono">data</code> (id, url, eventTypes, createdAt) en{" "}
                  <code className="font-mono">secret</code> (het geheim, eenmalig).
                </p>
              </Endpoint>

              {/* GET /webhooks */}
              <Endpoint
                id="webhooks-list"
                method="GET"
                path="/webhooks"
                scope="webhooks:manage"
                intro="Je webhook-abonnementen. Het ondertekeningsgeheim komt hier nooit terug — dat kreeg je alleen bij het aanmaken."
              >
                <Code>{`curl ${BASE}/webhooks \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
                <Veldtabel
                  titel="Elk abonnement in data[]"
                  rijen={[
                    { naam: "id", type: "string", uitleg: "Het kenmerk (voor DELETE)." },
                    { naam: "url", type: "string", uitleg: "De URL die de meldingen ontvangt." },
                    { naam: "eventTypes", type: "string[]", uitleg: "Waarop dit abonnement luistert." },
                    { naam: "active", type: "boolean", uitleg: "Of het abonnement actief is." },
                    { naam: "createdAt", type: "date-time", uitleg: "Wanneer het is aangemaakt." },
                  ]}
                />
              </Endpoint>

              {/* DELETE /webhooks/{id} */}
              <Endpoint
                id="webhooks-delete"
                method="DELETE"
                path="/webhooks/{id}"
                scope="webhooks:manage"
                intro="Verwijder een eigen webhook-abonnement. Een id van een andere organisatie geeft 404 (je ziet nooit dat het bestaat)."
              >
                <Code>{`curl -X DELETE ${BASE}/webhooks/WEBHOOK_ID \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
                <p className="mt-3 text-sm text-neutralx-600">
                  Antwoord <code className="font-mono">200</code>: <code className="font-mono">{`{ "data": { "id": "...", "deleted": true } }`}</code>. Onbekend of niet van jou: <code className="font-mono">404</code>.
                </p>
              </Endpoint>

              {/* POST /brain */}
              <Endpoint
                id="brain"
                method="POST"
                path="/brain"
                scope="brain:ask"
                intro="Stel het ZekerFlex-brein een vraag namens je organisatie (hetzelfde brein als in de app: kennis plus alleen-lezen gegevens, zonder geheugen tussen vragen). Gemaakt voor n8n, Make, Zapier of je eigen code."
              >
                <Veldtabel
                  titel="Verzoek (JSON) — * is verplicht"
                  rijen={[
                    { naam: "question", type: "string", verplicht: true, uitleg: "De vraag, 1 tot 1500 tekens." },
                    { naam: "context", type: "string of object", uitleg: "Extra context (bijv. een webhook-payload). Wordt als gegevens behandeld, nooit als opdracht." },
                  ]}
                />
                <Code>{`curl -X POST ${BASE}/brain \\
  -H "Authorization: Bearer zf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "question": "Hoeveel open diensten heb ik deze week?" }'`}</Code>
                <Veldtabel
                  titel="Antwoord"
                  rijen={[
                    { naam: "answer", type: "string", uitleg: "Het antwoord van het brein." },
                    { naam: "mode", type: "string", uitleg: "Hoe het antwoord tot stand kwam." },
                    { naam: "tools", type: "string[]", uitleg: "Welke gegevensbronnen het brein raadpleegde." },
                    { naam: "sources", type: "array", uitleg: "De gebruikte kennisbronnen." },
                    { naam: "links", type: "array", uitleg: "Verwijzingen (label + url)." },
                  ]}
                />
              </Endpoint>

              {/* iCal */}
              <section id="agenda" className="scroll-mt-28 border-t border-hair pt-10">
                <h2 className="font-display text-2xl font-bold text-ink">Agendafeed (iCal)</h2>
                <p className="mt-3 max-w-2xl text-[0.975rem] leading-relaxed text-neutralx-600">
                  Een geheime <code className="font-mono">.ics</code>-link waarop je je kunt abonneren met al je diensten en wie er komt, voor
                  Google Agenda, Outlook en Apple Agenda. Je haalt hem op (en vernieuwt hem) via{" "}
                  <Link href="/werkgever/integraties" className="font-semibold text-brand-700 hover:underline">Werkgever → Koppelingen</Link>.
                  Geen API-sleutel nodig: het token in de link geeft toegang.
                </p>
              </section>

              {/* Foutformaat */}
              <section id="fouten" className="scroll-mt-28 border-t border-hair pt-10">
                <h2 className="font-display text-2xl font-bold text-ink">Foutformaat</h2>
                <p className="mt-3 max-w-2xl text-[0.975rem] leading-relaxed text-neutralx-600">
                  Elke fout heeft dezelfde vorm: een <code className="font-mono">error</code> met een <code className="font-mono">code</code> en een{" "}
                  <code className="font-mono">message</code>.
                </p>
                <Code>{`{
  "error": {
    "code": "FORBIDDEN",
    "message": "De sleutel mist het vereiste recht."
  }
}`}</Code>
                <Veldtabel
                  titel="Veelvoorkomende statussen"
                  rijen={[
                    { naam: "401", type: "UNAUTHENTICATED", uitleg: "Sleutel ontbreekt of is ongeldig." },
                    { naam: "403", type: "FORBIDDEN", uitleg: "De sleutel mist het vereiste recht (scope), of de vestiging is niet van jouw organisatie." },
                    { naam: "412", type: "PRECONDITION", uitleg: "De sleutel hangt niet aan een organisatie." },
                    { naam: "422", type: "VALIDATION", uitleg: "De invoer klopt niet (bijv. eindtijd vóór begintijd)." },
                    { naam: "429", type: "RATE_LIMITED", uitleg: "Te veel verzoeken — zie Limieten." },
                  ]}
                />
              </section>

              {/* Limieten */}
              <section id="limieten" className="scroll-mt-28 border-t border-hair pt-10">
                <h2 className="font-display text-2xl font-bold text-ink">Limieten</h2>
                <p className="mt-3 max-w-2xl text-[0.975rem] leading-relaxed text-neutralx-600">
                  Elk antwoord bevat headers zodat je zelf kunt afremmen vóór een <code className="font-mono">429</code>:
                </p>
                <Veldtabel
                  titel="Headers op elk antwoord"
                  rijen={[
                    { naam: "RateLimit-Limit", type: "integer", uitleg: "Aantal verzoeken dat per venster mag." },
                    { naam: "RateLimit-Remaining", type: "integer", uitleg: "Hoeveel er nog over zijn in dit venster." },
                    { naam: "RateLimit-Reset", type: "integer", uitleg: "Seconden tot het venster opnieuw begint." },
                    { naam: "Retry-After", type: "integer", uitleg: "Alleen bij 429: seconden tot je opnieuw mag." },
                  ]}
                />
                <p className="mt-4 text-sm text-neutralx-600">
                  De aantallen per minuut en per maand hangen af van je abonnement — zie{" "}
                  <Link href="/developers#pricing" className="font-semibold text-brand-700 hover:underline">de prijzen</Link>. Meer volume nodig? Mail{" "}
                  <a href={`mailto:${CONTACTS.partners}`} className="font-semibold text-brand-700 hover:underline">{CONTACTS.partners}</a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
