import { env } from "@/lib/env";
import Website from "@/components/studio/Website";

export const dynamic = "force-dynamic";

// Website → Bouwer. `?ontwerp=<id>` (vanuit Ontwerpen): een nieuwe website begint met dat ontwerp gekozen.
export default async function StudioWebsitePage({ searchParams }: { searchParams: Promise<{ ontwerp?: string | string[] }> }) {
  const { ontwerp } = await searchParams;
  const id = typeof ontwerp === "string" && /^[a-z0-9-]{1,40}$/.test(ontwerp) ? ontwerp : undefined;
  return <Website origin={new URL(env.APP_BASE_URL).origin} ontwerp={id} />;
}
