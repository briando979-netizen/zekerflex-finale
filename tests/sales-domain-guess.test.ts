import { afterEach, describe, expect, it, vi } from "vitest";
// de homepage wordt opgehaald via de beveiligde fetcher (SSRF-vrij); hier nagebootst
const fetchMock = vi.fn();
vi.mock("@/lib/website-check/fetch", () => ({ fetchPage: (url: string) => fetchMock(url) }));
import { guessAndVerifyDomain } from "@/lib/sales/discovery/domain-guess";

// KVKBase never gives a website, only a legal name. A guessed domain is only
// trusted once the page's own title/og:site_name actually resembles the
// company name — otherwise a wrong guess would crawl (and later e-mail) a
// completely unrelated business that just happens to own a similar-looking
// domain.

function htmlResponse(title: string) {
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: `<html><head><title>${title}</title></head></html>` };
}

afterEach(() => vi.clearAllMocks());

describe("guessAndVerifyDomain", () => {
  it("accepts a guessed domain whose title matches the company name", async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse("Bakkerij De Korenaar | Vers brood"));

    const result = await guessAndVerifyDomain("Bakkerij De Korenaar B.V.");

    expect(result).not.toBeNull();
    expect(result?.origin).toMatch(/^https:\/\/bakkerijkorenaar\.(nl|com)$/);
  });

  it("rejects a domain whose page belongs to an unrelated business", async () => {
    fetchMock.mockResolvedValue(htmlResponse("Totally Different Company"));

    const result = await guessAndVerifyDomain("Bakkerij De Korenaar B.V.");

    expect(result).toBeNull();
  });

  it("moves on when a candidate domain doesn't resolve at all", async () => {
    fetchMock.mockRejectedValue(new Error("ENOTFOUND"));

    const result = await guessAndVerifyDomain("Logistiek Centrum Hanzeland");

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns null for a name with nothing usable after stripping legal-form words", async () => {
    const result = await guessAndVerifyDomain("B.V.");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
