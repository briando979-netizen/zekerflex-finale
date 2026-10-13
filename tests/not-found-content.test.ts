import { describe, expect, it } from "vitest";
import { notFoundMarkdown, notFoundHtml } from "@/lib/agent-content/not-found";

describe("notFoundMarkdown", () => {
  it("is at least 20 characters and links to the sitemap and llms.txt", () => {
    const body = notFoundMarkdown("/__ora-404-probe-k9hs4zkk");
    expect(body.length).toBeGreaterThanOrEqual(20);
    expect(body).toContain("/sitemap.xml");
    expect(body).toContain("/llms.txt");
    expect(body).toContain("/__ora-404-probe-k9hs4zkk");
  });
});

describe("notFoundHtml", () => {
  it("escapes the requested path to avoid reflecting raw markup", () => {
    const body = notFoundHtml("/<script>alert(1)</script>");
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;");
  });

  it("is a full HTML document", () => {
    const body = notFoundHtml("/foo");
    expect(body).toMatch(/^<!doctype html>/i);
    expect(body).toContain("<title>");
  });
});
