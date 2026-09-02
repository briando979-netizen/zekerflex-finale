import Link from "next/link";
import type { AuditCategory } from "@prisma/client";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Panel, EmptyState, StatusPill, dateTime } from "@/components/app/ui";

export const dynamic = "force-dynamic";

const SEV_TONE: Record<string, "ok" | "warn" | "crit" | "neutral"> = {
  info: "neutral",
  warning: "warn",
  critical: "crit",
};

// "Folders" the admin can click through — each maps to one or more of the
// underlying AuditCategory values so related events sit together.
const FOLDERS: { key: string; label: string; categories: AuditCategory[] }[] = [
  { key: "", label: "Alles", categories: [] },
  { key: "gebruikers", label: "Gebruikers", categories: ["AUTH", "KYC"] },
  { key: "bedrijven", label: "Bedrijven", categories: ["COMPANY", "AGREEMENT"] },
  { key: "security", label: "Security & logins", categories: ["SECURITY"] },
  { key: "facturatie", label: "Facturatie & uren", categories: ["BILLING", "TIMESHEET"] },
  { key: "disputen", label: "Disputen", categories: ["DISPUTE"] },
  { key: "matching", label: "Matching", categories: ["MATCHING"] },
  { key: "beheer", label: "Beheer & sales", categories: ["ADMIN", "SALES", "ORCHESTRATION"] },
];

export default async function AuditPage({ searchParams }: { searchParams: { folder?: string; q?: string } }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <NoAccess />;
  }

  const folder = FOLDERS.find((f) => f.key === (searchParams.folder ?? "")) ?? FOLDERS[0]!;
  const q = searchParams.q?.trim() ?? "";

  const entries = await prisma.auditLog.findMany({
    where: {
      ...(folder.categories.length ? { category: { in: folder.categories } } : {}),
      ...(q ? { summary: { contains: q, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      category: true,
      action: true,
      severity: true,
      summary: true,
      actorLabel: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      actor: { select: { fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Auditspoor"
        subtitle="Onwisbaar logboek van elke gevoelige handeling op het platform, per map te doorzoeken."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FOLDERS.map((f) => (
            <Link
              key={f.key}
              href={`/admin/audit${f.key ? `?folder=${f.key}` : ""}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                folder.key === f.key ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600 hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="flex gap-2">
          {folder.key && <input type="hidden" name="folder" value={folder.key} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Zoek in samenvatting…"
            className="w-60 rounded-lg border border-hairstrong bg-white px-3 py-1.5 text-sm"
          />
          <button type="submit" className="btn-ghost text-sm">
            Zoeken
          </button>
        </form>
      </div>

      <Panel title={`${entries.length} gebeurtenis${entries.length === 1 ? "" : "sen"} in ${folder.label.toLowerCase()}`}>
        {entries.length === 0 ? (
          <EmptyState title="Niets gevonden" body="Pas de map of je zoekopdracht aan." />
        ) : (
          <ul className="divide-y divide-hair">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="pill-neutral">{e.category}</span>
                    <span className="font-mono text-xs text-neutralx-400">{e.action}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink">{e.summary}</p>
                  <p className="mt-0.5 text-xs text-neutralx-400">
                    {e.actor?.fullName ?? e.actorLabel} · {dateTime(e.createdAt)}
                    {e.targetType === "user" && e.targetId && (
                      <>
                        {" · "}
                        <Link href={`/admin/gebruikers/${e.targetId}`} className="text-brand-600 hover:underline">
                          bekijk gebruiker
                        </Link>
                      </>
                    )}
                    {e.targetType === "tenant" && e.targetId && (
                      <>
                        {" · "}
                        <Link href={`/admin/bedrijven/${e.targetId}`} className="text-brand-600 hover:underline">
                          bekijk organisatie
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <StatusPill tone={SEV_TONE[e.severity] ?? "neutral"}>{e.severity}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Geen toegang" subtitle="Het auditspoor is alleen voor platformbeheerders." />
    </div>
  );
}
