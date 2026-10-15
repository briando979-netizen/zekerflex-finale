import { requirePrincipal } from "@/lib/auth";
import { getDict } from "@/lib/i18n/server";
import { AgendaView } from "@/components/app/AgendaView";

export const dynamic = "force-dynamic";

export default async function AdminAgendaPage() {
  await requirePrincipal();
  return (
    <div className="mx-auto max-w-6xl">
      <AgendaView t={(await getDict()).agenda} withShifts={false} mailHref="/admin/mijn-mail" whatsappHref="/admin/whatsapp" />
    </div>
  );
}
