// ---------------------------------------------------------------------------
// KVKBase gives us a company's legal name, city and SBI codes — never a
// website. Without a URL the careers-crawler (careers.ts) has nothing to
// crawl, so a KVKBase-discovered lead would otherwise sit forever without a
// vacancy signal. This guesses a couple of likely domains from the company
// name and only trusts a hit once the page's own title / og:site_name
// actually resembles the company — a wrong guess would otherwise crawl (and
// later e-mail) a completely unrelated business.
//
// Deliberately narrow: one GET per candidate, same identifying UA as the
// careers-crawler, no link-following here. A confirmed hit is handed to the
// existing crawler (which does respect robots.txt) to do the real crawl.
// ---------------------------------------------------------------------------

const UA = "ZekerFlexBot/1.0 (+https://zekerflex.com/bot; zakelijke kennismaking)";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 500_000;
const MIN_SIMILARITY = 0.5;

// Matches legal-form abbreviations with or without dots/spacing between
// letters ("B.V.", "B.V", "BV", "V.O.F.") plus a few spelled-out forms —
// stripped BEFORE punctuation normalisation collapses "B.V." into "b v".
const LEGAL_FORM_PATTERN =
  /\b(?:b\.?\s?v\.?|n\.?\s?v\.?|v\.?\s?o\.?\s?f\.?|c\.?\s?v\.?|holding|groep|group|beheer|eenmanszaak|maatschap|co[öo]peratie(?:f)?|stichting)(?=[^a-z]|$)/gi;
const STOPWORDS = new Set(["de", "het", "en", "van", "der", "den", "te", "voor", "aan", "nederland"]);

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(companyName: string): string[] {
  return normalise(companyName.replace(LEGAL_FORM_PATTERN, " "))
    .split(" ")
    .filter(Boolean);
}

/** Up to two squashed-name candidates to try as "<candidate>.nl" / ".com". */
function slugCandidates(companyName: string): string[] {
  const all = words(companyName);
  if (all.length === 0) return [];
  const withoutStop = all.filter((w) => !STOPWORDS.has(w));

  const out = new Set<string>();
  const a = withoutStop.join("");
  if (a.length >= 3) out.add(a);
  const b = all.join("");
  if (b.length >= 3) out.add(b);
  return [...out].slice(0, 2);
}

function nameTokens(name: string): Set<string> {
  return new Set(words(name).filter((w) => w.length >= 3 && !STOPWORDS.has(w)));
}

/** Token-overlap ratio, 0..1 — crude but conservative for a yes/no gate. */
function similarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  return overlap / Math.max(ta.size, tb.size);
}

function extractSiteName(html: string): string | null {
  const og = html.match(/<meta\b[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (og?.[1]) return og[1];
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (title?.[1]) return title[1].replace(/\s+/g, " ").trim();
  return null;
}

async function fetchHomepage(origin: string): Promise<string | null> {
  try {
    const res = await fetch(origin, {
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!res.ok || !/text\/html|application\/xhtml/.test(ct)) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf.slice(0, MAX_BYTES)).toString("utf8");
  } catch {
    return null;
  }
}

export interface DomainGuessResult {
  origin: string;
  matchedName: string;
  similarity: number;
}

export async function guessAndVerifyDomain(companyName: string): Promise<DomainGuessResult | null> {
  const slugs = slugCandidates(companyName);
  for (const slug of slugs) {
    for (const tld of ["nl", "com"]) {
      const origin = `https://${slug}.${tld}`;
      const html = await fetchHomepage(origin);
      if (!html) continue;
      const siteName = extractSiteName(html);
      if (!siteName) continue;
      const score = similarity(companyName, siteName);
      if (score >= MIN_SIMILARITY) {
        return { origin, matchedName: siteName, similarity: score };
      }
    }
  }
  return null;
}
