import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { WhatsAppHub } from "@/components/app/WhatsAppHub";

export const dynamic = "force-dynamic";

export default async function WerkgeverWhatsAppPage() {
  await requirePrincipal();
  return <WhatsAppHub t={(await getDict()).whatsapp} />;
}
