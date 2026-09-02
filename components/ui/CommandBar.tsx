"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Me {
  authenticated: boolean;
  roles?: string[];
}
interface Cmd {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
  keywords?: string;
}

export function CommandBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [me, setMe] = useState<Me | null>(null);
  const meRequested = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Defer the identity lookup until the bar is first summoned — keeps it off the
  // critical path for every page load.
  useEffect(() => {
    if (!open || meRequested.current) return;
    meRequested.current = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ authenticated: false }));
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const roles = me?.roles ?? [];
  const isAdmin = roles.includes("PLATFORM_ADMIN");
  const isEmployer = roles.some((r) => ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(r));
  const isFreelancer = roles.includes("FREELANCER");

  const commands = useMemo<Cmd[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const list: Cmd[] = [];

    if (isFreelancer) {
      list.push(
        { id: "d", label: "Mijn overzicht", group: "Freelancer", run: go("/dashboard") },
        { id: "d-k", label: "Klussen bekijken", group: "Freelancer", run: go("/dashboard/klussen"), keywords: "markt diensten werk" },
        { id: "d-a", label: "Beschikbaarheid & tarief", group: "Freelancer", run: go("/dashboard/beschikbaarheid"), keywords: "agenda rate alerts" },
        { id: "d-di", label: "Mijn diensten", group: "Freelancer", run: go("/dashboard/diensten") },
        { id: "d-u", label: "Uitbetalingen", group: "Freelancer", run: go("/dashboard/uitbetalingen"), keywords: "geld facturen" },
        { id: "d-v", label: "Verificatie", group: "Freelancer", run: go("/dashboard/verificatie"), keywords: "kvk id kyc" },
      );
    }
    if (isEmployer) {
      list.push(
        { id: "w", label: "Werkgever-overzicht", group: "Werkgever", run: go("/werkgever") },
        { id: "w-n", label: "Dienst uitzetten", group: "Werkgever", run: go("/werkgever/diensten/nieuw"), keywords: "klus plaatsen shift nieuw" },
        { id: "w-u", label: "Uren goedkeuren", group: "Werkgever", run: go("/werkgever/uren") },
        { id: "w-f", label: "Facturen", group: "Werkgever", run: go("/werkgever/facturen") },
        { id: "w-c", label: "Compliance", group: "Werkgever", run: go("/werkgever/compliance"), keywords: "dba wet" },
      );
    }
    if (isAdmin) {
      list.push(
        { id: "a", label: "Controlecentrum", group: "Admin", run: go("/admin") },
        { id: "a-an", label: "Verkeer & analytics", group: "Admin", run: go("/admin/analytics") },
        { id: "a-d", label: "Disputen", group: "Admin", run: go("/admin/disputes") },
        { id: "a-m", label: "Mailbox", group: "Admin", run: go("/admin/mail") },
        { id: "a-s", label: "Studio (beeld)", group: "Admin", run: go("/admin/studio") },
        { id: "a-sys", label: "Systeemstatus", group: "Admin", run: go("/admin/systeem") },
        { id: "a-au", label: "Auditspoor", group: "Admin", run: go("/admin/audit") },
      );
    }

    list.push(
      { id: "site", label: "Naar de website", group: "Algemeen", run: go("/") },
      { id: "prijzen", label: "Prijzen", group: "Algemeen", run: go("/prijzen") },
      { id: "status", label: "Systeemstatus (publiek)", group: "Algemeen", run: go("/status") },
    );

    if (isAdmin) {
      const jarvis: Cmd = {
        id: "jarvis",
        label: q.trim() && !"jarvis".includes(q.toLowerCase()) ? `Vraag Jarvis: "${q.trim()}"` : "Vraag Jarvis",
        hint: "Enter",
        group: "Assistent",
        keywords: "ai chat vraag",
        run: () => {
          setOpen(false);
          router.push(q.trim() ? `/admin/jarvis?q=${encodeURIComponent(q.trim())}` : "/admin/jarvis");
        },
      };
      list.unshift(jarvis);
    }
    return list;
  }, [router, isAdmin, isEmployer, isFreelancer, q]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(s) || c.group.toLowerCase().includes(s) || (c.keywords ?? "").includes(s),
    );
  }, [commands, q]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!open) return null;

  const groups = [...new Set(filtered.map((c) => c.group))];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Commandobalk"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl2 border border-hairstrong bg-white shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-hair px-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="text-neutralx-400">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                filtered[active]?.run();
              }
            }}
            placeholder="Zoek een pagina of actie…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-neutralx-400"
          />
          <kbd className="rounded border border-hairstrong px-1.5 py-0.5 font-mono text-[10px] text-neutralx-400">esc</kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutralx-400">Geen resultaten.</p>
          ) : (
            groups.map((g) => (
              <div key={g}>
                <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wide text-neutralx-400">{g}</p>
                {filtered
                  .filter((c) => c.group === g)
                  .map((c) => {
                    const idx = filtered.indexOf(c);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onMouseEnter={() => setActive(idx)}
                        onClick={c.run}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                          idx === active ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-paper-soft"
                        }`}
                      >
                        {c.label}
                        {c.hint && <span className="font-mono text-[10px] text-neutralx-400">{c.hint}</span>}
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
