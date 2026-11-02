import type { Metadata } from "next";
import { ACTIVITEITEN } from "@/lib/voorstel/schwarzwald";
import { ActiviteitenFilter } from "@/components/voorstel/ActiviteitenFilter";

export const metadata: Metadata = { title: "Activiteiten" };

export default function ActiviteitenPage() {
  return (
    <>
      <section className="bg-schw-night text-schw-cream">
        <div className="mx-auto max-w-[1280px] px-4 pb-14 pt-14 sm:px-8 lg:pt-20">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-schw-sun">{ACTIVITEITEN.length} activiteiten</p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.8rem,8vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.03em]">
            Gas erop, puzzelen of <span className="text-schw-orange">gewoon lachen</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-schw-cream/80">
            Alles start bij ons in het bos, en bijna alles is te combineren met een BBQ, hittesteen of buffet.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-[1280px] px-4 py-12 sm:px-8">
        <ActiviteitenFilter />
      </section>
    </>
  );
}
