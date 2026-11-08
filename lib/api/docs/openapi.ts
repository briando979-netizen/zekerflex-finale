interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, PathItem>;
  components: Components;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  delete?: Operation;
  patch?: Operation;
}

interface Operation {
  summary: string;
  description?: string;
  operationId: string;
  tags: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
}

interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: Schema;
  description?: string;
}

interface RequestBody {
  content: Record<string, MediaType>;
  required?: boolean;
}

interface MediaType {
  schema: Schema;
}

interface Response {
  description: string;
  content?: Record<string, MediaType>;
}

interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  example?: unknown;
  description?: string;
}

interface Components {
  schemas: Record<string, Schema>;
  securitySchemes: Record<string, SecurityScheme>;
}

interface SecurityScheme {
  type: "apiKey" | "http" | "oauth2";
  name?: string;
  in?: string;
  scheme?: string;
  flows?: Record<string, any>;
}

class OpenApiGenerator {
  private document: OpenApiDocument;

  constructor(title: string, version: string) {
    this.document = {
      openapi: "3.0.0",
      info: { title, version },
      servers: [{ url: "https://api.example.com", description: "Production" }],
      paths: {},
      components: { schemas: {}, securitySchemes: {} },
    };
  }

  addPath(path: string, method: "get" | "post" | "put" | "delete" | "patch", operation: Operation): void {
    if (!this.document.paths[path]) {
      this.document.paths[path] = {};
    }

    this.document.paths[path][method] = operation;
  }

  addSchema(name: string, schema: Schema): void {
    this.document.components.schemas[name] = schema;
  }

  addSecurityScheme(name: string, scheme: SecurityScheme): void {
    this.document.components.securitySchemes[name] = scheme;
  }

  addServer(url: string, description?: string): void {
    this.document.servers.push({ url, description });
  }

  generate(): OpenApiDocument {
    return this.document;
  }

  generateJson(): string {
    return JSON.stringify(this.document, null, 2);
  }

  generateYaml(): string {
    // Simple YAML generation (use proper YAML library in production)
    const lines: string[] = [];

    lines.push(`openapi: ${this.document.openapi}`);
    lines.push("info:");
    lines.push(`  title: ${this.document.info.title}`);
    lines.push(`  version: ${this.document.info.version}`);

    lines.push("servers:");
    for (const server of this.document.servers) {
      lines.push(`  - url: ${server.url}`);
      if (server.description) {
        lines.push(`    description: ${server.description}`);
      }
    }

    lines.push("paths:");
    for (const [path, pathItem] of Object.entries(this.document.paths)) {
      lines.push(`  ${path}:`);
      for (const [method, operation] of Object.entries(pathItem)) {
        lines.push(`    ${method}:`);
        lines.push(`      summary: ${operation.summary}`);
        lines.push(`      operationId: ${operation.operationId}`);
        lines.push("      tags:");
        for (const tag of operation.tags) {
          lines.push(`        - ${tag}`);
        }
      }
    }

    return lines.join("\n");
  }

  // Generate code examples
  generateCodeExample(endpoint: string, method: string, language: "javascript" | "python" | "curl"): string {
    const pathItem = this.document.paths[endpoint];
    if (!pathItem) return "";

    const operation = pathItem[method as keyof PathItem] as Operation;
    if (!operation) return "";

    if (language === "curl") {
      return `curl -X ${method.toUpperCase()} https://api.example.com${endpoint}`;
    } else if (language === "javascript") {
      return `fetch('https://api.example.com${endpoint}', {
  method: '${method.toUpperCase()}',
  headers: { 'Authorization': 'Bearer token' }
})`;
    } else if (language === "python") {
      return `import requests
response = requests.${method}('https://api.example.com${endpoint}',
  headers={'Authorization': 'Bearer token'})`;
    }

    return "";
  }

  // Generate migration guide
  generateMigrationGuide(fromVersion: string, toVersion: string, changes: Array<{ endpoint: string; change: string }>): string {
    let guide = `# Migration Guide: ${fromVersion} → ${toVersion}\n\n`;

    for (const change of changes) {
      guide += `## ${change.endpoint}\n${change.change}\n\n`;
    }

    return guide;
  }
}

export { OpenApiGenerator, type OpenApiDocument, type Operation, type Schema };
