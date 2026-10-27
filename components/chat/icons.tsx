// Schone line-iconen in WhatsApp-stijl (geen WhatsApp-merk-artwork). Erven de
// kleur via currentColor; grootte via de className (bijv. "h-5 w-5").
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const stroke = (p: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: "1.25em",
  height: "1.25em",
  "aria-hidden": true,
  ...p,
});
const fill = (p: P) => ({ viewBox: "0 0 24 24", fill: "currentColor", width: "1.25em", height: "1.25em", "aria-hidden": true, ...p });

export const IconBack = (p: P) => (
  <svg {...stroke(p)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...stroke(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

export const IconDots = (p: P) => (
  <svg {...fill(p)}>
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </svg>
);

export const IconPhone = (p: P) => (
  <svg {...fill(p)}>
    <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .5 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.2 2.2z" />
  </svg>
);

export const IconPaperclip = (p: P) => (
  <svg {...stroke(p)}>
    <path d="M21 11.5l-8.6 8.6a5 5 0 01-7-7l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.7 8.6a1.6 1.6 0 01-2.3-2.3l8-8" />
  </svg>
);

export const IconMic = (p: P) => (
  <svg {...stroke(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8" />
  </svg>
);

export const IconSend = (p: P) => (
  <svg {...fill(p)}>
    <path d="M2.5 21l19-9-19-9 4 9-4 9zM6.5 12l-.6-4.3L15 12l-9.1 4.3.6-4.3z" />
  </svg>
);

export const IconSmiley = (p: P) => (
  <svg {...stroke(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14a4.5 4.5 0 007 0" />
    <path d="M9 9.5h.01M15 9.5h.01" />
  </svg>
);

export const IconReply = (p: P) => (
  <svg {...stroke(p)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h11a5 5 0 015 5v3" />
  </svg>
);

export const IconCamera = (p: P) => (
  <svg {...stroke(p)}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
    <circle cx="12" cy="13" r="3.2" />
  </svg>
);
