import { env } from "@/lib/env";
import { SiteBuilder } from "@/components/app/SiteBuilder";

export const dynamic = "force-dynamic";

// Website bouwen: toegang (werkgever-rollen) zit in app/werkgever/layout.tsx; wie
// mag bouwen en publiceren regelt lib/sites/access.ts in de API.
export default function WebsiteBouwerPage() {
  return <SiteBuilder origin={new URL(env.APP_BASE_URL).origin} />;
}
