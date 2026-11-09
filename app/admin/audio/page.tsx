import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead, Panel } from "@/components/admin/kit";
import { AudioNaarTekst } from "@/components/admin/AudioNaarTekst";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Admin → Audio naar tekst. Een opname (spraakbericht, mp3, filmpje) omzetten
// naar tekst met onze eigen spraakherkenning (Whisper op de eigen server,
// lib/asr/transcribe.ts). Gratis, en het geluid gaat nergens anders heen.
// ---------------------------------------------------------------------------

export default async function AudioPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Deze pagina is alleen voor platformbeheerders." />;
  }

  return (
    <div>
      <PageHead
        title="Audio naar tekst"
        subtitle="Zet een opname om naar tekst: een WhatsApp-spraakbericht, een mp3 of een filmpje van je telefoon. Dat gebeurt op onze eigen server; het bestand wordt niet bewaard."
      />
      <Panel title="Opname omzetten">
        <AudioNaarTekst />
      </Panel>
    </div>
  );
}
