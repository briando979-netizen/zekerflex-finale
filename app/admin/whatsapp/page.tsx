import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { WhatsAppHub } from "@/components/app/WhatsAppHub";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-6xl">
      <WhatsAppHub t={(await getDict()).whatsapp} />
    </div>
  );
}
