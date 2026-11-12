import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { registerAccount, registerSchema } from "@/lib/auth/register";
import { sendVerificationEmail } from "@/lib/auth/email-verify";
import { onthoudAanmeldTaal } from "@/lib/i18n/aanmeld-taal";
import { recordReferral, REF_COOKIE } from "@/lib/rewards/referral";
import { throttleIp } from "@/lib/security/ip-throttle";
import { verifyCaptcha } from "@/lib/security/captcha";
import { clientIp } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.forRequest(request, { route: "POST /api/register" });
  try {
    // stop mass account creation from one source; captcha when the owner enabled it
    await throttleIp(request, { name: "register", limit: 10, windowSeconds: 3600, message: "Te veel aanmeldingen vanaf dit adres. Probeer het later opnieuw." });
    const json = (await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    })) as { captcha?: string };
    if (!(await verifyCaptcha(json.captcha, clientIp(request)))) {
      throw AppError.validation("De beveiligingscheck is niet gelukt. Ververs de pagina en probeer opnieuw.");
    }
    const parsed = registerSchema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());
    }
    const account = await registerAccount(parsed.data);
    let verificatieMailVerstuurd = true;
    try {
      // de taal die de werker zelf koos (cookie), onthouden voor zijn mails en pushes; nooit een gok, nooit overschrijven
      await onthoudAanmeldTaal(account.userId, parsed.data.type);
      const mail = await sendVerificationEmail(account.userId, account.email, parsed.data.fullName);
      // Een wachttijd (sent: false) is geen fout: er ging net al een mail uit.
      if (mail.sent && !mail.delivered) {
        verificatieMailVerstuurd = false;
        log.warn("verificatiemail niet afgeleverd", { userId: account.userId, transport: mail.transport });
      }
    } catch (err) {
      verificatieMailVerstuurd = false;
      log.warn("verificatiemail versturen mislukt", { userId: account.userId, error: (err as Error).message });
    }
    // Doorverwijzen: /r/<code> left a cookie — remember who invited this user.
    const ref = request.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${REF_COOKIE}=`))
      ?.slice(REF_COOKIE.length + 1);
    await recordReferral(account.userId, ref ? decodeURIComponent(ref) : null).catch(() => undefined);
    return NextResponse.json(
      {
        ok: true,
        ...account,
        ...(verificatieMailVerstuurd ? {} : { waarschuwing: "Je account is aangemaakt, maar de bevestigingsmail kon niet worden verstuurd. Vraag op de volgende pagina een nieuwe mail aan." }),
      },
      { status: 201 },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("register failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
