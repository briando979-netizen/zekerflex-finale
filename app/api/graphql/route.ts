import { createYoga, type Plugin } from "graphql-yoga";
import { NoSchemaIntrospectionCustomRule } from "graphql";
import { EnvelopArmor } from "@escape.tech/graphql-armor";
import { schema, buildContext } from "@/lib/graphql/schema";
import { env } from "@/lib/env";
import { getPrincipal } from "@/lib/auth";
import { fixedWindow, type RateResult } from "@/lib/rate-limit";
import { rateLimitHeaders } from "@/lib/http/rate-limit-headers";
import { clientIp } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Depth/cost/alias/token limits (safe-by-default) — this schema is shallow
// and has no recursive relations, so the practical risk is low, but a
// hand-written query against it should still not be able to blow up the
// resolvers via pathological depth, aliasing or token count.
const armor = new EnvelopArmor();

// Blocks __schema/__type introspection in production so the full schema
// can't be reconnoitred by a caller who isn't also building against
// GraphiQL (disabled in production below).
const disableIntrospectionInProduction: Plugin = {
  onValidate({ addValidationRule }) {
    if (env.NODE_ENV === "production") addValidationRule(NoSchemaIntrospectionCustomRule);
  },
};

// GraphQL endpoint. GraphiQL is enabled outside production only (the production
// CSP blocks its CDN assets anyway). Auth + role checks live in the resolvers,
// via the principal resolved in the context.
const yoga = createYoga({
  schema,
  context: buildContext,
  graphqlEndpoint: "/api/graphql",
  graphiql: env.NODE_ENV !== "production",
  fetchAPI: { Response },
  cors: false,
  landingPage: false,
  plugins: [...armor.protect().plugins, disableIntrospectionInProduction],
});

async function rateGate(request: Request): Promise<RateResult> {
  const principal = await getPrincipal().catch(() => null);
  const key = principal
    ? `rl:graphql:user:${principal.userId}`
    : `rl:graphql:ip:${clientIp(request)}`;
  return fixedWindow(key, 60, 60);
}

/** Attaches standard RateLimit-* headers to whatever yoga (or the 429 branch) returns. */
async function handle(request: Request): Promise<Response> {
  const gate = await rateGate(request);
  if (!gate.ok) {
    return new Response(JSON.stringify({ errors: [{ message: "Too many requests" }] }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": String(gate.retryAfterSeconds || 60), ...rateLimitHeaders(gate) },
    });
  }
  const response = await yoga.handleRequest(request, {});
  for (const [k, v] of Object.entries(rateLimitHeaders(gate))) response.headers.set(k, v);
  return response;
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}
export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
export async function OPTIONS(request: Request): Promise<Response> {
  return yoga.handleRequest(request, {});
}
