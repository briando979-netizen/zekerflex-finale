"use client";

import type { RecentThread } from "@/lib/messaging/recent";

const initials = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "nu";
  if (min < 60) return `${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} u`;
  return `${Math.round(hr / 24)} d`;
}

export function RecentMessagesPanel({ threads, allHref }: { threads: RecentThread[]; allHref: string }) {
  const open = (t: RecentThread) =>
    window.dispatchEvent(new CustomEvent("zf:chat", { detail: { threadId: t.id } }));

  return (
    <ul className="divide-y divide-hair">
      {threads.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => open(t)}
            className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-paper-soft"
          >
            <span
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
              style={{ background: t.kind === "support" ? "#0C0E12" : "#0E5C4A" }}
            >
              {t.kind === "support" ? "ZF" : initials(t.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">{t.name}</span>
                <span className="flex-shrink-0 text-[10px] text-neutralx-400">{timeAgo(t.at)}</span>
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-neutralx-500">{t.preview}</span>
                {t.unread > 0 && (
                  <span className="grid h-4 min-w-4 flex-shrink-0 place-items-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">
                    {t.unread}
                  </span>
                )}
              </span>
            </span>
          </button>
        </li>
      ))}
      <li>
        <a href={allHref} className="block px-5 py-2.5 text-center text-xs font-medium text-brand-600 hover:underline">
          Alle berichten
        </a>
      </li>
    </ul>
  );
}
