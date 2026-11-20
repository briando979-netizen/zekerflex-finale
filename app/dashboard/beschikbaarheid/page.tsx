import { requirePrincipal } from "@/lib/auth";
import { getPrefs } from "@/lib/prefs/store";
import { getFiscal } from "@/lib/fiscal/store";
import { toontEigenTarief } from "@/lib/werker/eigen-tarief";
import { getFreelancerDict } from "@/lib/i18n/server";
import { PageHeader } from "@/components/app/ui";
import { AvailabilityForm } from "@/components/app/AvailabilityForm";

export const dynamic = "force-dynamic";

export default async function BeschikbaarheidPage() {
  const principal = await requirePrincipal();
  const [prefs, ft, fiscal] = await Promise.all([getPrefs(principal.userId), getFreelancerDict(), getFiscal(principal.userId).catch(() => null)]);
  // een uitzendkracht stelt geen tarief in (loon volgt uit cao en klus): dan zonder de tariefvelden; bij twijfel tonen we ze
  const toonTarief = toontEigenTarief(fiscal);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={toonTarief ? ft.avail.title : ft.avail.titleUitzend} subtitle={toonTarief ? ft.avail.subtitle : ft.avail.subtitleUitzend} />
      <AvailabilityForm initial={prefs} toonTarief={toonTarief} />
    </div>
  );
}
