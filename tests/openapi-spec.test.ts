import { describe, expect, it } from "vitest";
import { openApiSpec } from "@/lib/openapi/spec";

describe("openApiSpec", () => {
  const spec = openApiSpec() as {
    openapi: string;
    paths: Record<string, Record<string, { operationId?: string; description?: string; security?: unknown[] }>>;
    components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
  };

  it("declares a 3.1 document with a security scheme", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.components.securitySchemes.apiKey).toBeDefined();
  });

  it("documents only the endpoints that actually exist (shifts, timesheets/approved, webhooks)", () => {
    expect(Object.keys(spec.paths).sort()).toEqual(["/shifts", "/timesheets/approved", "/webhooks"]);
  });

  it("gives every operation a unique operationId and a description", () => {
    const seen = new Set<string>();
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        expect(op.operationId, `${method.toUpperCase()} ${path} missing operationId`).toBeTruthy();
        expect(seen.has(op.operationId!), `duplicate operationId ${op.operationId}`).toBe(false);
        seen.add(op.operationId!);
        expect(op.description, `${method.toUpperCase()} ${path} missing description`).toBeTruthy();
        expect(op.security, `${method.toUpperCase()} ${path} missing a scoped security requirement`).toBeDefined();
      }
    }
  });

  it("does not document the unwired invoices:read or users:read scopes as if they had endpoints", () => {
    const raw = JSON.stringify(spec);
    expect(raw).not.toContain("invoices:read");
    expect(raw).not.toContain("users:read");
  });
});
