import { describe, expect, it } from "vitest";
import { parseDotenv } from "@/lib/config/load-env";

describe("parseDotenv", () => {
  it("parses plain KEY=value pairs and skips comments / blanks", () => {
    const out = parseDotenv(
      ["# comment", "", "FOO=bar", "  BAZ = 42 ", "NOEQUALS", "9BAD=x"].join("\n"),
    );
    expect(out).toEqual({ FOO: "bar", BAZ: "42" });
  });

  it("strips matching quotes and unescapes \\n in double quotes", () => {
    const out = parseDotenv(
      ['A="line1\\nline2"', "B='keep $literal'", 'C="with \\"quote\\""'].join("\n"),
    );
    expect(out.A).toBe("line1\nline2");
    expect(out.B).toBe("keep $literal");
    expect(out.C).toBe('with "quote"');
  });

  it("keeps '=' that appear inside the value", () => {
    expect(parseDotenv("URL=postgres://u:p@h:5432/db?x=1").URL).toBe(
      "postgres://u:p@h:5432/db?x=1",
    );
  });
});
