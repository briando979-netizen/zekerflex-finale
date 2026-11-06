import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import type { ErrorGroup } from "@/lib/ops/error-journal";

// ---------------------------------------------------------------------------
// Doorsturen naar een eigen GlitchTip (open source, Sentry-compatibel; draait
// als container naast de site, infra/docker/docker-compose.observability.yml).
// Het foutenlogboek blijft de eerste plek; GlitchTip geeft er een tijdlijn,
// zoekfunctie en meldingen per project bovenop. Alleen wat het logboek al
// heeft weggepoetst gaat erheen (geen e-mail, IBAN, sleutels), en nooit meer
// dan één gebeurtenis per soort fout per flush.
// ---------------------------------------------------------------------------

export interface GlitchtipDoel {
  storeUrl: string;
  authHeader: string;
}

/** https://<sleutel>@fouten.zekerflex.com/3 → store-adres + X-Sentry-Auth */
export function parseDsn(dsn: string | undefined): GlitchtipDoel | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const key = u.username;
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!key || !project || !/^\d+$/.test(project)) return null;
    return {
      storeUrl: `${u.protocol}//${u.host}/api/${project}/store/`,
      authHeader: `Sentry sentry_version=7, sentry_client=zekerflex/1.0, sentry_key=${key}`,
    };
  } catch {
    return null;
  }
}

export interface SentryEvent {
  event_id: string;
  timestamp: string;
  platform: "node";
  level: "error" | "warning";
  logger: string;
  environment: string;
  release?: string;
  message: { formatted: string };
  fingerprint: string[];
  tags: Record<string, string>;
  extra: Record<string, unknown>;
}

export function gebeurtenisVan(g: ErrorGroup, release?: string): SentryEvent {
  return {
    event_id: randomUUID().replace(/-/g, ""),
    timestamp: g.lastAt,
    platform: "node",
    level: g.level === "error" ? "error" : "warning",
    logger: "zekerflex",
    environment: "production",
    ...(release ? { release } : {}),
    message: { formatted: g.reason ? `${g.message} — ${g.reason}` : g.message },
    // dezelfde groep als in het eigen logboek, zodat GlitchTip net zo groepeert
    fingerprint: [g.id],
    tags: { ...(g.route ? { route: g.route } : {}), groep: g.id },
    extra: { aantal: g.count, eersteKeer: g.firstAt, laatsteKeer: g.lastAt, voorbeelden: g.samples.slice(-3) },
  };
}

export function glitchtipIngesteld(): boolean {
  return parseDsn(env.GLITCHTIP_DSN) !== null;
}

const status = { laatstOk: 0, laatstFout: 0, laatsteFout: "" };

export function glitchtipStatus(): { ingesteld: boolean; laatstOk: string | null; laatstFout: string | null; fout: string } {
  return {
    ingesteld: glitchtipIngesteld(),
    laatstOk: status.laatstOk ? new Date(status.laatstOk).toISOString() : null,
    laatstFout: status.laatstFout ? new Date(status.laatstFout).toISOString() : null,
    fout: status.laatsteFout,
  };
}

/** Stuur een flush-batch door. Fouten blijven stil: dit mag het logboek nooit in de weg zitten. */
export async function stuurNaarGlitchtip(groups: ErrorGroup[], fetcher: typeof fetch = fetch): Promise<number> {
  const doel = parseDsn(env.GLITCHTIP_DSN);
  if (!doel || groups.length === 0) return 0;
  const release = process.env.ZF_VERSIE || process.env.npm_package_version || undefined;
  let ok = 0;
  for (const g of groups.slice(0, 50)) {
    try {
      const r = await fetcher(doel.storeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sentry-Auth": doel.authHeader },
        body: JSON.stringify(gebeurtenisVan(g, release)),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        ok += 1;
        status.laatstOk = Date.now();
      } else {
        status.laatstFout = Date.now();
        status.laatsteFout = `GlitchTip antwoordde ${r.status}`;
      }
    } catch (e) {
      status.laatstFout = Date.now();
      status.laatsteFout = (e as Error).message.slice(0, 120);
    }
  }
  return ok;
}
