import { requirePrincipal } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { InboxPage } from "@/components/chat/InboxPage";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function WerkgeverBerichtenPage() {
  await requirePrincipal();
  const m = (await getDict()).messages;
  return (
    <>
      <div className="hidden md:block">
        <PageHeader title={m.title} eyebrow={m.eyebrow} subtitle={m.subtitle} />
      </div>
      {/* op de telefoon is de kop verborgen; de pagina houdt een h1 voor schermlezers */}
      <h1 className="sr-only md:hidden">{m.title}</h1>
      {/* employer shell: 4rem top bar + page padding + header above the chat, no bottom tab bar on a phone */}
      <InboxPage mobileHeight="h-[calc(100dvh-8rem)]" desktopHeight="md:h-[calc(100dvh-20rem)]" />
    </>
  );
}
