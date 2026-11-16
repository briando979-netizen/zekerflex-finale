import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkAddress, checkEigenAdres, eigenMailDomeinen } from "@/lib/mail/zf-accounts";
import { ZF_MAIL_DOMAIN } from "@/lib/mail/zf-address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/zfmail/check?name=jan[&domein=jouwzaak.nl] — is jan@zekerflex.com (or jan@ an own domain of my company) still
// free (checked as you type). An own domain is only checked when it belongs to my company (16 nov).
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({
      name: "zfmail-check",
      identifier: p.userId,
      limit: 120,
      windowSeconds: 600,
      message: "Even rustig aan: probeer het zo opnieuw.",
    });
    const q = new URL(request.url).searchParams;
    const name = (q.get("name") ?? "").slice(0, 80);
    const domein = (q.get("domein") ?? "").trim().toLowerCase().slice(0, 253);
    if (domein && domein !== ZF_MAIL_DOMAIN) {
      // hetzelfde bedrijf als bij het aanvragen (app/api/me/zfmail/route.ts, eligibility)
      const tenantId = p.grants.find((g) => ["HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER"].includes(g.role))?.organizationId ?? null;
      if (!(await eigenMailDomeinen(tenantId)).includes(domein)) {
        return NextResponse.json({ localPart: name, address: `${name}@${domein}`, available: false, reason: "Dit domein staat niet bij je bedrijf." });
      }
      return NextResponse.json(await checkEigenAdres(name, domein));
    }
    return NextResponse.json(await checkAddress(name));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
