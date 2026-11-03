import { describe, expect, it } from "vitest";
import { zelfdeHerkomst } from "@/lib/voorstel/herkomst";

const h = (kv: Record<string, string>) => new Headers(kv);
// zo komt een verzoek binnen achter Caddy: request.url is de interne host
const INTERN = "http://app:3000/api/voorstel/schwarzwald/account";

describe("zelfde herkomst achter de proxy", () => {
  it("accepteert een post vanaf het subdomein en vanaf zekerflex.com", () => {
    expect(zelfdeHerkomst(h({ origin: "https://schwarzwald.zekerflex.com", host: "schwarzwald.zekerflex.com" }), INTERN)).toBe(true);
    expect(zelfdeHerkomst(h({ origin: "https://zekerflex.com", "x-forwarded-host": "zekerflex.com", host: "app:3000" }), INTERN)).toBe(true);
  });

  it("weigert een post van een andere website", () => {
    expect(zelfdeHerkomst(h({ origin: "https://evil.example", host: "schwarzwald.zekerflex.com" }), INTERN)).toBe(false);
    expect(zelfdeHerkomst(h({ origin: "https://schwarzwald.zekerflex.com.evil.example", host: "schwarzwald.zekerflex.com" }), INTERN)).toBe(false);
    expect(zelfdeHerkomst(h({ origin: "null", host: "schwarzwald.zekerflex.com" }), INTERN)).toBe(false);
  });

  it("werkt lokaal zonder proxy en zonder Origin", () => {
    expect(zelfdeHerkomst(h({ origin: "http://localhost:3100", host: "localhost:3100" }), "http://localhost:3100/api/x")).toBe(true);
    expect(zelfdeHerkomst(h({ host: "schwarzwald.zekerflex.com" }), INTERN)).toBe(true);
  });
});
