export function GoogleButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="flex w-full items-center justify-center gap-2.5 rounded-full border border-hairstrong bg-white px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-paper-soft"
    >
      <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.7 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.2 17.6 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.5z" />
        <path fill="#FBBC05" d="M10.4 28.3a14.6 14.6 0 0 1 0-8.6l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.6 2.6 10.9l7.8-6z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.3-4.6 2.1-8.8 2.1-6.4 0-11.7-3.7-13.6-8.8l-7.8 6C6.5 42.6 14.6 48 24 48z" />
      </svg>
      {label}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-neutralx-400">
      <span className="h-px flex-1 bg-hairstrong" />
      of
      <span className="h-px flex-1 bg-hairstrong" />
    </div>
  );
}
