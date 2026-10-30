import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /admin/zekerflex-ai/sandbox-frame — the shell document for the studio's
// sandbox. It runs the author's own HTML/CSS/JS, so middleware serves it under
// a loose, ISOLATED CSP (see lib/security/csp.ts): script-src allows inline +
// eval here and ONLY here. The studio embeds it with the `sandbox` attribute
// and no `allow-same-origin`, so it lives on an opaque origin and cannot read
// cookies, storage or the app's DOM. The studio postMessages the code in; this
// shell writes it into the document. Admin-only (withAdminAccess).
// ---------------------------------------------------------------------------

const SHELL = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ZekerFlex sandbox</title>
  <style>html,body{margin:0;height:100%;background:#fff;font-family:system-ui,sans-serif}</style>
</head>
<body>
  <script>
    (function () {
      function render(html) {
        try {
          document.open();
          document.write(html);
          document.close();
        } catch (e) {
          document.body.textContent = "Kon de sandbox niet renderen: " + e;
        }
      }
      window.addEventListener("message", function (e) {
        var d = e.data;
        if (d && d.__zfSandbox && typeof d.html === "string") render(d.html);
      });
      try {
        parent.postMessage({ __zfSandboxReady: true }, "*");
      } catch (e) {
        /* parent gone */
      }
    })();
  </script>
  <noscript>JavaScript is nodig voor de sandbox.</noscript>
</body>
</html>`;

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return new NextResponse(SHELL, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
});
