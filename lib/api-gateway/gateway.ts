import { NextRequest, NextResponse } from "next/server";

interface GatewayConfig {
  routes: Route[];
  rateLimit: RateLimitConfig;
  circuitBreaker: CircuitBreakerConfig;
}

interface Route {
  path: string;
  methods: string[];
  target: string;
  middlewares: Middleware[];
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitorInterval: number;
}

type Middleware = (req: NextRequest) => Promise<NextRequest | NextResponse>;

class ApiGateway {
  private config: GatewayConfig;
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  private circuitBreakerStates = new Map<string, CircuitBreakerState>();

  constructor(config: GatewayConfig) {
    this.config = config;
  }

  async handleRequest(req: NextRequest): Promise<NextResponse> {
    const path = new URL(req.url).pathname;
    const method = req.method;

    // Find matching route
    const route = this.findRoute(path, method);
    if (!route) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 });
    }

    // Rate limiting
    const rateLimitKey = (this.config.rateLimit.keyGenerator?.(req) || req.ip) || "unknown";
    if (!this.checkRateLimit(rateLimitKey)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    // Circuit breaker check
    const circuitState = this.getCircuitBreakerState(route.target);
    if (circuitState.isOpen) {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }

    // Apply middlewares
    let modifiedReq = req;
    for (const middleware of route.middlewares) {
      const result = await middleware(modifiedReq);
      if (result instanceof NextResponse) {
        return result;
      }
      modifiedReq = result;
    }

    // Forward request
    try {
      const response = await this.forwardRequest(modifiedReq, route.target);
      circuitState.recordSuccess();
      return response;
    } catch (error) {
      circuitState.recordFailure();
      if (circuitState.isOpen) {
        return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
      }
      throw error;
    }
  }

  private findRoute(path: string, method: string): Route | undefined {
    return this.config.routes.find(
      (route) => this.matchPath(path, route.path) && route.methods.includes(method)
    );
  }

  private matchPath(pathname: string, pattern: string): boolean {
    const patternRegex = new RegExp(`^${pattern.replace(/:\w+/g, "[^/]+")}$`);
    return patternRegex.test(pathname);
  }

  private checkRateLimit(key: string): boolean {
    const now = Date.now();
    const record = this.rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      this.rateLimitStore.set(key, { count: 1, resetTime: now + this.config.rateLimit.windowMs });
      return true;
    }

    record.count++;
    return record.count <= this.config.rateLimit.maxRequests;
  }

  private getCircuitBreakerState(target: string): CircuitBreakerState {
    if (!this.circuitBreakerStates.has(target)) {
      this.circuitBreakerStates.set(target, new CircuitBreakerState(this.config.circuitBreaker));
    }
    return this.circuitBreakerStates.get(target)!;
  }

  private async forwardRequest(req: NextRequest, target: string): Promise<NextResponse> {
    const url = new URL(req.url);
    url.hostname = target;

    const response = await fetch(url.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" ? await req.text() : undefined,
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }
}

class CircuitBreakerState {
  private state: "closed" | "open" | "half-open" = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  get isOpen(): boolean {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.state = "half-open";
        this.successCount = 0;
      }
    }
    return this.state === "open";
  }

  recordSuccess(): void {
    this.failureCount = 0;
    if (this.state === "half-open") {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = "closed";
      }
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = "open";
    }
  }
}

export { ApiGateway, type GatewayConfig };
