"use client";

/** Opens the chat dock and starts (or resumes) a thread with the shift's contact. */
export function MessageEmployerButton({
  shiftId,
  label = "Bericht de opdrachtgever",
  className = "btn-ghost w-full py-2 text-sm",
}: {
  shiftId: string;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("zf:chat", { detail: { shiftId } }))}
      className={className}
    >
      {label}
    </button>
  );
}

/** Opens the chat dock on the ZekerFlex Support thread. */
export function SupportChatButton({
  label = "Chat met ZekerFlex Support",
  className = "btn-ghost text-sm",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("zf:chat", { detail: { support: true } }))}
      className={className}
    >
      {label}
    </button>
  );
}
