import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/seo";
import { passportToken } from "@/lib/passport/token";
import { isPassportPublic, setPassportPublic } from "@/lib/passport/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ensureFreelancer(userId: string): Promise<void> {
  const fp = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!fp) throw AppError.validation("Een werkpaspoort is er alleen voor professionals (zzp/flex/uitzend).");
}

export async function GET(): Promise<Response> {
  try {
    const p = await requirePrincipal();
    await ensureFreelancer(p.userId);
    const token = passportToken(p.userId);
    return NextResponse.json({
      enabled: await isPassportPublic(p.userId),
      token,
      url: `${SITE.url}/paspoort/${token}`,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ enabled: z.boolean() });

export async function PUT(request: Request): Promise<Response> {
  try {
    const p = await requirePrincipal();
    await ensureFreelancer(p.userId);
    const { enabled } = schema.parse(
      await request.json().catch(() => {
        throw AppError.validation("Body must be JSON");
      }),
    );
    await setPassportPublic(p.userId, enabled);
    const token = passportToken(p.userId);
    return NextResponse.json({ enabled, token, url: `${SITE.url}/paspoort/${token}` });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
