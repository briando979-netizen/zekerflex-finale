import { NextResponse } from "next/server";
import { hasRole, requirePrincipal, type Principal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isTenantVerified } from "@/lib/company/verified";
import { transipConfigured } from "@/lib/mail/hosting/transip";
import { ZF_MAIL_DOMAIN, suggestLocalParts } from "@/lib/mail/zf-address";
import { accountOfUser, checkAddress, createAccount, createSchema, publicAccount } from "@/lib/mail/zf-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPLOYER_ROLES = ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"] as const;

/** Who may make a ZekerFlex address: people of a verified company (or the platform itself). */
async function eligibility(p: Principal): Promise<{ tenantId: string | null; mayCreate: boolean; reason: string | null }> {
  if (hasRole(p, "PLATFORM_ADMIN")) return { tenantId: null, mayCreate: true, reason: null };
  const grant = p.grants.find((g) => (EMPLOYER_ROLES as readonly string[]).includes(g.role));
  if (!grant) return { tenantId: null, mayCreate: false, reason: "Een ZekerFlex-mailadres is er voor opdrachtgevers." };
  if (!(await isTenantVerified(grant.organizationId))) {
    return { tenantId: grant.organizationId, mayCreate: false, reason: "Zodra je bedrijf is geverifieerd (KVK), kun je hier je eigen mailadres maken." };
  }
  return { tenantId: grant.organizationId, mayCreate: true, reason: null };
}

// GET /api/me/zfmail[?name=Jan de Vries] — my ZekerFlex address (if any), whether I may make one,
// and free ideas from my name (or the name typed in the first signup step).
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const name = new URL(request.url).searchParams.get("name")?.trim().slice(0, 80) || p.fullName;
    const [account, who] = await Promise.all([accountOfUser(p.userId), eligibility(p)]);
    const suggestions =
      account || !who.mayCreate
        ? []
        : (await Promise.all(suggestLocalParts(name, 6).map((lp) => checkAddress(lp).catch(() => null))))
            .filter((c) => c?.available)
            .slice(0, 4)
            .map((c) => c!.address);
    return NextResponse.json({
      domain: ZF_MAIL_DOMAIN,
      live: transipConfigured(),
      account: account ? publicAccount(account) : null,
      mayCreate: who.mayCreate && !account,
      reason: who.reason,
      suggestions,
      fullName: p.fullName,
      email: p.email,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/zfmail — make my address (at TransIP at once, or as a waiting request).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({
      name: "zfmail-create",
      identifier: p.userId,
      limit: 5,
      windowSeconds: 3600,
      message: "Te veel pogingen. Probeer het over een uur opnieuw.",
    });
    const who = await eligibility(p);
    if (!who.mayCreate) throw AppError.forbidden(who.reason ?? "Je kunt hier geen mailadres maken.");
    const input = createSchema.parse(await request.json().catch(() => ({})));
    const account = await createAccount({ userId: p.userId, email: p.email, fullName: p.fullName, tenantId: who.tenantId }, input);
    return NextResponse.json({ account: publicAccount(account) }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
