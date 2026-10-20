// Vercel build: prisma generate → prisma migrate deploy → next build.
// schema.prisma's directUrl reads DATABASE_URL_UNPOOLED, and Prisma refuses
// to start when that variable is missing — which took production builds down
// when the Neon integration stopped providing it. Derive it from DATABASE_URL:
// Neon's direct host is the pooled host without "-pooler" (migrations need a
// direct connection; PgBouncer can't hold the advisory lock).
import { spawnSync } from "node:child_process";

export function directUrlFrom(pooled) {
  try {
    const u = new URL(pooled);
    u.hostname = u.hostname.replace("-pooler.", ".");
    u.searchParams.delete("pgbouncer");
    return u.toString();
  } catch {
    return pooled;
  }
}

const env = { ...process.env };
if (!env.DATABASE_URL_UNPOOLED && env.DATABASE_URL) {
  env.DATABASE_URL_UNPOOLED = directUrlFrom(env.DATABASE_URL);
  console.warn(
    `[build] DATABASE_URL_UNPOOLED not set — derived from DATABASE_URL (host ${new URL(env.DATABASE_URL_UNPOOLED).hostname}).`,
  );
}
console.log(`[build] DATABASE_URL set: ${Boolean(env.DATABASE_URL)}, DATABASE_URL_UNPOOLED set: ${Boolean(env.DATABASE_URL_UNPOOLED)}`);

for (const cmd of ["npx prisma generate", "npx prisma migrate deploy", "npx next build"]) {
  console.log(`[build] ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) {
    console.error(`[build] failed: ${cmd} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}
