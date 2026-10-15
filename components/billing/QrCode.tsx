import { qrEncode, qrSvgPath } from "@/lib/qr/encode";

const QUIET_ZONE = 4;

/** Scannable QR code as inline SVG — always dark on white, also in dark mode. */
export function QrCode({ value, size = 184, label }: { value: string; size?: number; label: string }) {
  const matrix = qrEncode(value);
  const n = matrix.length + QUIET_ZONE * 2;
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="rounded-lg"
    >
      <rect width={n} height={n} fill="#ffffff" />
      <path d={qrSvgPath(matrix, QUIET_ZONE)} fill="#0b0f0e" />
    </svg>
  );
}
