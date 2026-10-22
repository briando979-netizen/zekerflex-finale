import { cookies } from "next/headers";
import { decodeSession } from "@/lib/auth/session";
import { VIEW_AS_COOKIE } from "@/lib/auth/inspect";
import { ViewAsBar } from "@/components/admin/ViewAsControls";

/** Server: shows the "Bekijk als" bar when an admin is viewing as an example account. */
export async function ViewAsBanner({ role }: { role: "freelancer" | "employer" }) {
  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!raw) return null;
  const claims = await decodeSession(raw);
  if (!claims?.inspect) return null;
  return <ViewAsBar role={role} name={claims.name} />;
}
