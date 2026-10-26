import { useEffect, useMemo, useState } from "react";
import type { Msg } from "./shared";

/** Zoeken binnen het open gesprek: filtert op tekst, springt tussen treffers. */
export function useMessageSearch(messages: Msg[]) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const q = query.trim().toLowerCase();

  const matches = useMemo(
    () => (q ? messages.filter((m) => !m.deleted && m.text && m.text.toLowerCase().includes(q)).map((m) => m.id) : []),
    [messages, q],
  );

  // Bij een nieuwe zoekopdracht: spring naar de laatste (meest recente) treffer.
  useEffect(() => {
    setIndex(matches.length ? matches.length - 1 : 0);
  }, [q, matches.length]);

  const pos = matches.length ? Math.min(index, matches.length - 1) : 0;
  const activeId = matches.length ? matches[pos] ?? null : null;

  return {
    open,
    query,
    matches,
    count: matches.length,
    position: matches.length ? pos + 1 : 0,
    activeId,
    setQuery,
    openSearch: () => setOpen(true),
    close: () => {
      setOpen(false);
      setQuery("");
    },
    next: () => setIndex((i) => (matches.length ? (i + 1) % matches.length : 0)),
    prev: () => setIndex((i) => (matches.length ? (i - 1 + matches.length) % matches.length : 0)),
  };
}
