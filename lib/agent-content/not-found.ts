import { SITE } from "@/lib/seo";

/** Markdown body for a 404 response — at least 20 chars, links to docs/sitemap/llms.txt per spec. */
export function notFoundMarkdown(pathname: string): string {
  return `# 404 — Pagina niet gevonden

\`${pathname}\` bestaat niet op ${SITE.name}.

- Terug naar de homepage: ${SITE.url}/
- Sitemap: ${SITE.url}/sitemap.xml
- API-documentatie: ${SITE.url}/developers
- OpenAPI-spec: ${SITE.url}/openapi.json
- Agent-richtlijnen: ${SITE.url}/llms.txt
`;
}

/** Minimal branded HTML body for a 404 response served outside the normal React render tree (the catch-all route). */
export function notFoundHtml(pathname: string): string {
  const safePath = pathname.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pagina niet gevonden · ${SITE.name}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#F4F5F1; font-family:Segoe UI,Helvetica,Arial,sans-serif; color:#17211C; }
  main { max-width:480px; padding:40px 24px; text-align:center; }
  h1 { font-size:22px; margin:0 0 8px; }
  p { color:#667469; line-height:1.6; }
  code { background:#E6E7E1; padding:2px 6px; border-radius:4px; }
  a { color:#0E5C4A; font-weight:600; text-decoration:none; }
</style>
</head>
<body>
<main>
<h1>Pagina niet gevonden</h1>
<p><code>${safePath}</code> bestaat niet op ${SITE.name}.</p>
<p><a href="/">Terug naar de homepage</a></p>
</main>
</body>
</html>
`;
}
