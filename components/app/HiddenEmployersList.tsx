"use client";

import { useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";

const KEY = "zf-hidden-employers";

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

export function HiddenEmployersList() {
  const t = useFT().los.verborgen;
  const [list, setList] = useState<string[] | null>(null);

  useEffect(() => {
    setList(read());
  }, []);

  function unhide(name: string) {
    const next = read().filter((n) => n !== name);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setList(next);
  }

  if (list === null) return <p className="text-sm text-neutralx-400">{t.laden}</p>;

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-hair bg-white p-6 text-center text-sm text-neutralx-500 shadow-card">
        {t.leeg}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-hair bg-white shadow-card">
      {list.map((name) => (
        <div
          key={name}
          className="flex items-center justify-between gap-3 border-b border-hair px-4 py-3.5 text-sm last:border-b-0"
        >
          <span className="font-medium text-ink">{name}</span>
          <button
            type="button"
            onClick={() => unhide(name)}
            className="rounded-full border border-hairstrong px-3 py-1 text-xs font-semibold text-neutralx-600 hover:border-brand-400 hover:text-brand-700"
          >
            {t.toon}
          </button>
        </div>
      ))}
    </div>
  );
}
