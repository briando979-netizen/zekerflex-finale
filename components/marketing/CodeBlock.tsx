// Een donker codeblok voor de ontwikkelaarspagina's. Server-component, geen staat.
export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="mt-3">
      {label ? <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutralx-400">{label}</p> : null}
      <pre className="overflow-x-auto rounded-xl bg-[#0C0E12] p-4 text-[13px] leading-relaxed text-white/90">
        <code>{children}</code>
      </pre>
    </div>
  );
}
