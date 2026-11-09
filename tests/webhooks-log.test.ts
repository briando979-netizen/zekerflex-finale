import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { hostVan } from "@/lib/webhooks/dispatcher";

describe("hostVan (logt nooit het pad of de querystring van een klant-URL)", () => {
  it("geeft alleen de host", () => {
    expect(hostVan("https://partner.example/hooks/geheim-token?sleutel=abc")).toBe("partner.example");
    expect(hostVan("https://partner.example:8443/x")).toBe("partner.example:8443");
  });

  it("geeft 'onbekend' bij een ongeldige URL", () => {
    expect(hostVan("geen url")).toBe("onbekend");
  });
});
