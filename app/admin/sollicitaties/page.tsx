import { getPrincipal, hasRole } from "@/lib/auth";
import { APageHeader, APanel } from "@/components/admin/ui";
import { listApplications } from "@/lib/jobs/store";

export const dynamic = "force-dynamic";

function nlDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SollicitatiesPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN", "HQ_ADMIN")) {
    return <APageHeader title="Geen toegang" subtitle="Open sollicitaties zijn voor beheerders." />;
  }

  const apps = await listApplications(200);

  return (
    <div className="mx-auto max-w-5xl">
      <APageHeader
        title="Open sollicitaties"
        subtitle="Iedereen die via /over-ons een open sollicitatie heeft ingestuurd. Bijlagen (motivatiebrief, cv) staan hieronder."
        badge={`${apps.length}`}
      />

      {apps.length === 0 ? (
        <APanel>
          <p className="py-10 text-center text-sm" style={{ color: "var(--a-mute)" }}>
            Nog geen sollicitaties.
          </p>
        </APanel>
      ) : (
        <div className="flex flex-col gap-3">
          {apps.map((a) => (
            <APanel key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: "var(--a-text)" }}>
                    {a.name}
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--a-dim)" }}>
                    <a href={`mailto:${a.email}`} className="underline">
                      {a.email}
                    </a>
                    {a.phone ? ` · ${a.phone}` : ""}
                  </p>
                </div>
                <p className="font-mono text-xs" style={{ color: "var(--a-mute)" }}>
                  {nlDateTime(a.at)}
                </p>
              </div>

              {a.skills.length > 0 && (
                <p className="mt-3 text-[13px]" style={{ color: "var(--a-dim)" }}>
                  <span style={{ color: "var(--a-mute)" }}>Interesse: </span>
                  {a.skills.join(", ")}
                </p>
              )}

              {a.motivationText && (
                <p
                  className="mt-3 whitespace-pre-wrap rounded-lg p-3 text-[13px] leading-relaxed"
                  style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}
                >
                  {a.motivationText}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {a.files.length === 0 && (
                  <span className="text-xs" style={{ color: "var(--a-mute)" }}>
                    Geen bijlagen
                  </span>
                )}
                {a.files.map((f, i) =>
                  f.uploadId ? (
                    <a
                      key={i}
                      href={`/api/admin/sollicitaties/${a.id}/${f.uploadId}`}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{ background: "var(--a-elev)", color: "var(--a-text)" }}
                    >
                      ⬇ {f.kind} — {f.filename}
                    </a>
                  ) : (
                    <span key={i} className="text-xs" style={{ color: "var(--a-mute)" }}>
                      {f.kind}: {f.filename} (oud record, niet downloadbaar)
                    </span>
                  ),
                )}
              </div>
              <p className="mt-3 font-mono text-[11px]" style={{ color: "var(--a-mute)" }}>
                ref {a.id}
              </p>
            </APanel>
          ))}
        </div>
      )}
    </div>
  );
}
