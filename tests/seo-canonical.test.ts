import { describe, expect, it } from "vitest";
import { canonical } from "@/lib/seo";

// canonical() previously returned just { openGraph: { url } } — since Next.js
// metadata merging REPLACES a parent segment's `openGraph` object wholesale
// the moment a child declares its own `openGraph` key (it doesn't deep-merge
// nested objects), every one of the 13 pages spreading `...canonical(path)`
// was silently clobbering the root layout's og:type/og:image/og:site_name/
// og:locale down to just a bare url. This guards against that regressing.
describe("canonical", () => {
  it("returns a canonical alternate for the given path", () => {
    expect(canonical("/prijzen").alternates.canonical).toBe("/prijzen");
  });

  it("returns a full OpenGraph block, not just a url", () => {
    const { openGraph } = canonical("/prijzen");
    expect(openGraph).toMatchObject({
      type: "website",
      siteName: "ZekerFlex",
      locale: "nl_NL",
    });
    expect(openGraph.url).toContain("/prijzen");
    expect(Array.isArray(openGraph.images)).toBe(true);
    expect((openGraph.images as unknown[]).length).toBeGreaterThan(0);
  });

  it("includes a page-specific title/description when given one", () => {
    const { openGraph } = canonical("/", { title: "Custom title", description: "Custom description" });
    expect(openGraph.title).toBe("Custom title");
    expect(openGraph.description).toBe("Custom description");
  });

  it("omits title/description when none is given, rather than inventing one", () => {
    const { openGraph } = canonical("/prijzen");
    expect(openGraph.title).toBeUndefined();
    expect(openGraph.description).toBeUndefined();
  });
});
