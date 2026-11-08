import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
}

export interface APISecurityConfig {
  rateLimit: RateLimitConfig;
  requireAuth: boolean;
  jwtSecret: string;
  allowedOrigins: string[];
  enableCSRF: boolean;
}

const requestStore = new Map<string, { count: number; resetTime: number }>();

export function validateAPIRequest(req: NextRequest, config: APISecurityConfig): { valid: boolean; error?: string } {
  // 1. Check CORS origin
  const origin = req.headers.get("origin");
  if (origin && !config.allowedOrigins.includes(origin)) {
    return { valid: false, error: "CORS origin not allowed" };
  }

  // 2. Check Content-Type for POST/PUT
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentType = req.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return { valid: false, error: "Content-Type must be application/json" };
    }
  }

  // 3. Check authorization header
  if (config.requireAuth) {
    const auth = req.headers.get("authorization");
    if (!auth || !auth.startsWith("Bearer ")) {
      return { valid: false, error: "Missing or invalid Authorization header" };
    }
  }

  // 4. CSRF token validation
  if (config.enableCSRF && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const csrfToken = req.headers.get("x-csrf-token");
    const sessionToken = req.cookies.get("__session")?.value;
    if (!csrfToken || !sessionToken) {
      return { valid: false, error: "CSRF token missing" };
    }
    // Verify CSRF token matches session
  }

  return { valid: true };
}

export function enforceRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetTime: number } {
  const key = config.keyGenerator ? config.keyGenerator(req) : req.headers.get("x-forwarded-for") || "unknown";
  const now = Date.now();

  let record = requestStore.get(key);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + config.windowMs };
  }

  record.count += 1;

  if (record.count > config.maxRequests) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  requestStore.set(key, record);

  return {
    allowed: true,
    remaining: config.maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

export function verifyJWT(token: string, secret: string): { valid: boolean; payload?: any } {
  try {
    // In production, use jsonwebtoken library
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false };

    const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString());
    const payload = JSON.stringify(parts[0] + "." + parts[1]);
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");

    if (signature !== parts[2]) return { valid: false };
    if (decoded.exp && decoded.exp < Date.now() / 1000) return { valid: false };

    return { valid: true, payload: decoded };
  } catch {
    return { valid: false };
  }
}

export function sanitizeInput(input: any): any {
  if (typeof input === "string") {
    return input
      .replace(/[<>]/g, "")
      .replace(/javascript:/gi, "")
      .substring(0, 1000);
  }
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  if (typeof input === "object") {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

export function detectSQLInjection(input: string): boolean {
  const sqlPatterns = [
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bOR\b\s*[\w\s]*=)/i,
    /(\bDROP\b\s*\bTABLE\b)/i,
    /(\bDELETE\b\s*\bFROM\b)/i,
    /(-{2}.*$)/m,
    /(\bEXEC\b)/i,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
}

export function detectXSS(input: string): boolean {
  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>/gi,
    /<embed[^>]*>/gi,
    /<object[^>]*>/gi,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
}

export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function validateCSRFToken(token: string, sessionToken: string): boolean {
  // CSRF token should be derived from session token
  const derived = crypto.createHmac("sha256", sessionToken).update("csrf").digest("hex");
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(derived));
}

export interface IPAddress {
  address: string;
  version: "v4" | "v6";
  isPrivate: boolean;
  isLoopback: boolean;
}

export function parseIPAddress(ip: string): IPAddress | null {
  // Parse and validate IP address
  const isV4 = /^(\d+\.){3}\d+$/.test(ip);
  const isV6 = ip.includes(":");

  if (!isV4 && !isV6) return null;

  const isPrivate = isV4
    ? /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(ip) ||
      ip === "127.0.0.1"
    : ip.startsWith("fc") || ip.startsWith("fd") || ip === "::1";

  return {
    address: ip,
    version: isV4 ? "v4" : "v6",
    isPrivate,
    isLoopback: ip === "127.0.0.1" || ip === "::1",
  };
}

export function checkIPWhitelist(ip: string, whitelist: string[]): boolean {
  // Check if IP matches whitelist (support CIDR)
  return whitelist.some((allowed) => {
    if (allowed === ip) return true;
    // CIDR check would go here
    return false;
  });
}

export async function logSecurityEvent(
  eventType: string,
  severity: "low" | "medium" | "high" | "critical",
  userId: string,
  details: any
): Promise<void> {
  // Log security event for monitoring and alerting
  const event = {
    timestamp: new Date(),
    eventType,
    severity,
    userId,
    details,
  };

  // In production: send to security monitoring system (Datadog, Splunk, etc)
  console.log("[SECURITY]", JSON.stringify(event));
}
