import Link from "next/link";
import type { DbaItem } from "@/lib/kennis/dba";

/** Accordion for Wet DBA Q&A: a lead answer plus optional "Label: uitleg" points. */
export function DbaAccordion({ items }: { items: DbaItem[] }) {
  return (
    <div className="divide-y divide-hair border-y border-hair">
      {items.map((it) => (
        <details key={it.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-ink">
            {it.q}
            <span className="text-neutralx-400 transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-3 max-w-2xl">
            <p className="text-[0.975rem] leading-relaxed text-neutralx-600">{it.a}</p>
            {it.points && it.points.length > 0 && (
              <ul className="mt-3 space-y-2">
                {it.points.map((pt) => {
                  const [label, ...rest] = pt.split(/:\s(.+)/s);
                  const body = rest.join("");
                  return (
                    <li key={pt} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-neutralx-600">
                      <span className="mt-0.5 flex-shrink-0 text-brand-mint">→</span>
                      <span>
                        {body ? (
                          <>
                            <strong className="font-semibold text-ink">{label}:</strong> {body}
                          </>
                        ) : (
                          pt
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {it.link && (
              <Link
                href={it.link.href}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
              >
                {it.link.label}
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
