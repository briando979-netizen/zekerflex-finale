import { Section } from "@/components/marketing/primitives";
import { ldJson } from "@/lib/seo/json-ld";
import { SITE } from "@/lib/seo";
import { ZelfSpelendeVideo } from "@/components/marketing/ZelfSpelendeVideo";
import { duurTekst, paginaVideo, posterPad, videoPad } from "@/lib/marketing/paginavideos";

// Een korte uitlegvideo midden op een openbare pagina (lib/marketing/paginavideos.ts). De video laadt pas als hij in beeld komt en
// begint dan vanzelf, zonder geluid (components/marketing/ZelfSpelendeVideo.tsx). Ernaast staat de uitleg als tekst.
export function PaginaVideoBlok({ id }: { id: string }) {
  const v = paginaVideo(id);
  if (!v) return null;
  const ld = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.titel,
    description: v.samenvatting,
    thumbnailUrl: `${SITE.url}${posterPad(v)}`,
    contentUrl: `${SITE.url}${videoPad(v)}`,
    uploadDate: "2026-11-16",
    duration: `PT${v.seconden}S`,
    inLanguage: "nl",
  };
  return (
    <Section tone="soft">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: ldJson(ld) }}
      />
      <div className="grid items-center gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="eyebrow">Uitleg in {duurTekst(v.seconden)}</p>
          <h2 className="mt-3 text-balance font-display text-2xl font-bold leading-tight text-ink md:text-3xl">{v.titel}</h2>
          <p className="mt-3 text-neutralx-600">{v.samenvatting}</p>
          <details className="mt-5 text-sm text-neutralx-600">
            <summary className="cursor-pointer font-semibold text-ink">Lees de uitleg</summary>
            <p className="mt-3 leading-relaxed">{v.tekst.join(" ")}</p>
          </details>
        </div>
        <figure>
          <div className="overflow-hidden rounded-2xl border border-hair bg-ink shadow-xl">
            <ZelfSpelendeVideo src={videoPad(v)} poster={posterPad(v)} className="aspect-video w-full bg-ink" />
          </div>
        </figure>
      </div>
    </Section>
  );
}
