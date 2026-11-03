// Small, dependency-free helpers the rekentools use in the browser too (kept
// out of uitkomst.ts so zod doesn't end up in the page bundle).

/** Sign-up for a company with the address (and name) from the form already filled in (app/register/page.tsx prefill). */
export function registerUrl(email: string, company?: string, base = ""): string {
  const q = new URLSearchParams({ type: "bedrijf", email: email.trim() });
  const c = company?.trim();
  if (c) q.set("company", c.slice(0, 160));
  return `${base}/register?${q.toString()}`;
}
