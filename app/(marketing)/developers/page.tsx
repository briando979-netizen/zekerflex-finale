import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { canonical, CONTACTS, SITE } from "@/lib/seo";
import { PLAN_KEYS, API_PLANS } from "@/lib/api-plans/catalog";

const euro = (cents: number) => `€ ${(cents / 100).toFixed(0)}`;

const TITLE = "Ontwikkelaars — de ZekerFlex-API";
const DESCRIPTION =
  "De openbare REST-API en het GraphQL-endpoint van ZekerFlex: open diensten en goedgekeurde uren lezen, diensten aanmaken en webhooks registreren. Met OpenAPI-specificatie, uitleg over sleutels en voorbeelden.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/developers", { title: TITLE, description: DESCRIPTION }),
};

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl bg-[#0C0E12] p-4 text-[13px] leading-relaxed text-white/90">
      <code>{children}</code>
    </pre>
  );
}

export default function DevelopersPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-20 md:py-24">
          <p className="eyebrow text-brand-mint">Ontwikkelaars</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Bouw op {SITE.name}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Een REST-API voor diensten, urenbriefjes en webhooks, plus een GraphQL-endpoint (vooral lezen). Beide werken op
            dezelfde gegevens als het dashboard; er is geen aparte testomgeving.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Naslag" title="OpenAPI-specificatie" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          De volledige machineleesbare specificatie, met elk endpoint, elk schema en het foutformaat, staat op{" "}
          <a href="/openapi.json" className="font-semibold text-brand-700 hover:underline">
            {SITE.url}/openapi.json
          </a>
          . Je kunt er elke OpenAPI-tool rechtstreeks op aansluiten (Postman, een AI-koppeling, een codegenerator).
        </p>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Toegang" title="API-sleutels" />
        <div className="mt-4 max-w-2xl space-y-3 text-[1.05rem] leading-relaxed text-neutralx-600">
          <p>
            Elk verzoek heeft een API-sleutel nodig, als Bearer-token of in de header <code>x-api-key</code>:
          </p>
        </div>
        <Code>{`Authorization: Bearer zf_live_...
# of
x-api-key: zf_live_...`}</Code>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutralx-600">
          Sleutels hebben vaste rechten (<code>shifts:read</code>, <code>shifts:write</code>, <code>timesheets:read</code>,{" "}
          <code>webhooks:manage</code>, <code>invoices:read</code>, <code>users:read</code>) en een limiet per abonnement (zie
          de prijzen hieronder). Elk antwoord bevat de headers <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code> en{" "}
          <code>RateLimit-Reset</code>, zodat je zelf kunt afremmen vóór een 429. Ingelogde werkgevers maken en beheren hun
          sleutels zelf op{" "}
          <Link href="/werkgever/integraties" className="font-semibold text-brand-700 hover:underline">
            /werkgever/integraties
          </Link>
          ; voor Gratis hoef je niemand te mailen. Meer volume nodig dan Scale? Mail{" "}
          <a href={`mailto:${CONTACTS.partners}`} className="font-semibold text-brand-700 hover:underline">
            {CONTACTS.partners}
          </a>
          .
        </p>
      </Section>

      <Section tone="soft">
        <div id="pricing" className="scroll-mt-24" />
        <SectionHead eyebrow="Prijzen" title="Abonnementen" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_KEYS.map((key) => {
            const plan = API_PLANS[key];
            return (
              <div key={key} className="card p-5">
                <p className="font-display text-base font-bold text-ink">{plan.label}</p>
                <p className="mt-1 text-xl font-bold text-ink">
                  {plan.priceCentsPerMonth === null ? "Op maat" : plan.priceCentsPerMonth === 0 ? "Gratis" : `${euro(plan.priceCentsPerMonth)}/mnd`}
                </p>
                <ul className="mt-3 space-y-1 text-xs text-neutralx-600">
                  <li>{plan.rateLimitPerMinute} verzoeken per minuut</li>
                  <li>{plan.monthlyRequestCap ? `${plan.monthlyRequestCap.toLocaleString("nl-NL")} per maand` : "In overleg"}</li>
                  <li>{plan.scopes.length} rechten</li>
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-neutralx-600">
          Begin gratis en stap over wanneer je wilt via{" "}
          <Link href="/werkgever/integraties" className="font-semibold text-brand-700 hover:underline">
            /werkgever/integraties
          </Link>
          .
        </p>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Endpoints" title="REST" />

        <div className="mt-10 space-y-10">
          <div>
            <h3 className="break-words font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">GET /api/public/v1/shifts</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              De open diensten van je organisatie. Vereist <code>shifts:read</code>.
            </p>
            <Code>{`curl ${SITE.url}/api/public/v1/shifts \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
          </div>

          <div>
            <h3 className="break-words font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">POST /api/public/v1/shifts</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Maak een dienst aan en start de matching. Vereist <code>shifts:write</code>.
            </p>
            <Code>{`curl -X POST ${SITE.url}/api/public/v1/shifts \\
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
          </div>

          <div>
            <h3 className="break-words font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">GET /api/public/v1/timesheets/approved</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Goedgekeurde en betaalde urenbriefjes van je organisatie. Vereist <code>timesheets:read</code>.
            </p>
            <Code>{`curl ${SITE.url}/api/public/v1/timesheets/approved \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
          </div>

          <div>
            <h3 className="break-words font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">GET /api/public/v1/shifts/&#123;id&#125;</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Eén dienst van je organisatie, met wie er ingepland staat (voornaam en voorletter). Vereist <code>shifts:read</code>.
            </p>
            <Code>{`curl ${SITE.url}/api/public/v1/shifts/SHIFT_ID \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
          </div>

          <div>
            <h3 className="break-words font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">GET /api/public/v1/invoices</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Facturen aan je organisatie, nieuwste eerst. Optioneel <code>?since=2026-10-01</code>. Vereist <code>invoices:read</code>.
            </p>
            <Code>{`curl "${SITE.url}/api/public/v1/invoices?since=2026-10-01" \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
          </div>

          <div>
            <h3 className="break-words font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">Agendafeed (iCal)</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Een geheime <code>.ics</code>-link waarop je je kunt abonneren, met al je diensten en wie er komt, voor Google Agenda, Outlook en
              Apple Agenda. Je haalt hem op (en vernieuwt hem) via Werkgever → Koppelingen. Geen API-sleutel nodig: het token in de link geeft toegang.
            </p>
          </div>

          <div>
            <h3 className="break-words font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">POST /api/public/v1/webhooks</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Registreer een URL voor meldingen over diensten, uren en geschillen. Vereist <code>webhooks:manage</code>. Het
              ondertekeningsgeheim krijg je één keer terug, in het antwoord; bewaar het meteen.
            </p>
            <Code>{`curl -X POST ${SITE.url}/api/public/v1/webhooks \\
  -H "Authorization: Bearer zf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/webhooks/zekerflex",
    "eventTypes": ["shift.matched", "timesheet.approved"]
  }'`}</Code>
          </div>
        </div>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Alternatief" title="GraphQL" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          Er is ook een GraphQL-endpoint (vooral lezen) op <code className="break-all">{`${SITE.url}/api/graphql`}</code>, met dezelfde
          inlog en rollen als het dashboard (geen API-sleutels). Het is bedoeld voor ingelogde gebruikers en interne tools, niet voor
          koppelingen van derden. Vraag het schema rechtstreeks op bij het endpoint voor alle queries en types.
        </p>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="Voor AI-agents" title="Machineleesbaar overzicht" />
        <ul className="mt-6 max-w-2xl list-disc space-y-2 pl-5 text-[1.05rem] leading-relaxed text-neutralx-600">
          <li>
            <code className="break-all">{`${SITE.url}/llms.txt`}</code>: wat {SITE.name} is, wanneer je het gebruikt, en links naar alles hieronder.
          </li>
          <li>
            <code className="break-all">{`${SITE.url}/openapi.json`}</code>: de volledige specificatie van de REST-API.
          </li>
          <li>
            <code className="break-all">{`${SITE.url}/sitemap.xml`}</code>: elke vindbare pagina.
          </li>
          <li>
            De homepage en de 404-pagina geven bij <code>Accept: text/markdown</code> echte Markdown terug in plaats van HTML.
          </li>
        </ul>
      </Section>
    </>
  );
}
