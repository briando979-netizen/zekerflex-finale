import { ImageResponse } from "next/og";

// Share image (opengraph) for a rekentool: same look as app/opengraph-image.tsx,
// with the tool's own question and an example from the tool itself.
export const DEELKAART_SIZE = { width: 1200, height: 630 };

export function deelkaart({ title, sub, example }: { title: string; sub: string; example: string }): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0E5C4A 0%, #083A2F 100%)",
          color: "#FCFCFA",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                background: "#0C0E12",
                color: "#4FE0A0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              ZF
            </div>
            <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>ZekerFlex</div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: "rgba(79,224,160,0.16)",
              color: "#4FE0A0",
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            Gratis rekentool
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>{title}</div>
          <div style={{ fontSize: 30, color: "#C6E9DE", maxWidth: 960, lineHeight: 1.35 }}>{sub}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, fontSize: 24 }}>
          <div
            style={{
              display: "flex",
              padding: "14px 24px",
              borderRadius: 18,
              background: "rgba(12,14,18,0.35)",
              color: "#FCFCFA",
            }}
          >
            {example}
          </div>
          <div style={{ display: "flex", flexShrink: 0, color: "#9FD9C6" }}>zekerflex.com/rekentools</div>
        </div>
      </div>
    ),
    { ...DEELKAART_SIZE },
  );
}
