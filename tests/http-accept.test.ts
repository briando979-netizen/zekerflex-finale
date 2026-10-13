import { describe, expect, it } from "vitest";
import { prefersMarkdown } from "@/lib/http/accept";

describe("prefersMarkdown", () => {
  it("is false for a null/missing Accept header", () => {
    expect(prefersMarkdown(null)).toBe(false);
  });

  it("is true when only text/markdown is listed", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
  });

  it("is false when only text/html is listed", () => {
    expect(prefersMarkdown("text/html")).toBe(false);
  });

  it("is false for a generic browser Accept header with no markdown", () => {
    expect(prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe(false);
  });

  it("prefers markdown when it has an equal or higher q-value than html", () => {
    expect(prefersMarkdown("text/markdown, text/html;q=0.8")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=1.0, text/html;q=1.0")).toBe(true);
  });

  it("prefers html when markdown has a lower q-value", () => {
    expect(prefersMarkdown("text/markdown;q=0.5, text/html;q=0.9")).toBe(false);
  });
});
