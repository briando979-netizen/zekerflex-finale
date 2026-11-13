import type { AnchorHTMLAttributes } from "react";

// Een link naar de paskamer (/shop/paskamer) laadt de pagina altijd volledig opnieuw. Een <Link> doet dat niet: dan
// houdt de browser de CSP van het eerste document, en "Op mijn foto" (WebAssembly) wordt geblokkeerd als dat document
// niet uit /shop kwam (lib/security/csp.ts, 'wasm-unsafe-eval'). Zie AGENTS.md ("Een CSP hoort bij het document").
export function PaskamerLink({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- volledige paginalading nodig voor de CSP van de paskamer
    <a href={href} {...rest}>
      {children}
    </a>
  );
}