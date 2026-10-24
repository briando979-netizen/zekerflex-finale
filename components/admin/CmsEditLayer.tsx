"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * In-place tekstbewerking op de live site, alleen voor ingelogde beheerders.
 * Deze laag wordt uitsluitend geladen voor een PLATFORM_ADMIN (zie
 * CmsEditMount + de marketing-layout), dus gewone bezoekers krijgen geen extra
 * code. Elementen met data-cms-key worden klikbaar in bewerkmodus; opslaan gaat
 * naar /api/admin/content (server dwingt de rol af).
 */

const ACCENT = "#4FE0A0";

export function CmsEditLayer() {
  const [editing, setEditing] = useState(false);
  const [present, setPresent] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  // laatst-bekende (opgeslagen) waarde per element, om wijzigingen te detecteren
  const baseline = useRef<WeakMap<HTMLElement, string>>(new WeakMap());

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const save = useCallback(
    async (el: HTMLElement) => {
      const key = el.dataset.cmsKey;
      if (!key) return;
      const value = (el.innerText ?? "").trim();
      const prev = baseline.current.get(el) ?? "";
      if (value === prev) return;
      try {
        const r = await fetch("/api/admin/content", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
        if (!r.ok) throw new Error(String(r.status));
        baseline.current.set(el, value);
        showToast("Opgeslagen ✓", true);
      } catch {
        el.innerText = prev; // terugdraaien bij fout
        showToast("Opslaan mislukt — probeer opnieuw", false);
      }
    },
    [showToast],
  );

  // Alleen tonen op pagina's die bewerkbare teksten bevatten.
  useEffect(() => {
    setPresent(document.querySelector("[data-cms-key]") !== null);
  }, []);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-cms-key]"));
    if (!editing) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (!el?.dataset?.cmsKey) return;
      if (e.key === "Enter" && !e.shiftKey && el.dataset.cmsMl !== "1") {
        e.preventDefault();
        el.blur();
      }
      if (e.key === "Escape") {
        el.innerText = baseline.current.get(el) ?? el.innerText;
        el.blur();
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el?.dataset?.cmsKey) void save(el);
    };
    // navigatie onderdrukken terwijl je een link-label bewerkt
    const onClickCapture = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest("a[data-cms-key]");
      if (a) {
        e.preventDefault();
        e.stopPropagation();
        (a as HTMLElement).focus();
      }
    };

    for (const el of nodes) {
      baseline.current.set(el, (el.innerText ?? "").trim());
      el.setAttribute("contenteditable", "true");
      el.spellcheck = false;
      el.style.outline = `2px dashed ${ACCENT}`;
      el.style.outlineOffset = "3px";
      el.style.borderRadius = "4px";
      el.style.cursor = "text";
      el.title = "Klik om te bewerken — Enter = opslaan, Esc = annuleren";
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusout", onFocusOut, true);
    document.addEventListener("click", onClickCapture, true);

    return () => {
      for (const el of nodes) {
        el.removeAttribute("contenteditable");
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.style.borderRadius = "";
        el.style.cursor = "";
        el.removeAttribute("title");
      }
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusout", onFocusOut, true);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [editing, save]);

  if (!present) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        style={{
          position: "fixed",
          left: 16,
          bottom: 16,
          zIndex: 2147483000,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderRadius: 999,
          border: "none",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          background: editing ? ACCENT : "#0E5C4A",
          color: editing ? "#0C0E12" : "#fff",
        }}
      >
        {editing ? "✓ Klaar met bewerken" : "✏️ Tekst bewerken"}
      </button>

      {editing && (
        <div
          style={{
            position: "fixed",
            left: 16,
            bottom: 64,
            zIndex: 2147483000,
            maxWidth: 260,
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.45,
            background: "rgba(12,14,18,0.92)",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          Bewerkmodus actief. Klik op een omlijnde tekst en typ. <b>Enter</b> = opslaan, <b>Esc</b> = annuleren.
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            zIndex: 2147483000,
            padding: "10px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: toast.ok ? "#0E5C4A" : "#b4232a",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
