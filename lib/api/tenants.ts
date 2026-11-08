import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import crypto from "crypto";
import { z } from "zod";

export const apiKeySchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  rateLimit: z.number().default(1000),
  scopes: z.array(z.string()).default(["read"]),
  expiresAt: z.date().optional(),
});

export async function createApiKey(
  tenantId: string,
  name: string,
  scopes: string[] = ["read"]
) {
  const key = generateApiKey();
  const hashedKey = hashApiKey(key);

  const apiKey = await prisma.apiKey.create({
    data: {
      tenantId,
      name,
      key: hashedKey,
      scopes,
      rateLimit: 1000,
      lastUsedAt: null,
    },
  });

  return { ...apiKey, key }; // Return unhashed key only once
}

export async function getApiKey(key: string) {
  const hashedKey = hashApiKey(key);

  return await prisma.apiKey.findUnique({
    where: { key: hashedKey },
  });
}

export async function validateApiKey(key: string) {
  const apiKey = await getApiKey(key);

  if (!apiKey) {
    throw AppError.unauthorized("Invalid API key");
  }

  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    throw AppError.unauthorized("API key expired");
  }

  return apiKey;
}

export async function revokeApiKey(keyId: string) {
  return await prisma.apiKey.delete({
    where: { id: keyId },
  });
}

export async function listApiKeys(tenantId: string) {
  return await prisma.apiKey.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      scopes: true,
      lastUsedAt: true,
      createdAt: true,
      expiresAt: true,
      // Never return the actual key
    },
  });
}

export async function logApiUsage(
  apiKeyId: string,
  endpoint: string,
  method: string,
  statusCode: number
) {
  await prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { lastUsedAt: new Date() },
  });

  return await prisma.apiLog.create({
    data: {
      apiKeyId,
      endpoint,
      method,
      statusCode,
      timestamp: new Date(),
    },
  });
}

export async function checkRateLimit(
  apiKeyId: string,
  windowSeconds = 60
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
  });

  if (!apiKey) {
    return { allowed: false, remaining: 0, resetAt: new Date() };
  }

  const windowStart = new Date(Date.now() - windowSeconds * 1000);

  const requestCount = await prisma.apiLog.count({
    where: {
      apiKeyId,
      timestamp: { gte: windowStart },
    },
  });

  const remaining = Math.max(0, apiKey.rateLimit - requestCount);
  const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000);

  return {
    allowed: remaining > 0,
    remaining,
    resetAt,
  };
}

export async function generateWebhookSecret(tenantId: string): Promise<string> {
  const secret = crypto.randomBytes(32).toString("hex");

  await prisma.webhookSecret.upsert({
    where: { tenantId },
    update: { secret },
    create: { tenantId, secret },
  });

  return secret;
}

export async function getWebhookSecret(tenantId: string): Promise<string | null> {
  const record = await prisma.webhookSecret.findUnique({
    where: { tenantId },
  });

  return record?.secret ?? null;
}

export async function rotateWebhookSecret(tenantId: string): Promise<string> {
  return generateWebhookSecret(tenantId);
}

function generateApiKey(): string {
  return `zf_${crypto.randomBytes(32).toString("hex")}`;
}

function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function generateSDK(tenantId: string, language: "javascript" | "python" | "go" = "javascript") {
  const apiKeys = await listApiKeys(tenantId);
  const baseUrl = process.env.API_URL || "https://api.zekerflex.com";

  const sdks = {
    javascript: generateJavaScriptSDK(baseUrl),
    python: generatePythonSDK(baseUrl),
    go: generateGoSDK(baseUrl),
  };

  return sdks[language];
}

function generateJavaScriptSDK(baseUrl: string): string {
  return `
import axios from 'axios';

export class ZekerFlexClient {
  private apiKey: string;
  private baseUrl: string = '${baseUrl}';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async get(endpoint: string, params?: Record<string, any>) {
    return axios.get(\`\${this.baseUrl}\${endpoint}\`, {
      headers: { 'Authorization': \`Bearer \${this.apiKey}\` },
      params,
    });
  }

  async post(endpoint: string, data: Record<string, any>) {
    return axios.post(\`\${this.baseUrl}\${endpoint}\`, data, {
      headers: { 'Authorization': \`Bearer \${this.apiKey}\` },
    });
  }
}
`;
}

function generatePythonSDK(baseUrl: string): string {
  return `
import requests

class ZekerFlexClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = '${baseUrl}'
        self.headers = {'Authorization': f'Bearer {api_key}'}

    def get(self, endpoint: str, params: dict = None):
        return requests.get(f'{self.base_url}{endpoint}', headers=self.headers, params=params)

    def post(self, endpoint: str, data: dict):
        return requests.post(f'{self.base_url}{endpoint}', headers=self.headers, json=data)
`;
}

function generateGoSDK(baseUrl: string): string {
  return `
package zekerflex

import (
    "fmt"
    "net/http"
)

type Client struct {
    APIKey  string
    BaseURL string
}

func NewClient(apiKey string) *Client {
    return &Client{
        APIKey:  apiKey,
        BaseURL: "${baseUrl}",
    }
}

func (c *Client) Get(endpoint string) (*http.Response, error) {
    req, _ := http.NewRequest("GET", c.BaseURL+endpoint, nil)
    req.Header.Add("Authorization", fmt.Sprintf("Bearer %s", c.APIKey))
    return http.DefaultClient.Do(req)
}
`;
}
