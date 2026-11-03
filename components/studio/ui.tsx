import Link from "next/link";
import type { ReactNode, SVGProps } from "react";

// ---------------------------------------------------------------------------
// De bouwstenen van de Websitestudio: rustig grijs vlak, witte kaarten met een
// haarlijn, één donkere hoofdknop per scherm (zoals de beheeromgevingen van
// webshopplatforms). Server-veilig: geen hooks.
// ---------------------------------------------------------------------------

export const btn = {
  primary: "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1a1a1a] px-3.5 py-2 text-sm font-semibold text-white shadow-[inset_0_-1px_0_rgba(255,255,255,.15),0_1px_2px_rgba(0,0,0,.2)] transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#d4d4d4] bg-white px-3.5 py-2 text-sm font-semibold text-[#303030] shadow-[0_1px_0_rgba(0,0,0,.05)] transition hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-50",
  quiet: "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-[#303030] hover:bg-black/5",
  danger: "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#f1c4c4] bg-white px-3.5 py-2 text-sm font-semibold text-[#b42318] hover:bg-[#fff5f5]",
};

export const input =
  "w-full rounded-xl border border-[#c9c9c9] bg-white px-3 py-2 text-sm text-[#1a1a1a] shadow-[inset_0_1px_0_rgba(0,0,0,.03)] placeholder:text-[#a3a3a3] focus:border-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-black/10";

export function Card({ title, actions, children, className = "", pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-2xl border border-[#e3e3e3] bg-white shadow-[0_1px_0_rgba(0,0,0,.05),0_1px_3px_rgba(0,0,0,.04)] ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4">
          {title && <h2 className="text-sm font-semibold text-[#1a1a1a]">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function PageHead({ title, back, sub, actions }: { title: ReactNode; back?: { href: string; label: string }; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      {back && (
        <Link href={back.href} aria-label={back.label} className="grid h-8 w-8 place-items-center rounded-lg text-[#303030] hover:bg-black/5">
          <IArrowLeft />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-bold tracking-tight text-[#1a1a1a]">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-[#616161]">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONE = {
  ok: "bg-[#cdfed4] text-[#014b1a]",
  info: "bg-[#e0f0ff] text-[#00366d]",
  warn: "bg-[#ffeb78] text-[#4f4700]",
  attn: "bg-[#ffd6a4] text-[#5e2e00]",
  crit: "bg-[#fed1d7] text-[#8e0b21]",
  neutral: "bg-[#ebebeb] text-[#303030]",
} as const;

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{children}</span>;
}

export function Empty({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#f1f1f1] text-[#616161] [&>svg]:h-7 [&>svg]:w-7">{icon}</div>
      <p className="text-base font-semibold text-[#1a1a1a]">{title}</p>
      <p className="mt-1 max-w-md text-sm text-[#616161]">{text}</p>
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-[#616161]">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold tracking-tight text-[#1a1a1a]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[#707070]">{hint}</p>}
    </div>
  );
}

// ---- iconen (één lijnstijl) -------------------------------------------------

type P = SVGProps<SVGSVGElement>;
const base = (p: P) => ({ width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });

export const IHome = (p: P) => (<svg {...base(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>);
export const ITag = (p: P) => (<svg {...base(p)}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>);
export const IReceipt = (p: P) => (<svg {...base(p)}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></svg>);
export const ILayout = (p: P) => (<svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M3 9h18M9 21V9" /></svg>);
export const IPalette = (p: P) => (<svg {...base(p)}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1 .1-2.2 1.3-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></svg>);
export const ISettings = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>);
export const IExternal = (p: P) => (<svg {...base(p)}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>);
export const IArrowLeft = (p: P) => (<svg {...base(p)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>);
export const IPlus = (p: P) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const ISearch = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IImage = (p: P) => (<svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>);
export const IChevron = (p: P) => (<svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>);
export const IMenu = (p: P) => (<svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h16" /></svg>);
export const ICheck = (p: P) => (<svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>);
export const IStore = (p: P) => (<svg {...base(p)}><path d="M3 9 4.5 4h15L21 9" /><path d="M4 9v11h16V9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M10 20v-5h4v5" /></svg>);
export const IEye = (p: P) => (<svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>);
export const IX = (p: P) => (<svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>);
