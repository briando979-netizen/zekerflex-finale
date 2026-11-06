import { env } from "@/lib/env";
import Ontwerp from "@/components/studio/Ontwerp";

export const dynamic = "force-dynamic";

export default function StudioWebsiteOntwerpPage() {
  return <Ontwerp origin={new URL(env.APP_BASE_URL).origin} />;
}
