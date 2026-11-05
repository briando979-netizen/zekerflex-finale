import { requirePrincipal } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/app/ui";
import { TerminalsBeheer } from "@/components/app/TerminalsBeheer";

export const dynamic = "force-dynamic";

// Inchecken op locatie: terminals (tablet aan de muur), NFC-stickers en
// sleutelhangers per vestiging (lib/incheck). Uren komen zo zonder handwerk
// in het urenbriefje, op de plek van de vestiging zelf.
export default async function IncheckenPage() {
  await requirePrincipal();
  const origin = new URL(env.APP_BASE_URL).origin;
  return (
    <>
      <PageHeader
        eyebrow="Personeel"
        title="Inchecken op locatie"
        subtitle="Een tablet bij de ingang, een NFC-sticker of een sleutelhanger: je krachten checken in zonder dat jij uren hoeft over te typen. Elke check-in staat meteen in het urenbriefje."
      />
      <TerminalsBeheer origin={origin} />
    </>
  );
}
