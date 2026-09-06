import { describe, expect, it } from "vitest";
import { assertGraphQLQuerySafe, MAX_GRAPHQL_ALIASES, MAX_GRAPHQL_DEPTH } from "@/lib/graphql/security";

describe("GraphQL resource limits", () => {
  it("accepts a bounded query", () => {
    expect(() => assertGraphQLQuerySafe("query { me { userId email } }")).not.toThrow();
  });

  it("rejects excessive depth", () => {
    const query = `query { ${"a { ".repeat(MAX_GRAPHQL_DEPTH + 1)}x ${"}".repeat(MAX_GRAPHQL_DEPTH + 1)} }`;
    expect(() => assertGraphQLQuerySafe(query)).toThrow(/too deep/);
  });

  it("rejects alias amplification", () => {
    const fields = Array.from({ length: MAX_GRAPHQL_ALIASES + 1 }, (_, i) => `a${i}: me { userId }`).join(" ");
    expect(() => assertGraphQLQuerySafe(`query { ${fields} }`)).toThrow(/too many aliases/);
  });
});
