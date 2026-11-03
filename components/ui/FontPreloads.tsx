/**
 * Preloads self-hosted fonts (lib/fonts.ts). React places a <link rel="preload">
 * in <head> wherever it is rendered, and Next sends it along early.
 */
export function FontPreloads({ hrefs }: { hrefs: readonly string[] }) {
  return (
    <>
      {hrefs.map((href) => (
        <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
      ))}
    </>
  );
}
