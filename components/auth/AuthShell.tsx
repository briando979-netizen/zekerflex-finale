import type { ReactNode } from "react";
import Link from "next/link";
import { LogoGlyph } from "@/components/brand/Logo";
import { AuthLanguage } from "@/components/auth/AuthLanguage";
import { AUTH_DICTS } from "@/lib/i18n/auth";
import type { Locale } from "@/lib/i18n/config";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  image,
  locale,
  mobile,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  /** optional photo for the left brand panel (path under /public); falls back
   *  to the plain dark panel if the file is missing */
  image?: string;
  /** shows the language picker and translates the side panel (sign-up / log-in / confirm) */
  locale?: Locale;
  /**
   * Mobiele weergave (kleine schermen en de app): donkere verloop-kop met logo en titel,
   * de velden in een wit afgerond paneel. Vanaf `lg` blijft de gewone weergave staan.
   */
  mobile?: { title: string; subtitle: string; back: string; backHref: string };
}) {
  const a = AUTH_DICTS[locale ?? "nl"];
  const POINTS = a.shell.points;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
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
              {a.shell.tagline}
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
            © {new Date().getFullYear()} Zekerflex, Inc.
          </p>
        </div>
      )}

      {/* Form panel */}
      <div
        className={
          mobile
            ? "flex min-h-[100dvh] flex-col bg-[linear-gradient(165deg,#0B3B3A_0%,#0E5C4A_55%,#0C0E12_100%)] lg:min-h-0 lg:justify-center lg:bg-none lg:bg-paper lg:px-12 lg:py-12"
            : "flex flex-col justify-center bg-paper px-6 py-12 sm:px-12"
        }
      >
        {mobile && (
          <div className="px-6 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] text-center text-white lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={mobile.backHref}
                aria-label={mobile.back}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              {locale && (
                <span className="rounded-full bg-white/90 backdrop-blur">
                  <AuthLanguage locale={locale} label={a.lang} />
                </span>
              )}
            </div>
            <div className="mt-2 flex justify-center">
              <LogoGlyph size={56} tone="light" />
            </div>
            <h1 className="mt-5 font-display text-3xl font-bold">{mobile.title}</h1>
            <p className="mt-1.5 text-sm text-white/75">{mobile.subtitle}</p>
          </div>
        )}
        <div
          className={
            mobile
              ? "mt-7 flex-1 rounded-t-[28px] bg-paper px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-8 lg:mt-0 lg:flex-none lg:rounded-none lg:bg-transparent lg:p-0"
              : ""
          }
        >
          <div className="mx-auto w-full max-w-sm">
            <div className={mobile ? "hidden lg:block" : ""}>
              <div className="flex items-center justify-between gap-3">
                <Link href="/" className="flex items-center gap-2.5">
                  <LogoGlyph size={28} />
                  <span className="font-display text-lg font-bold">ZekerFlex</span>
                </Link>
                {locale && <AuthLanguage locale={locale} label={a.lang} />}
              </div>
              <hr className="mt-4 border-t border-hair" />

              <h1 className="mt-7 font-display text-2xl font-bold text-ink">{title}</h1>
              <p className="mt-1.5 text-sm text-neutralx-600">{subtitle}</p>
            </div>

            <div className={mobile ? "lg:mt-8" : "mt-8"}>{children}</div>

            <div className="mt-6 text-sm text-neutralx-600">{footer}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
