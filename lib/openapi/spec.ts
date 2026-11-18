import { SITE, CONTACTS } from "@/lib/seo";

// ---------------------------------------------------------------------------
// OpenAPI 3.1 spec for the real, already-shipped public partner API
// (app/api/public/v1/**, lib/api-keys/gateway.ts). Documents every endpoint
// that actually exists and is wired to a scope. "users:read" is a grantable
// scope in lib/integrations/scopes.ts but has no endpoint yet, so it is left
// out rather than documented as if it were real.
// ---------------------------------------------------------------------------

export function openApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE.name} Public API`,
      version: "1.1.0",
      description:
        "Read and create shifts, discover your branches, read approved timesheets and invoices, manage webhook subscriptions, and ask the ZekerFlex brain for your organization. " +
        "All endpoints require an API key — see /developers for how to request one.",
      contact: { name: SITE.name, email: CONTACTS.partners, url: `${SITE.url}/developers` },
    },
    servers: [{ url: `${SITE.url}/api/public/v1`, description: "Production" }],
    security: [{ apiKey: [] }],
    tags: [
      { name: "shifts", description: "Open work shifts" },
      { name: "branches", description: "Your organization's branches" },
      { name: "timesheets", description: "Approved/paid timesheets" },
      { name: "invoices", description: "Invoices addressed to your organization" },
      { name: "webhooks", description: "Event subscriptions" },
      { name: "brain", description: "The ZekerFlex AI brain" },
    ],
    paths: {
      "/shifts": {
        get: {
          operationId: "listOpenShifts",
          summary: "List open shifts",
          description:
            "Returns open shifts for the calling organization (max 100, soonest first). A platform-wide key (no tenant binding) sees every organization's open shifts; a tenant-scoped key sees only its own.",
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
          description: "Creates a new open shift for the calling organization and immediately runs matching against it. A time without a zone is read as Dutch local time.",
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
            "412": PRECONDITION,
            "422": VALIDATION,
            "429": RATE_LIMITED,
          },
        },
      },
      "/shifts/{id}": {
        get: {
          operationId: "getShift",
          summary: "Get one shift",
          description: "Returns one shift of the calling organization, including who is scheduled (first name + initial of the surname only).",
          tags: ["shifts"],
          security: [{ apiKey: ["shifts:read"] }],
          parameters: [ID_PARAM],
          responses: {
            "200": {
              description: "The shift, with who is scheduled.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/ShiftDetailResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "404": NOT_FOUND,
            "429": RATE_LIMITED,
          },
        },
      },
      "/branches": {
        get: {
          operationId: "listBranches",
          summary: "List branches",
          description: "Returns the branches of the calling organization, so you can find the branchId that POST /shifts needs. The key must be tenant-scoped.",
          tags: ["branches"],
          security: [{ apiKey: ["shifts:read"] }],
          responses: {
            "200": {
              description: "A list of branches.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/BranchListResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "412": PRECONDITION,
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
      "/invoices": {
        get: {
          operationId: "listInvoices",
          summary: "List invoices",
          description: "Returns invoices addressed to the calling organization, newest first (max 200, drafts excluded).",
          tags: ["invoices"],
          security: [{ apiKey: ["invoices:read"] }],
          parameters: [
            { name: "since", in: "query", required: false, description: "Only invoices issued on or after this date (YYYY-MM-DD).", schema: { type: "string", format: "date" } },
          ],
          responses: {
            "200": {
              description: "A list of invoices.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/InvoiceListResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "429": RATE_LIMITED,
          },
        },
      },
      "/webhooks": {
        get: {
          operationId: "listWebhookSubscriptions",
          summary: "List webhook subscriptions",
          description: "Returns the webhook subscriptions of the calling organization (without the signing secret).",
          tags: ["webhooks"],
          security: [{ apiKey: ["webhooks:manage"] }],
          responses: {
            "200": {
              description: "A list of subscriptions.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookListResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "412": PRECONDITION,
            "429": RATE_LIMITED,
          },
        },
        post: {
          operationId: "createWebhookSubscription",
          summary: "Register a webhook subscription",
          description:
            "Subscribes a URL to one or more event types for the calling organization. The signing secret is returned once, in the response body — it is not retrievable again afterwards. Deliveries are signed with HMAC-SHA256 (header x-zekerflex-signature: v1=<hex> over `<timestamp>.<body>`).",
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
            "412": PRECONDITION,
            "422": VALIDATION,
            "429": RATE_LIMITED,
          },
        },
      },
      "/webhooks/{id}": {
        delete: {
          operationId: "deleteWebhookSubscription",
          summary: "Delete a webhook subscription",
          description: "Removes one of the calling organization's webhook subscriptions (its pending deliveries go with it).",
          tags: ["webhooks"],
          security: [{ apiKey: ["webhooks:manage"] }],
          parameters: [ID_PARAM],
          responses: {
            "200": {
              description: "The subscription was removed.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/DeleteResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "404": NOT_FOUND,
            "412": PRECONDITION,
            "429": RATE_LIMITED,
          },
        },
      },
      "/brain": {
        post: {
          operationId: "askBrain",
          summary: "Ask the ZekerFlex brain",
          description:
            "Asks the ZekerFlex AI brain a question on behalf of your organization (the same brain as in the app: retrieval + read-only data tools, stateless). Made for n8n, Make, Zapier or your own code.",
          tags: ["brain"],
          security: [{ apiKey: ["brain:ask"] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/BrainRequest" } } },
          },
          responses: {
            "200": {
              description: "The brain's answer, with the sources and links it used.",
              headers: RATE_LIMIT_HEADERS,
              content: { "application/json": { schema: { $ref: "#/components/schemas/BrainResponse" } } },
            },
            "401": UNAUTHENTICATED,
            "403": FORBIDDEN,
            "422": VALIDATION,
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
            "A ZekerFlex API key, as `Authorization: Bearer zf_live_...` (the endpoints also accept it as an `x-api-key` header). Create one yourself (Free tier, no payment needed) at " +
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
        ShiftDetail: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            status: { type: "string" },
            startsAt: { type: "string", format: "date-time" },
            endsAt: { type: "string", format: "date-time" },
            breakMinutes: { type: "integer" },
            hourlyRateCents: { type: "integer" },
            positions: { type: "integer" },
            branch: {
              type: "object",
              properties: { id: { type: "string" }, name: { type: "string" }, city: { type: "string" } },
            },
            filled: { type: "integer", description: "How many positions are filled." },
            scheduled: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  assignmentId: { type: "string" },
                  workerId: { type: "string" },
                  name: { type: "string", description: "First name + initial of the surname only." },
                  since: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        ShiftDetailResponse: {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/ShiftDetail" } },
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
        Branch: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            city: { type: "string" },
            postalCode: { type: "string" },
          },
          required: ["id", "name", "city", "postalCode"],
        },
        BranchListResponse: {
          type: "object",
          properties: { data: { type: "array", items: { $ref: "#/components/schemas/Branch" } } },
          required: ["data"],
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
        Invoice: {
          type: "object",
          properties: {
            id: { type: "string" },
            number: { type: "string" },
            type: { type: "string" },
            status: { type: "string" },
            currency: { type: "string" },
            subtotalCents: { type: "integer" },
            vatRate: { type: "number" },
            vatCents: { type: "integer" },
            totalCents: { type: "integer" },
            issuedAt: { type: "string", format: "date-time" },
            paidAt: { type: ["string", "null"], format: "date-time" },
            timesheetId: { type: ["string", "null"] },
          },
        },
        InvoiceListResponse: {
          type: "object",
          properties: { data: { type: "array", items: { $ref: "#/components/schemas/Invoice" } } },
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
            data: { $ref: "#/components/schemas/WebhookSubscription" },
            secret: { type: "string", description: "The webhook signing secret — shown once, never retrievable again." },
          },
        },
        WebhookSubscription: {
          type: "object",
          properties: {
            id: { type: "string" },
            url: { type: "string" },
            eventTypes: { type: "array", items: { type: "string" } },
            active: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        WebhookListResponse: {
          type: "object",
          properties: { data: { type: "array", items: { $ref: "#/components/schemas/WebhookSubscription" } } },
          required: ["data"],
        },
        DeleteResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: { id: { type: "string" }, deleted: { type: "boolean" } },
            },
          },
        },
        BrainRequest: {
          type: "object",
          properties: {
            question: { type: "string", minLength: 1, maxLength: 1500 },
            context: { description: "Extra context (string or object); treated as data, never as instructions." },
          },
          required: ["question"],
        },
        BrainResponse: {
          type: "object",
          properties: {
            answer: { type: "string" },
            mode: { type: "string" },
            tools: { type: "array", items: { type: "string" } },
            sources: { type: "array", items: {} },
            links: { type: "array", items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } } } },
          },
          required: ["answer"],
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

const ID_PARAM = { name: "id", in: "path", required: true, schema: { type: "string" } } as const;

const UNAUTHENTICATED = {
  description: "Missing or invalid API key.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

const FORBIDDEN = {
  description: "The key lacks the required scope.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

const NOT_FOUND = {
  description: "No such resource for this organization.",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

const PRECONDITION = {
  description: "The API key isn't bound to an organization (or the referenced branch doesn't belong to it).",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

const VALIDATION = {
  description: "Validation failed (e.g. end time before start time, or an unknown event type).",
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};

const RATE_LIMITED = {
  description: "Too many requests — your plan's per-minute or monthly limit was exceeded. See /developers for plan limits.",
  headers: { ...RATE_LIMIT_HEADERS, "Retry-After": { schema: { type: "integer" }, description: "Seconds until you may retry." } },
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
};
