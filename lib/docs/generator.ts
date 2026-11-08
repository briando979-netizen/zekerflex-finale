export interface ApiEndpoint {
  path: string;
  method: string;
  description: string;
  auth: "none" | "required" | "admin";
  params?: Record<string, string>;
  body?: Record<string, string>;
  response: Record<string, string>;
}

export const API_DOCS: ApiEndpoint[] = [
  {
    path: "/api/shifts/search",
    method: "POST",
    description: "Advanced job search with multi-criteria filtering",
    auth: "required",
    body: { query: "search term", filters: "filter object", page: "page number" },
    response: { shifts: "array of shifts", total: "total count" },
  },
  {
    path: "/api/dashboard/earnings-summary",
    method: "GET",
    description: "Worker earnings dashboard with period filtering",
    auth: "required",
    response: { thisMonth: "amount", thisYear: "amount", last30Days: "amount" },
  },
  {
    path: "/api/bookings",
    method: "POST",
    description: "Create new booking",
    auth: "required",
    body: { productId: "string", quantity: "number", datum: "ISO date" },
    response: { booking: "booking object" },
  },
];

export function generateMarkdownDocs(): string {
  let doc = "# ZekerFlex API Documentation\n\n";

  for (const endpoint of API_DOCS) {
    doc += `## ${endpoint.method} ${endpoint.path}\n\n`;
    doc += `${endpoint.description}\n\n`;
    doc += `**Auth**: ${endpoint.auth}\n\n`;

    if (endpoint.params) {
      doc += `### Parameters\n`;
      for (const [key, type] of Object.entries(endpoint.params)) {
        doc += `- \`${key}\` (${type})\n`;
      }
      doc += "\n";
    }

    if (endpoint.body) {
      doc += `### Request Body\n`;
      for (const [key, type] of Object.entries(endpoint.body)) {
        doc += `- \`${key}\` (${type})\n`;
      }
      doc += "\n";
    }

    doc += `### Response\n`;
    for (const [key, desc] of Object.entries(endpoint.response)) {
      doc += `- \`${key}\`: ${desc}\n`;
    }
    doc += "\n";
  }

  return doc;
}

export function generateOpenApiSpec() {
  return {
    openapi: "3.0.0",
    info: { title: "ZekerFlex API", version: "1.0.0" },
    paths: Object.fromEntries(
      API_DOCS.map((ep) => [
        ep.path,
        {
          [ep.method.toLowerCase()]: {
            description: ep.description,
            security: ep.auth === "none" ? [] : [{ bearerAuth: [] }],
            requestBody: ep.body ? { content: { "application/json": { schema: ep.body } } } : undefined,
            responses: { 200: { description: "Success", content: { "application/json": { schema: ep.response } } } },
          },
        },
      ])
    ),
  };
}
