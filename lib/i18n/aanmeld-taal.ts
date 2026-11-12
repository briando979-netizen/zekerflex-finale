import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { heeftBewaardeTaal, setUserLocale } from "@/lib/i18n/worker-locale";

// De taal waarin een nieuwe WERKER zich aanmeldt, onthouden voor zijn mails en pushes (lib/i18n/worker-locale.ts), zodat al de eerste mail (de
// bevestiging) in zijn taal aankomt. Alleen een taal die hij zelf koos (de taalkeuze op de site of in de app, het cookie): nooit een gok uit
// Accept-Language. Zonder keuze: niets bewaard (dan Nederlands). Een taal die al bewaard is, wordt nooit overschreven. Een bedrijf krijgt geen
// werker-taal. Een storing mag de aanmelding nooit in de weg zitten.
export async function onthoudAanmeldTaal(userId: string, type: "freelancer" | "bedrijf"): Promise<void> {
  if (type !== "freelancer") return;
  try {
    const gekozen = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (!isLocale(gekozen)) return;
    if (await heeftBewaardeTaal(userId)) return;
    await setUserLocale(userId, gekozen);
  } catch {
    /* de taal blijft Nederlands */
  }
}
