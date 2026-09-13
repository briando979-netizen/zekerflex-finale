import { createYoga, type Plugin } from "graphql-yoga";
import { NoSchemaIntrospectionCustomRule } from "graphql";
import { EnvelopArmor } from "@escape.tech/graphql-armor";
import { schema, buildContext } from "@/lib/graphql/schema";
import { env } from "@/lib/env";
import { getPrincipal } from "@/lib/auth";
import { fixedWindow } from "@/lib/rate-limit";
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

async function rateLimited(request: Request): Promise<Response | null> {
  const principal = await getPrincipal().catch(() => null);
  const key = principal
    ? `rl:graphql:user:${principal.userId}`
    : `rl:graphql:ip:${clientIp(request)}`;
  const gate = await fixedWindow(key, 60, 60);
  if (gate.ok) return null;
  return new Response(JSON.stringify({ errors: [{ message: "Too many requests" }] }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "Retry-After": String(gate.retryAfterSeconds || 60),
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  return (await rateLimited(request)) ?? yoga.handleRequest(request, {});
}
export async function POST(request: Request): Promise<Response> {
  return (await rateLimited(request)) ?? yoga.handleRequest(request, {});
}
export async function OPTIONS(request: Request): Promise<Response> {
  return yoga.handleRequest(request, {});
}
