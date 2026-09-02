"use client";

/** Opens the chat dock and starts/continues a 1-on-1 thread with a user. */
export function ChatUserButton({
  toUserId,
  label = "Bericht",
  contextKey,
  subject,
  className = "btn-ghost px-3 py-1.5 text-xs",
}: {
  toUserId: string;
  label?: string;
  contextKey?: string;
  subject?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("zf:chat", { detail: { toUserId, contextKey, subject } }),
        )
      }
      className={className}
    >
      {label}
    </button>
  );
}
