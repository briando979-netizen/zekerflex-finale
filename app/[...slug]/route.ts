import { prefersMarkdown } from "@/lib/http/accept";
import { notFoundHtml, notFoundMarkdown } from "@/lib/agent-content/not-found";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Catch-all for any path with no matching page or route anywhere in the app
// (file-system routing always prefers a more specific match first, so this
// never fires for a real page). Agents probing an unknown URL with
// `Accept: text/markdown` get a real Markdown 404 body instead of an HTML
// error page; everyone else still gets a plain branded HTML 404. Status is
// 404 either way — this never existed before, so a nonexistent path's
// Markdown response had no body to check at all.
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const accept = request.headers.get("accept");

  if (prefersMarkdown(accept)) {
    return new Response(notFoundMarkdown(pathname), {
      status: 404,
      headers: { "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept" },
    });
  }

  return new Response(notFoundHtml(pathname), {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", Vary: "Accept" },
  });
}
