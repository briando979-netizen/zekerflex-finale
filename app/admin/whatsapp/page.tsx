import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { WhatsAppHub } from "@/components/app/WhatsAppHub";
import { WhatsAppLive } from "@/components/admin/whatsapp/WhatsAppLive";
import { PageHead } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

// Admin → WhatsApp: bovenaan je eigen WhatsApp live (koppelen met een code, zoals WhatsApp Web; 15 nov 2026),
// daaronder het archief van geïmporteerde chat-exports.

export default async function AdminWhatsAppPage() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHead title="WhatsApp" subtitle="Koppel je eigen WhatsApp met een code en lees en beantwoord je gesprekken hier live, zoals in WhatsApp Web." />
      <WhatsAppLive />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
          Archief: geïmporteerde chats
        </h2>
        <WhatsAppHub t={(await getDict()).whatsapp} />
      </section>
    </div>
  );
}
