/* eslint-disable no-console */
// ---------------------------------------------------------------------------
// One-time production bootstrap: creates ONLY the platform tenant and a
// single PLATFORM_ADMIN account, both required for the app to function
// (invoice/payout approval looks up the platform tenant and fails hard
// without it). No demo companies, freelancers or shifts — unlike
// prisma/seed.ts, which is a full demo-data reset and must never be pointed
// at a real environment.
//
// Refuses to run if a PLATFORM tenant already exists, so it can't double-run.
//
//   DATABASE_URL=... node scripts/bootstrap-production.mjs
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function randomPassword() {
  // 24 random bytes, base64url — no ambiguous chars to transcribe, plenty of entropy.
  return randomBytes(24).toString("base64url");
}

async function main() {
  const existing = await prisma.tenant.findFirst({ where: { type: "PLATFORM" }, select: { id: true } });
  if (existing) {
    console.log("→ Platform tenant already exists — bootstrap skipped. Nothing changed.");
    return;
  }

  const platform = await prisma.tenant.create({
    // Fixed id: lib/auth/register.ts and lib/auth/nextauth.ts hardcode
    // "org_platform" as the tenant every self-serve signup joins.
    data: { id: "org_platform", name: "ZekerFlex B.V.", type: "PLATFORM", country: "NL" },
  });

  const password = randomPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.create({
    data: {
      email: "admin@zekerflex.com",
      fullName: "ZekerFlex Admin",
      passwordHash,
      kycStatus: "VERIFIED",
      emailVerifiedAt: new Date(),
      memberships: { create: { tenantId: platform.id, role: "PLATFORM_ADMIN" } },
    },
  });

  console.log("→ Platform tenant created:", platform.id);
  console.log("→ Admin account created:", admin.email);
  console.log("");
  console.log("  email:    " + admin.email);
  console.log("  password: " + password);
  console.log("");
  console.log("  Log in once, then change this password — it will not be shown again.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
