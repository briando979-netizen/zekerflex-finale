import { prisma } from "@/lib/prisma";
import { Panel, Pill } from "@/components/admin/kit";

export async function ErrorTrendPanel() {
  const rows = await prisma.keyValueStore.findMany({
    where: { key: { startsWith: "fout:" } },
    select: { value: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  interface ErrorGroup {
    message: string;
    level: string;
    count: number;
    lastAt: Date;
  }

  const grouped = new Map<string, ErrorGroup>();

  for (const row of rows) {
    try {
      const v = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      const key = `${v.level}:${v.message}`;
      if (!grouped.has(key)) {
        grouped.set(key, { message: v.message, level: v.level, count: v.count || 1, lastAt: new Date(v.lastAt) });
      }
    } catch {}
  }

  const sorted = Array.from(grouped.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime()).slice(0, 10);

  return (
    <Panel flush title="Foutmeldingen trend" subtitle={`${grouped.size} unieke fouten; ${sorted.reduce((s, e) => s + e.count, 0)} totaal`}>
      <ul>
        {sorted.map((e) => (
          <li key={`${e.level}:${e.message}`} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: "1px solid var(--a-border)" }}>
            <div className="min-w-0">
              <span className="block text-[0.8125rem]" style={{ color: "var(--a-text)" }}>{e.message.slice(0, 60)}</span>
            </div>
            <Pill tone={e.level === "error" ? "crit" : "warn"}>{e.count}×</Pill>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
