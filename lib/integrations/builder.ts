import { z } from "zod";

interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  authentication?: "bearer" | "basic" | "none";
}

interface RateLimit {
  requestsPerSecond: number;
  requestsPerHour?: number;
  burstSize?: number;
}

export class APIIntegrationBuilder {
  private baseUrl: string;
  private token?: string;
  private rateLimit: RateLimit;
  private cache: Map<string, { data: unknown; expiry: number }> = new Map();
  private requestCount = 0;
  private lastReset = Date.now();

  constructor(baseUrl: string, rateLimit: RateLimit = { requestsPerSecond: 10 }) {
    this.baseUrl = baseUrl;
    this.rateLimit = rateLimit;
  }

  setAuthentication(token: string) {
    this.token = token;
  }

  private buildUrl(endpoint: string, query?: Record<string, unknown>): string {
    let url = `${this.baseUrl}${endpoint}`;
    if (query) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => {
        if (v !== null && v !== undefined) params.append(k, String(v));
      });
      url += `?${params}`;
    }
    return url;
  }

  private async checkRateLimit() {
    const now = Date.now();
    if (now - this.lastReset > 1000) {
      this.requestCount = 0;
      this.lastReset = now;
    }

    if (this.requestCount >= this.rateLimit.requestsPerSecond) {
      await new Promise((r) => setTimeout(r, 100));
    }
    this.requestCount++;
  }

  async request<T>(endpoint: APIEndpoint): Promise<T> {
    const cacheKey = `${endpoint.method}:${endpoint.url}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.data as T;
    }

    await this.checkRateLimit();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...endpoint.headers,
    };

    if (this.token && endpoint.authentication === "bearer") {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(this.buildUrl(endpoint.url, endpoint.query), {
      method: endpoint.method,
      headers,
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });

    if (!response.ok) throw new Error(`API request failed: ${response.statusText}`);

    const data = await response.json();

    if (endpoint.method === "GET") {
      this.cache.set(cacheKey, { data, expiry: Date.now() + 5 * 60 * 1000 });
    }

    return data as T;
  }

  clearCache() {
    this.cache.clear();
  }
}

export interface TransformRule {
  source: string;
  target: string;
  transform?: (value: unknown) => unknown;
}

export function transformData(
  data: Record<string, unknown>,
  rules: TransformRule[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const rule of rules) {
    const value = data[rule.source];
    result[rule.target] = rule.transform ? rule.transform(value) : value;
  }
  return result;
}
