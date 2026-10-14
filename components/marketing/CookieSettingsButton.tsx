"use client";

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("zf:open-cookie-settings"))}
      className={className}
    >
      Cookie-instellingen
    </button>
  );
}
