import { cookies } from "next/headers";
import { APP_COOKIE } from "@/lib/app-mode";

/** Server components: is this request coming from the Android app? */
export async function inAndroidApp(): Promise<boolean> {
  return (await cookies()).get(APP_COOKIE)?.value === "1";
}
