import { env } from "@/lib/env";
import Website from "@/components/studio/Website";

export const dynamic = "force-dynamic";

export default function StudioWebsitePage() {
  return <Website origin={new URL(env.APP_BASE_URL).origin} />;
}
