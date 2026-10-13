"use client";

import { useRouter } from "next/navigation";

// A plain <Link> always navigates forward, so Next.js scrolls the next page
// to the top — on an account sub-page that means "terug" never returns you to
// where you'd scrolled to on the settings list. router.back() replays the
// actual browser history entry instead, which restores scroll position.
export function BackLink({ fallbackHref, label }: { fallbackHref: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className="mb-4 flex items-center gap-1 text-sm font-medium text-neutralx-500 hover:text-brand-600"
    >
      <span aria-hidden>‹</span> {label}
    </button>
  );
}
