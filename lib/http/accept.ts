// ---------------------------------------------------------------------------
// Minimal Accept-header content negotiation for the text/markdown vs
// text/html decision (lib/agent-content). Not a full RFC 9110 parser — just
// enough to rank the two media types we actually switch on by q-value, with
// ties going to the header's declared order.
// ---------------------------------------------------------------------------

function qValue(part: string): number {
  const m = part.match(/;\s*q=([0-9.]+)/);
  if (!m || !m[1]) return 1;
  const q = Number.parseFloat(m[1]);
  return Number.isFinite(q) ? q : 1;
}

/** True when `Accept` ranks text/markdown at or above text/html (or lists markdown without listing html at all). */
export function prefersMarkdown(acceptHeader: string | null): boolean {
  if (!acceptHeader) return false;
  const parts = acceptHeader.split(",").map((p) => p.trim());
  const markdown = parts.find((p) => p.toLowerCase().startsWith("text/markdown"));
  if (!markdown) return false;
  const html = parts.find((p) => p.toLowerCase().startsWith("text/html"));
  if (!html) return true;
  return qValue(markdown) >= qValue(html);
}
