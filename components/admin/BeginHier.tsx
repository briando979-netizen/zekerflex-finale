"use client";

import { Panel, Pill } from "@/components/admin/kit";
import { datumNl, kiesBeginHier, type EerstTodo } from "@/lib/admin/te-doen-eerst";

// Beheer -> Te doen, bovenaan: "Begin hier". Hooguit vijf openstaande taken die iets blokkeren, met een zin waarom ze eerst
// moeten en de bestaande stappen inklapbaar. Een afgevinkte taak verdwijnt vanzelf (de lijst komt al afgevinkt binnen).

export function BeginHier({ todos }: { todos: EerstTodo[] }) {
  const items = kiesBeginHier(todos, new Date());
  if (items.length === 0) return null;

  return (
    <Panel
      title="Begin hier"
      subtitle="Deze taken kunnen niet wachten. Doe ze in deze volgorde; vink je ze af, dan verdwijnen ze hier vanzelf."
      className="border-l-4 border-amber-500"
    >
      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={it.todo.id} className="rounded-lg p-3" style={{ background: "var(--a-elev)" }}>
            <details>
              <summary className="cursor-pointer list-none">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="num text-xs font-semibold" style={{ color: "var(--a-mute)" }}>{i + 1}.</span>
                  <span className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{it.todo.title}</span>
                  <Pill tone={it.verlopen ? "crit" : "warn"}>{it.verlopen ? "verlopen" : it.reden}</Pill>
                  {it.uiterlijk && !it.verlopen ? <span className="text-xs" style={{ color: "var(--a-mute)" }}>uiterlijk {datumNl(it.uiterlijk)}</span> : null}
                </span>
                <span className="mt-1 block text-xs" style={{ color: "var(--a-mute)" }}>{it.zin}</span>
                <span className="mt-1 block text-xs font-medium" style={{ color: "var(--a-text)" }}>Toon de stappen</span>
              </summary>
              {it.todo.how.length > 0 ? (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm" style={{ color: "var(--a-text)" }}>
                  {it.todo.how.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm" style={{ color: "var(--a-mute)" }}>{it.todo.why}</p>
              )}
            </details>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
