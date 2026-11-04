import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { firstUnreadId, type Msg } from "./shared";

/** Afstand tot de onderkant waarbinnen je "onderaan" bent (dan volgen nieuwe berichten vanzelf). */
const NEAR_BOTTOM_PX = 96;

/**
 * Scrollgedrag van een gesprek, zoals WhatsApp:
 * - bij openen: naar het eerste ongelezen bericht (met de streep), anders onderaan;
 * - ben je onderaan, dan blijf je onderaan (ook als een foto later laadt);
 * - lees je terug, dan blijf je staan en telt de knop "↓" de nieuwe berichten.
 *
 * Elke poll maakt een nieuwe berichtenlijst; daarom kijken we naar het laatste
 * bericht-id, niet naar de lijst zelf (anders sprong het gesprek elke 3 s naar beneden).
 */
export function useStickyScroll({
  scrollRef,
  contentRef,
  messages,
  threadId,
  myUserId,
  unreadAtOpen,
  typing,
  idPrefix,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  messages: Msg[];
  threadId: string | null;
  myUserId: string | null | undefined;
  /** ongelezen berichten op het moment dat het gesprek openging */
  unreadAtOpen: number;
  typing: boolean;
  /** voorvoegsel van de element-id's van berichten ("ip-msg-" / "cd-msg-") */
  idPrefix: string;
}) {
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [dividerId, setDividerId] = useState<string | null>(null);
  const positionedFor = useRef<string | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const seenThread = useRef<string | null>(null);

  const setBottom = (v: boolean) => {
    atBottomRef.current = v;
    setAtBottom(v);
    if (v) setNewCount(0);
  };

  const toBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    atBottomRef.current = true;
    setAtBottom(true);
    setNewCount(0);
  }, [scrollRef]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (near !== atBottomRef.current) setBottom(near);
  }, [scrollRef]);

  // eerste lading van een gesprek + nieuwe berichten daarna
  useLayoutEffect(() => {
    if (seenThread.current !== threadId) {
      // ander gesprek: alles opnieuw. De berichten van deze render horen nog bij het vorige gesprek
      // (de pagina leegt ze pas daarna), dus pas bij de volgende lading positioneren.
      seenThread.current = threadId;
      positionedFor.current = null;
      lastIdRef.current = null;
      setDividerId(null);
      setBottom(true);
      return;
    }
    const el = scrollRef.current;
    if (!el || !threadId || messages.length === 0) return;
    const last = messages[messages.length - 1]!;

    if (positionedFor.current !== threadId) {
      positionedFor.current = threadId;
      lastIdRef.current = last.id;
      const firstUnread = firstUnreadId(messages, unreadAtOpen, myUserId);
      setDividerId(firstUnread);
      const mark = firstUnread ? document.getElementById(`${idPrefix}${firstUnread}`) : null;
      if (mark) {
        // het eerste ongelezen bericht bovenaan, met ruimte voor de streep erboven
        el.scrollTop = Math.max(0, el.scrollTop + mark.getBoundingClientRect().top - el.getBoundingClientRect().top - 52);
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
        atBottomRef.current = near;
        setAtBottom(near);
      } else {
        el.scrollTop = el.scrollHeight;
        atBottomRef.current = true;
        setAtBottom(true);
      }
      return;
    }

    if (last.id === lastIdRef.current) return;
    const prevIdx = messages.findIndex((m) => m.id === lastIdRef.current);
    const added = prevIdx >= 0 ? messages.slice(prevIdx + 1) : [last];
    lastIdRef.current = last.id;
    const mineNow = added.some((m) => m.from === myUserId);
    if (atBottomRef.current || mineNow) {
      toBottom(true);
    } else {
      const incoming = added.filter((m) => m.from !== myUserId && m.kind !== "system").length;
      if (incoming) setNewCount((n) => n + incoming);
    }
  }, [messages, threadId, myUserId, unreadAtOpen, scrollRef, toBottom, idPrefix]);

  // "aan het typen" onderaan: alleen meeschuiven als je al onderaan was
  useEffect(() => {
    if (typing && atBottomRef.current) toBottom(true);
  }, [typing, toBottom]);

  // een foto of kaart die later laadt maakt de inhoud hoger: wie onderaan was, blijft onderaan
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [contentRef, scrollRef, threadId]);

  return { atBottom, newCount, dividerId, onScroll, toBottom };
}
