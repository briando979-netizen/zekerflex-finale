import { Kind, parse, visit } from "graphql";
import { AppError } from "@/lib/errors";

export const MAX_GRAPHQL_BODY_BYTES = 64 * 1024;
export const MAX_GRAPHQL_DEPTH = 8;
export const MAX_GRAPHQL_FIELDS = 200;
export const MAX_GRAPHQL_ALIASES = 20;

export function assertGraphQLQuerySafe(query: string): void {
  if (!query || Buffer.byteLength(query, "utf8") > MAX_GRAPHQL_BODY_BYTES) {
    throw AppError.validation("GraphQL query is empty or too large");
  }
  let document;
  try {
    document = parse(query);
  } catch {
    throw AppError.validation("Invalid GraphQL query");
  }
  let depth = 0;
  let maxDepth = 0;
  let fields = 0;
  let aliases = 0;
  visit(document, {
    SelectionSet: {
      enter: () => { depth += 1; maxDepth = Math.max(maxDepth, depth); },
      leave: () => { depth -= 1; },
    },
    Field(node) {
      fields += 1;
      if (node.alias) aliases += 1;
    },
    FragmentDefinition(node) {
      if (node.kind !== Kind.FRAGMENT_DEFINITION) return;
    },
  });
  if (maxDepth > MAX_GRAPHQL_DEPTH) throw AppError.validation("GraphQL query is too deep");
  if (fields > MAX_GRAPHQL_FIELDS) throw AppError.validation("GraphQL query is too complex");
  if (aliases > MAX_GRAPHQL_ALIASES) throw AppError.validation("GraphQL query has too many aliases");
}

export async function inspectGraphQLRequest(request: Request): Promise<void> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_GRAPHQL_BODY_BYTES) throw AppError.validation("GraphQL request is too large");
  const body = await request.clone().json().catch(() => null) as { query?: unknown } | null;
  if (!body || typeof body.query !== "string") throw AppError.validation("GraphQL query is required");
  assertGraphQLQuerySafe(body.query);
}
