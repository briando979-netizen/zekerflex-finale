import { describe, expect, it } from "vitest";
import { markdownFor } from "@/lib/agent-content/markdown-pages";

describe("markdownFor", () => {
  it("returns a non-empty Markdown rendering for the homepage", () => {
    const md = markdownFor("/");
    expect(md).not.toBeNull();
    expect(md!.length).toBeGreaterThan(20);
    expect(md).toMatch(/^# ZekerFlex/);
  });

  it("returns null for a path with no Markdown rendering", () => {
    expect(markdownFor("/privacy")).toBeNull();
    expect(markdownFor("/some-random-path")).toBeNull();
  });
});
