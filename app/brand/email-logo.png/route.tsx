import { ImageResponse } from "next/og";

// Edge runtime — @vercel/og's node build trips over Windows paths with a space.
export const runtime = "edge";

// A raster ZekerFlex mark (SVG isn't supported by most mail clients / Gravatar).
// This mirrors app/icon.svg / components/brand/Logo.tsx. Also handy to download
// and upload as the Gravatar for info@zekerflex.com.
export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="8" width="496" height="496" rx="116" fill="#0C0E12" />
          <g
            transform="matrix(1,0,-0.1228,1,31,0)"
            fill="none"
            stroke="#FAFAF8"
            strokeWidth="46"
            strokeLinecap="square"
            strokeLinejoin="miter"
          >
            <path d="M104 150 H250 L104 372 H262" />
            <path d="M300 372 V150 H424 M300 258 H396" />
          </g>
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
