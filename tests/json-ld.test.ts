import { describe, expect, it } from "vitest";
import { ldJson } from "@/lib/seo/json-ld";

describe("ldJson (safe JSON-LD for <script>)", () => {
  it("neutralises a </script> breakout in attacker-controlled fields", () => {
    const out = ldJson({ title: "</script><script>alert(document.domain)</script>", company: "A&B <Co>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("&B");
    expect(out).toContain("\\u003c");
  });

  it("stays valid JSON that parses back to the original values", () => {
    const data = { title: "Kok <b> & \"friet\"</b>", n: 3, nested: { s: "</SCRIPT >" } };
    expect(JSON.parse(ldJson(data))).toEqual(data);
  });

  it("leaves safe content untouched apart from the three characters", () => {
    expect(ldJson({ a: "gewoon tekst 123" })).toBe('{"a":"gewoon tekst 123"}');
  });
});
