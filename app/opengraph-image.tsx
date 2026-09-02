import { ImageResponse } from "next/og";

// Edge runtime: @vercel/og's node build trips over Windows paths that contain a
// space when it loads. The edge build doesn't, and this route needs no Node APIs.
export const runtime = "edge";

const SHORT = "Slim gematcht, zelf je uitbetaling kiezen, volledig Wet DBA-proof. 100% zelf gehost.";

export const alt = "ZekerFlex — zeker van je werk";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            Zeker van je werk.
          </div>
          <div style={{ fontSize: 30, color: "#C6E9DE", maxWidth: 900, lineHeight: 1.35 }}>
            {SHORT}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 22, color: "#9FD9C6" }}>
          zzp&apos;ers · flexwerkers · werkgevers
        </div>
      </div>
    ),
    { ...size },
  );
}
