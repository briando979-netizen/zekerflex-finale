import { cookies } from "next/headers";
import { APP_COOKIE, APP_IOS_COOKIE } from "@/lib/app-mode";

/** Server components: is this request coming from the Android app? */
export async function inAndroidApp(): Promise<boolean> {
  return (await cookies()).get(APP_COOKIE)?.value === "1";
}

/** Server components: komt dit verzoek uit de iPhone-app? (lib/app-mode.ts APP_IOS_COOKIE) */
export async function inIosApp(): Promise<boolean> {
  const c = await cookies();
  return c.get(APP_COOKIE)?.value === "1" && c.get(APP_IOS_COOKIE)?.value === "1";
}
