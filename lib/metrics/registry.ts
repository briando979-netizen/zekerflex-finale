import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Registry,
} from "prom-client";
import { deploymentTarget } from "@/lib/config/deployment";

// ---------------------------------------------------------------------------
// Prometheus metrics registry.
//
// One process-wide registry, exposed at /api/metrics. Held on `globalThis` so
// Next's dev hot-reload does not re-register (prom-client throws on a duplicate
// metric name). All names are `zf_`-prefixed.
// ---------------------------------------------------------------------------

interface MetricsBundle {
  registry: Registry;
  cronLastRun: Gauge<"job">;
  cronLastSuccess: Gauge<"job">;
  cronRuns: Counter<"job" | "status">;
  loginFailures: Counter<string>;
  rateLimited: Counter<"name">;
  payouts: Counter<"status">;
  timesheetsApproved: Counter<"track">;
  shiftOffers: Counter<"delivered">;
  usersErased: Counter<string>;
}

const KEY = Symbol.for("zekerflex.metrics");
type GlobalWithMetrics = typeof globalThis & { [KEY]?: MetricsBundle };

function build(): MetricsBundle {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "zf_" });

  new Gauge({
    name: "zf_build_info",
    help: "Static build/runtime info (value is always 1).",
    labelNames: ["version", "deployment"],
    registers: [registry],
  }).set(
    {
      version: process.env.npm_package_version ?? "0.0.0",
      deployment: deploymentTarget(),
    },
    1,
  );

  return {
    registry,
    cronLastRun: new Gauge({
      name: "zf_cron_last_run_timestamp_seconds",
      help: "Unix time of the last run of a scheduled job.",
      labelNames: ["job"],
      registers: [registry],
    }),
    cronLastSuccess: new Gauge({
      name: "zf_cron_last_run_success",
      help: "1 if the last run of a scheduled job succeeded, 0 otherwise.",
      labelNames: ["job"],
      registers: [registry],
    }),
    cronRuns: new Counter({
      name: "zf_cron_runs_total",
      help: "Scheduled job runs by outcome.",
      labelNames: ["job", "status"],
      registers: [registry],
    }),
    loginFailures: new Counter({
      name: "zf_login_failures_total",
      help: "Failed credential login attempts.",
      registers: [registry],
    }),
    rateLimited: new Counter({
      name: "zf_rate_limited_total",
      help: "Requests rejected by a rate limiter, by bucket name.",
      labelNames: ["name"],
      registers: [registry],
    }),
    payouts: new Counter({
      name: "zf_payouts_total",
      help: "Instant payout attempts by resulting status.",
      labelNames: ["status"],
      registers: [registry],
    }),
    timesheetsApproved: new Counter({
      name: "zf_timesheets_approved_total",
      help: "Approved timesheets by settlement track.",
      labelNames: ["track"],
      registers: [registry],
    }),
    shiftOffers: new Counter({
      name: "zf_shift_offers_total",
      help: "Shift offers dispatched, labelled by whether any channel delivered.",
      labelNames: ["delivered"],
      registers: [registry],
    }),
    usersErased: new Counter({
      name: "zf_users_erased_total",
      help: "Accounts anonymised via the AVG erasure flow.",
      registers: [registry],
    }),
  };
}

export function metrics(): MetricsBundle {
  const g = globalThis as GlobalWithMetrics;
  g[KEY] ??= build();
  return g[KEY];
}
