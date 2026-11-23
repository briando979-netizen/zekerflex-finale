import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isZakelijk } from "@/lib/messaging/zakelijk-rol";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { InboxPage } from "@/components/chat/InboxPage";
import { getDict } from "@/lib/i18n/server";
import { inDemoSessie, DEMO_CHAT_NOTITIE } from "@/lib/auth/demo-sessie";
import { SamenTabs } from "@/components/werkgever/SamenTabs";

export const dynamic = "force-dynamic";

export default async function WerkgeverBerichtenPage() {
  const p = await requirePrincipal();
  const m = (await getDict()).messages;
  // voorbeeld (read-only demo): de chat is kijken, niet versturen (lib/auth/demo-sessie.ts)
  const demo = await inDemoSessie();
  // zakelijk: de chat zoals WhatsApp Business, met de naam van het bedrijf (lib/chat/zakelijk.ts)
  const zakelijk = isZakelijk(p);
  const tenantId = p.memberships[0]?.tenantId;
  const bedrijf = zakelijk && tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }).catch(() => null) : null;
  return (
    <>
      <SamenTabs groep="chat" actief="berichten" />
      <div className="hidden md:block">
        <PaginaKop title={m.title} eyebrow={m.eyebrow} subtitle={m.subtitle} />
      </div>
      {/* op de telefoon is de kop verborgen; de pagina houdt een h1 voor schermlezers */}
      <h1 className="sr-only md:hidden">{m.title}</h1>
      {/* employer shell: 4rem top bar + page padding + header above the chat, no bottom tab bar on a phone */}
      <InboxPage mobileHeight="h-[calc(100dvh-8rem)]" desktopHeight="md:h-[calc(100dvh-20rem)]" zakelijk={zakelijk} bedrijfsnaam={bedrijf?.name ?? ""} {...(demo ? { demoNotice: DEMO_CHAT_NOTITIE } : {})} />
    </>
  );
}
