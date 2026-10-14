import { SITE, CONTACTS } from "@/lib/seo";

// ---------------------------------------------------------------------------
// OpenAPI 3.1 spec for the real, already-shipped public partner API
// (app/api/public/v1/**, lib/api-keys/gateway.ts). Deliberately documents
// only the three endpoints that actually exist and are wired to a scope —
// "invoices:read" and "users:read" are defined as grantable scopes in
// lib/integrations/api-keys.ts but have no endpoint behind them yet, so they
// are left out rather than documented as if they were real.
// ---------------------------------------------------------------------------

export function openApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE.name} Public API`,
      version: "1.0.0",
      description:
        "Read open shifts and approved timesheets, create shifts, and register webhook subscriptions for your organization. " +
        "All endpoints require an API key — see /developers for how to request one.",
      contact: { name: SITE.name, email: CONTACTS.partners, url: `${SITE.url}/developers` },
    },
    servers: [{ url: `${SITE.url}/api/public/v1`, description: "Production" }],
    security: [{ apiKey: [] }],
    tags: [
      { name: "shifts", description: "Open work shifts" },
      { name: "timesheets", description: "Approved/paid timesheets" },
      { name: "webhooks", description: "Event subscriptions" },
    ],
    paths: {
      "/shifts": {
        get: {
          operationId: "listOpenShifts",
          summary: "List open shifts",
          description:
            "Returns open shifts for the calling organization. A platform-wide key (no tenant binding) sees every organization's open shifts; a tenant-scoped key sees only its own.",
          tags: ["shifts"],
          security: [{ apiKey: ["shifts:read"] }],
          responses: {
            "200": {
              description: "A list of open shifts.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/ShiftListResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "429": RATE_LIMITED,
          },
        },
        post: {
          operationId: "createShift",
          summary: "Create a shift",
          description: "Creates a new open shift for the calling organization and immediately runs matching against it.",
          tags: ["shifts"],
          security: [{ apiKey: ["shifts:write"] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateShiftRequest" } } },
          },
          responses: {
            "201": {
              description: "The created shift.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/CreateShiftResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "412": {
              description: "The API key isn't bound to an organization, or the branch doesn't belong to it.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "422": {
              description: "Validation failed (e.g. end time before start time).",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "429": RATE_LIMITED,
          },
        },
      },
      "/timesheets/approved": {
        get: {
          operationId: "listApprovedTimesheets",
          summary: "List approved/paid timesheets",
          description: "Returns approved or paid timesheets for the calling organization, most recently approved first.",
          tags: ["timesheets"],
          security: [{ apiKey: ["timesheets:read"] }],
          responses: {
            "200": {
              description: "A list of approved/paid timesheets.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/TimesheetListResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "429": RATE_LIMITED,
          },
        },
      },
      "/webhooks": {
        post: {
          operationId: "createWebhookSubscription",
          summary: "Register a webhook subscription",
          description:
            "Subscribes a URL to one or more event types for the calling organization. The signing secret is returned once, in the response body — it is not retrievable again afterwards.",
          tags: ["webhooks"],
          security: [{ apiKey: ["webhooks:manage"] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateWebhookRequest" } } },
          },
          responses: {
            "201": {
              description: "The created subscription, including the one-time signing secret.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/CreateWebhookResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "412": {
              description: "The API key isn't bound to an organization.",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "422": {
              description: "Validation failed (e.g. an invalid URL or unknown event type).",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
            },
            "429": RATE_LIMITED,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "zf_live_...",
          description:
            "A ZekerFlex API key, as `Authorization: Bearer zf_live_...` (the shifts/timesheets/webhooks endpoints also accept it as an `x-api-key` header). Create one yourself (Free tier, no payment needed) at " +
            SITE.url +
            "/werkgever/integraties, or contact " +
            CONTACTS.partners +
            " for Scale-level volume.",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "FORBIDDEN" },
                message: { type: "string" },
              },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
        Shift: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            startsAt: { type: "string", format: "date-time" },
            endsAt: { type: "string", format: "date-time" },
            hourlyRateCents: { type: "integer", description: "Gross hourly rate in eurocents." },
            positions: { type: "integer" },
            status: { type: "string", enum: ["OPEN", "MATCHING", "PARTIALLY_FILLED"] },
            branch: { type: "string" },
            city: { type: "string" },
          },
          required: ["id", "title", "startsAt", "endsAt", "hourlyRateCents", "positions", "status", "branch", "city"],
        },
        ShiftListResponse: {
          type: "object",
          properties: { data: { type: "array", items: { $ref: "#/components/schemas/Shift" } } },
          required: ["data"],
        },
        CreateShiftRequest: {
          type: "object",
          properties: {
            branchId: { type: "string" },
            title: { type: "string", minLength: 3, maxLength: 120 },
            description: { type: "string", maxLength: 1000 },
            startsAt: { type: "string", format: "date-time" },
            endsAt: { type: "string", format: "date-time" },
            breakMinutes: { type: "integer", minimum: 0, maximum: 240, default: 0 },
            hourlyRateCents: { type: "integer", minimum: 0, maximum: 20000 },
            positions: { type: "integer", minimum: 1, maximum: 50, default: 1 },
          },
          required: ["branchId", "title", "startsAt", "endsAt", "hourlyRateCents"],
        },
        CreateShiftResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                startsAt: { type: "string", format: "date-time" },
                endsAt: { type: "string", format: "date-time" },
                status: { type: "string" },
              },
            },
          },
        },
        Timesheet: {
          type: "object",
          properties: {
            id: { type: "string" },
            scheduledStart: { type: "string", format: "date-time" },
            scheduledEnd: { type: "string", format: "date-time" },
            billableMinutes: { type: "integer" },
            hourlyRateCents: { type: "integer" },
            status: { type: "string", enum: ["APPROVED", "PAID"] },
            branch: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } } },
            freelancer: { type: "object", properties: { id: { type: "string" }, user: { type: "object", properties: { fullName: { type: "string" } } } } },
          },
        },
        TimesheetListResponse: {
          type: "object",
          properties: { data: { type: "array", items: { $ref: "#/components/schemas/Timesheet" } } },
        },
        CreateWebhookRequest: {
          type: "object",
          properties: {
            url: { type: "string", format: "uri" },
            eventTypes: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              items: { type: "string", enum: ["shift.matched", "freelancer.checked_in", "timesheet.approved", "dispute.opened", "invoice.issued"] },
            },
          },
          required: ["url", "eventTypes"],
        },
        CreateWebhookResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id: { type: "string" },
                url: { type: "string" },
                eventTypes: { type: "array", items: { type: "string" } },
                createdAt: { type: "string", format: "date-time" },
              },
            },
            secret: { type: "string", description: "The webhook signing secret — shown once, never retrievable again." },
          },
        },
      },
    },
  };
}

const RATE_LIMIT_HEADERS = {
  "RateLimit-Limit": { schema: { type: "integer" }, description: "Requests allowed per window." },
  "RateLimit-Remaining": { schema: { type: "integer" }, description: "Requests remaining in the current window." },
  "RateLimit-Reset": { schema: { type: "integer" }, description: "Seconds until the window resets." },
} as const;

const UNAUTHENTICATED = {
  description: "Missing or invalid API key.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

const FORBIDDEN = {
  description: "The key lacks the required scope.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

const RATE_LIMITED = {
  description: "Too many requests — your plan's per-minute or monthly limit was exceeded. See /developers for plan limits.",
  headers: { ...RATE_LIMIT_HEADERS, "Retry-After": { schema: { type: "integer" }, description: "Seconds until you may retry." } },
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};
