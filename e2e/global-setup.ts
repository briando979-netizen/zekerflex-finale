import { execSync } from "node:child_process";
import { prisma } from "@/lib/prisma";

// E2E runs against a freshly seeded local database so specs that mutate state
// (approving the seeded timesheet, etc.) are deterministic on every run.
// `prisma/seed.ts` refuses to touch anything but a local DB, so this is safe.
const DEMO_EMAILS = [
  "admin@zekerflex.nl",
  "hq@supermarktketen.nl",
  "liam.gold@freelancer.nl",
];

export default async function globalSetup(): Promise<void> {
  if (process.env.PLAYWRIGHT_SKIP_SEED !== "1") {
    // eslint-disable-next-line no-console
    console.log("[e2e] resetting + re-seeding local database…");
    // --reset wipes and rebuilds; prisma/seed.ts still refuses a non-local DB.
    execSync("npm run db:seed:reset", { stdio: "inherit" });
  }

  // The seed leaves demo accounts e-mail-unverified on purpose (to demo the
  // verification flow). For E2E we want to land straight in the app.
  const res = await prisma.user.updateMany({
    where: { email: { in: DEMO_EMAILS }, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  // eslint-disable-next-line no-console
  console.log(`[e2e] marked ${res.count} demo account(s) e-mail-verified`);
  await prisma.$disconnect();
}
