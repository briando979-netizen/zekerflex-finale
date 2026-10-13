import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHead } from "@/components/marketing/primitives";
import { canonical, CONTACTS, SITE } from "@/lib/seo";
import { PLAN_KEYS, API_PLANS } from "@/lib/api-plans/catalog";

const euro = (cents: number) => `€${(cents / 100).toFixed(0)}`;

const TITLE = "Developers — ZekerFlex API";
const DESCRIPTION =
  "ZekerFlex public REST API and GraphQL endpoint: read open shifts and approved timesheets, create shifts, and register webhooks. OpenAPI spec, authentication and example requests.";

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
          <p className="eyebrow text-brand-mint">Developers</p>
          <h1 className="mt-4 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
            Build on {SITE.name}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            A REST API for shifts, timesheets and webhooks, plus a read-mostly GraphQL endpoint. Both run
            against the same data as the dashboard — nothing here is a separate sandbox.
          </p>
        </div>
      </div>

      <Section tone="paper">
        <SectionHead eyebrow="Reference" title="OpenAPI spec" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          The full machine-readable spec — every endpoint, request/response schema and error shape — is
          published at{" "}
          <a href="/openapi.json" className="font-semibold text-brand-700 hover:underline">
            {SITE.url}/openapi.json
          </a>
          . Point any OpenAPI-aware tool (Postman, an LLM function-calling layer, a codegen client) at it
          directly.
        </p>
      </Section>

      <Section tone="soft">
        <SectionHead eyebrow="Authentication" title="API keys" />
        <div className="mt-4 max-w-2xl space-y-3 text-[1.05rem] leading-relaxed text-neutralx-600">
          <p>
            Every request needs an API key, either as a Bearer token or an <code>x-api-key</code> header:
          </p>
        </div>
        <Code>{`Authorization: Bearer zf_live_...
# or
x-api-key: zf_live_...`}</Code>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-neutralx-600">
          Keys are scoped (<code>shifts:read</code>, <code>shifts:write</code>, <code>timesheets:read</code>,{" "}
          <code>webhooks:manage</code>, <code>invoices:read</code>, <code>users:read</code>) and rate-limited
          per your plan (see pricing below) — every response carries <code>RateLimit-Limit</code>,{" "}
          <code>RateLimit-Remaining</code> and <code>RateLimit-Reset</code> headers so you can self-throttle
          before hitting a 429. Logged-in employers create and manage their own keys at{" "}
          <Link href="/werkgever/integraties" className="font-semibold text-brand-700 hover:underline">
            /werkgever/integraties
          </Link>{" "}
          — no need to email anyone for the Free tier. Need Scale-level volume? Talk to{" "}
          <a href={`mailto:${CONTACTS.partners}`} className="font-semibold text-brand-700 hover:underline">
            {CONTACTS.partners}
          </a>
          .
        </p>
      </Section>

      <Section tone="soft">
        <div id="pricing" className="scroll-mt-24" />
        <SectionHead eyebrow="Pricing" title="Plans" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_KEYS.map((key) => {
            const plan = API_PLANS[key];
            return (
              <div key={key} className="card p-5">
                <p className="font-display text-base font-bold text-ink">{plan.label}</p>
                <p className="mt-1 text-xl font-bold text-ink">
                  {plan.priceCentsPerMonth === null
                    ? "Custom"
                    : plan.priceCentsPerMonth === 0
                      ? "Free"
                      : `${euro(plan.priceCentsPerMonth)}/mo`}
                </p>
                <ul className="mt-3 space-y-1 text-xs text-neutralx-600">
                  <li>{plan.rateLimitPerMinute} req/min</li>
                  <li>{plan.monthlyRequestCap ? `${plan.monthlyRequestCap.toLocaleString("en-US")}/month` : "Negotiated"}</li>
                  <li>{plan.scopes.length} scopes</li>
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-neutralx-600">
          Start free, upgrade any time from{" "}
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
            <h3 className="font-display text-lg font-bold text-ink">GET /api/public/v1/shifts</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Open shifts for your organization. Requires <code>shifts:read</code>.
            </p>
            <Code>{`curl ${SITE.url}/api/public/v1/shifts \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-ink">POST /api/public/v1/shifts</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Create a shift and run matching against it. Requires <code>shifts:write</code>.
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
            <h3 className="font-display text-lg font-bold text-ink">GET /api/public/v1/timesheets/approved</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Approved/paid timesheets for your organization. Requires <code>timesheets:read</code>.
            </p>
            <Code>{`curl ${SITE.url}/api/public/v1/timesheets/approved \\
  -H "Authorization: Bearer zf_live_..."`}</Code>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-ink">POST /api/public/v1/webhooks</h3>
            <p className="mt-1.5 text-sm text-neutralx-600">
              Register a URL for shift/timesheet/dispute events. Requires <code>webhooks:manage</code>. The
              signing secret is returned once, in the response — store it immediately.
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
        <SectionHead eyebrow="Alternative" title="GraphQL" />
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-neutralx-600">
          A read-mostly GraphQL endpoint is available at{" "}
          <code>{`${SITE.url}/api/graphql`}</code>, authenticated with the same session/role system as the
          dashboard (not API keys) — it&apos;s meant for logged-in users and internal tooling, not third-party
          integrations. Introspect the schema directly against the endpoint to see the full set of queries
          and types.
        </p>
      </Section>

      <Section tone="paper">
        <SectionHead eyebrow="For agents" title="Machine-readable discovery" />
        <ul className="mt-6 max-w-2xl list-disc space-y-2 pl-5 text-[1.05rem] leading-relaxed text-neutralx-600">
          <li>
            <code>{`${SITE.url}/llms.txt`}</code> — what {SITE.name} is, when to use it, and links to everything below.
          </li>
          <li>
            <code>{`${SITE.url}/openapi.json`}</code> — the full REST API spec.
          </li>
          <li>
            <code>{`${SITE.url}/sitemap.xml`}</code> — every indexable page.
          </li>
          <li>
            Homepage and the 404 page both honor <code>Accept: text/markdown</code> with a real Markdown
            body instead of HTML.
          </li>
        </ul>
      </Section>
    </>
  );
}
