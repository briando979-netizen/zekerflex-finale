import { createYoga } from "graphql-yoga";
import { schema, buildContext } from "@/lib/graphql/schema";
import { env } from "@/lib/env";
import { inspectGraphQLRequest } from "@/lib/graphql/security";
import { toErrorBody } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
});

export async function GET(request: Request): Promise<Response> {
  if (env.NODE_ENV === "production") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  return yoga.handleRequest(request, {});
}
export async function POST(request: Request): Promise<Response> {
  try {
    await inspectGraphQLRequest(request);
    return yoga.handleRequest(request, {});
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return Response.json(body, { status });
  }
}
export async function OPTIONS(request: Request): Promise<Response> {
  return yoga.handleRequest(request, {});
}
