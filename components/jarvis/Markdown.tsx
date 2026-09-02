"use client";

import { Fragment, type ReactNode } from "react";

// Tiny dependency-free Markdown renderer for Jarvis assistant messages:
// headings (##, ###), unordered / ordered lists, fenced code blocks,
// inline **bold** and `code`, paragraphs.

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(
        <code key={`${keyBase}-c${i}`} className="rounded bg-slate-200 px-1 text-[0.85em]">
          {m[3]}
        </code>,
      );
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let code: string[] | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={i}>{inline(it, `li${key}-${i}`)}</li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={key++} className="ml-5 list-decimal space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="ml-5 list-disc space-y-1">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw;
    if (line.trim().startsWith("```")) {
      if (code) {
        blocks.push(
          <pre
            key={key++}
            className="overflow-x-auto rounded bg-slate-900 p-3 text-[12px] text-slate-100"
          >
            {code.join("\n")}
          </pre>,
        );
        code = null;
      } else {
        flushList();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }

    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      flushList();
      const level = h[1]!.length;
      const cls =
        level === 2
          ? "mt-3 text-[15px] font-semibold text-slate-900"
          : "mt-2 text-[13px] font-semibold text-slate-800";
      blocks.push(
        <p key={key++} className={cls}>
          {inline(h[2]!, `h${key}`)}
        </p>,
      );
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ol || ul) {
      const ordered = Boolean(ol);
      const item = (ol ? ol[1] : ul![1])!;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(item);
      continue;
    }

    if (line.trim() === "") {
      flushList();
      continue;
    }

    flushList();
    blocks.push(
      <p key={key++} className="leading-relaxed">
        {inline(line, `p${key}`)}
      </p>,
    );
  }
  flushList();
  if (code) {
    blocks.push(
      <pre key={key++} className="overflow-x-auto rounded bg-slate-900 p-3 text-[12px] text-slate-100">
        {code.join("\n")}
      </pre>,
    );
  }

  return (
    <div className="space-y-1.5 text-[13px] text-slate-800">
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}
