import type { ReactNode } from "react";
import { SOCIALS } from "@/lib/seo";

const ICONS: Record<string, ReactNode> = {
  LinkedIn: (
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21H19v-5.4c0-1.3-.02-2.96-1.8-2.96-1.8 0-2.08 1.4-2.08 2.86V21H10V9Z" />
  ),
  Instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1.4" />
    </>
  ),
  X: (
    <path d="M17.53 3H20l-6.36 7.27L21 21h-5.9l-4.4-5.77L5.7 21H3.23l6.8-7.77L3 3h6.05l3.98 5.26L17.53 3Zm-1.03 16.2h1.37L7.6 4.72H6.13L16.5 19.2Z" />
  ),
  YouTube: (
    <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5A2.7 2.7 0 0 0 2.4 7.2C2 8.9 2 12 2 12s0 3.1.4 4.8a2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9C22 15.1 22 12 22 12s0-3.1-.4-4.8ZM10 15.2V8.8l5.2 3.2L10 15.2Z" />
  ),
  TikTok: (
    <path d="M16.5 3c.3 2.1 1.5 3.6 3.5 3.9V10c-1.4.1-2.6-.3-3.7-1v5.9c0 3.6-2.6 6.1-6 6.1-3.2 0-5.6-2.4-5.6-5.6 0-3 2.3-5.3 5.4-5.3.3 0 .6 0 .9.1v3.2a2.6 2.6 0 0 0-1-.2c-1.4 0-2.4 1-2.4 2.3 0 1.4 1 2.4 2.4 2.4 1.4 0 2.5-1.1 2.5-2.7V3h3.6Z" />
  ),
};

export function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {SOCIALS.map((s) => (
        <a
          key={s.name}
          href={s.href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={s.name}
          className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-brand-mint hover:bg-brand-mint hover:text-ink"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {ICONS[s.name]}
          </svg>
        </a>
      ))}
    </div>
  );
}
