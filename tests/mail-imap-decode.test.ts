import { describe, expect, it } from "vitest";
import { decodeMimeWords } from "@/lib/mail/imap";

describe("decodeMimeWords", () => {
  it("leaves plain ASCII subjects untouched", () => {
    expect(decodeMimeWords("Nieuwe shopbestelling")).toBe("Nieuwe shopbestelling");
  });

  it("decodes a base64 (B) encoded-word", () => {
    // "Café ☕" in UTF-8, base64-encoded
    const encoded = `=?UTF-8?B?${Buffer.from("Café ☕", "utf8").toString("base64")}?=`;
    expect(decodeMimeWords(encoded)).toBe("Café ☕");
  });

  it("decodes a quoted-printable (Q) encoded-word", () => {
    expect(decodeMimeWords("=?UTF-8?Q?Bijlage_=C3=A9=C3=A9n?=")).toBe("Bijlage één");
  });

  it("decodes multiple encoded-words in one header value", () => {
    const a = `=?UTF-8?Q?Deel_=C3=A9=C3=A9n?=`;
    const b = `=?UTF-8?Q?deel_twee?=`;
    expect(decodeMimeWords(`${a} ${b}`)).toBe("Deel één deel twee");
  });
});
