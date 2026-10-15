import { redirect } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Role-neutral link target for chat/call notifications: forwards to this account's own inbox. */
export default async function BerichtenRouter({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  const query = thread && /^[\w-]{1,80}$/.test(thread) ? `?thread=${thread}` : "";

  const principal = await getPrincipal();
  if (!principal) redirect(`/login?callbackUrl=${encodeURIComponent(`/berichten${query}`)}`);

  if (hasRole(principal, "PLATFORM_ADMIN")) redirect(`/admin/berichten${query}`);
  if (hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER")) redirect(`/werkgever/berichten${query}`);
  redirect(`/dashboard/berichten${query}`);
}
