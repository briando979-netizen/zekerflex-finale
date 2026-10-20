// Vercel build: prisma generate → prisma migrate deploy → next build.
// schema.prisma's directUrl reads DATABASE_URL_UNPOOLED, and Prisma refuses
// to start when that variable is missing — which took production builds down
// when the Neon integration stopped providing it. Fall back to DATABASE_URL
// (Neon's pooled URL still runs migrations, just via PgBouncer).
import { spawnSync } from "node:child_process";

const env = { ...process.env };
if (!env.DATABASE_URL_UNPOOLED && env.DATABASE_URL) {
  console.warn("[build] DATABASE_URL_UNPOOLED not set — using DATABASE_URL for migrations.");
  env.DATABASE_URL_UNPOOLED = env.DATABASE_URL;
}

for (const cmd of ["npx prisma generate", "npx prisma migrate deploy", "npx next build"]) {
  console.log(`[build] ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true, env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
