"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("./ChatWidget").then((m) => m.ChatWidget), {
  ssr: false,
});

/**
 * Keeps the chat bundle off the initial page load. We only pull it in once the
 * browser is idle (or after a short fallback), so first paint isn't blocked by
 * the assistant's client code.
 */
export function ChatWidgetLazy() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(() => setReady(true), { timeout: 3000 });
    } else {
      timer = setTimeout(() => setReady(true), 1800);
    }
    const wake = () => setReady(true);
    window.addEventListener("pointerdown", wake, { once: true });
    window.addEventListener("keydown", wake, { once: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  if (!ready) return null;
  return <ChatWidget />;
}
