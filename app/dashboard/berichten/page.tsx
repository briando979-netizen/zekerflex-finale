import { requirePrincipal } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { InboxPage } from "@/components/chat/InboxPage";

export const dynamic = "force-dynamic";

export default async function BerichtenPage() {
  await requirePrincipal();
  return (
    <>
      {/* on a phone the bottom tab already says "Chat" — the chat gets the screen */}
      <div className="hidden md:block">
        <PageHeader
          title="Berichten"
          eyebrow="Chat"
          subtitle="Praat direct met opdrachtgevers en met ZekerFlex Support. Elk gesprek is privé voor jou."
        />
      </div>
      <InboxPage />
    </>
  );
}
