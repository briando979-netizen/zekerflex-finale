// ---------------------------------------------------------------------------
// Deployment target.
//
// ZekerFlex has ONE supported production architecture: the Sovereign Box — an
// always-on Node process (Docker / VPS / Kubernetes) with:
//   * in-process schedulers (scripts/daemon.mjs) for matching follow-up waves,
//     payroll finalisation, sales autopilot, the RAG reindex and the LLM
//     watchdog;
//   * a reachable local inference server;
//   * Postgres (advisory locks, _prisma_migrations) and Redis.
//
// Vercel is a PREVIEW/DEMO target only. On Vercel:
//   * there is no long-lived process, so scripts/daemon.mjs never runs;
//   * cron is capped to once per day (Hobby) — see vercel.json — and the
//     daemon-only jobs are not scheduled at all;
//   * background work (payroll finalisation, matching follow-ups) will not
//     fire on its own.
//
// A green `next build` on Vercel proves the web bundle compiles, nothing more.
// See docs/PRODUCTION-READINESS.md ("Architectuurbesluit").
// ---------------------------------------------------------------------------

export type DeploymentTarget = "sovereign-box" | "vercel-demo" | "unknown";

export function deploymentTarget(): DeploymentTarget {
  const v = process.env.VERCEL;
  if (v === "1" || v === "true") return "vercel-demo";
  if (process.env.ZEKERFLEX_TARGET === "sovereign-box") return "sovereign-box";
  // A plain Node server in production is the Sovereign Box; anything else
  // (local dev, CI, an unknown host) stays "unknown".
  return process.env.NODE_ENV === "production" ? "sovereign-box" : "unknown";
}

/** True when running on a target where background jobs do not run on their own. */
export function isDemoDeployment(): boolean {
  return deploymentTarget() === "vercel-demo";
}

export function deploymentNote(): string {
  switch (deploymentTarget()) {
    case "vercel-demo":
      return "Vercel — demo/preview only: schedulers and background jobs do not run. Not a production deployment.";
    case "sovereign-box":
      return "Sovereign Box — supported production architecture.";
    default:
      return "Unknown target (local dev / CI).";
  }
}
