/// <reference types="react-dom/canary" />
import { preload } from "react-dom";

/**
 * Preloads self-hosted fonts (lib/fonts.ts) the way next/font did: through
 * ReactDOM.preload, which Next sends along as an early Link header. Server
 * component only; renders nothing.
 */
export function FontPreloads({ hrefs }: { hrefs: readonly string[] }) {
  for (const href of hrefs) preload(href, { as: "font", type: "font/woff2", crossOrigin: "" });
  return null;
}
