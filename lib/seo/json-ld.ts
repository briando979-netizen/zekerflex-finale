// ---------------------------------------------------------------------------
// Safe serializer for JSON-LD injected into a <script type="application/ld+json">.
//
// JSON.stringify does NOT escape "<", ">" or "&", so any attacker-controlled
// string inside the data (a klus-titel, a bedrijfsnaam, ...) that contains
// "</script>" would close the script element and let the rest run as markup —
// stored XSS / markup injection on an otherwise public page. Escaping those
// three characters to their \uXXXX form keeps the JSON valid while making a
// "</script>" breakout impossible.
//
// Always use this instead of JSON.stringify for dangerouslySetInnerHTML.
// ---------------------------------------------------------------------------

const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
};

export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&]/g, (c) => ESCAPES[c]!);
}
