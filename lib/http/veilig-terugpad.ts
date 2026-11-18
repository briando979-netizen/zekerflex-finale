// Een veilig, eigen terug-adres uit een querystring (?naar=, ?callbackUrl=, …).
// Laat alleen een pad op de eigen site toe en nooit een open redirect: een absolute URL
// (https://evil.example) of een protocol-relatief adres (//evil.example) negeert anders de
// basis en stuurt de bezoeker naar een vreemde host. Backslashes houden we er ook uit, want
// sommige browsers lezen "/\evil" als "//evil". Zelfde regel als safeCallback/safePath in de login.

/** Alleen een eigen, relatief pad (begint met één "/"); anders de standaard (default "/"). */
export function veiligTerugpad(raw: string | null | undefined, standaard = "/"): string {
  if (!raw) return standaard;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") && !raw.includes("\\")) {
    return raw;
  }
  return standaard;
}
