import type { ReactNode } from "react";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";

const POINTS = [
  "Zelf kiezen hoe snel je uitbetaald wordt",
  "Modelovereenkomst en Wet DBA-bewaking inbegrepen",
  "Volledig lokaal gehost — jouw data blijft van jou",
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  image,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /** optional photo for the left brand panel (path under /public); falls back
   *  to the plain dark panel if the file is missing */
  image?: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      {/* Brand panel */}
      {image ? (
        <div className="relative hidden overflow-hidden bg-ink lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            decoding="async"
          />
        </div>
      ) : (
        <div className="hero-ink relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
          <Link href="/" className="relative z-10 flex items-center gap-2.5">
            <LogoGlyph size={30} tone="light" />
            <span className="font-display text-lg font-bold">ZekerFlex</span>
          </Link>

          <div className="relative z-10">
            <h2 className="max-w-sm text-balance font-display text-3xl font-bold leading-tight">
              Zeker van je werk, zeker van je mensen.
            </h2>
            <ul className="mt-8 space-y-3">
              {POINTS.map((p) => (
                <li key={p} className="flex items-center gap-3 text-sm text-white/70">
                  <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-[rgba(79,224,160,0.16)] text-brand-mint">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 font-mono text-xs text-white/40">
            © {new Date().getFullYear()} ZekerFlex B.V.
          </p>
        </div>
      )}

      {/* Form panel */}
      <div className="flex flex-col justify-center bg-paper px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoGlyph size={28} />
            <span className="font-display text-lg font-bold">ZekerFlex</span>
          </Link>
          <hr className="mt-4 border-t border-hair" />

          <h1 className="mt-7 font-display text-2xl font-bold text-ink">{title}</h1>
          <p className="mt-1.5 text-sm text-neutralx-600">{subtitle}</p>

          <div className="mt-8">{children}</div>

          <div className="mt-6 text-sm text-neutralx-600">{footer}</div>
        </div>
      </div>
    </div>
  );
}
