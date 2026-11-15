import type { Metadata } from "next";
import Link from "next/link";
import { getDict } from "@/lib/i18n/server";
import { verwerkVoorraadLink } from "@/lib/shop/voorraadmelding-server";
import { VoorraadAfmelden } from "@/components/marketing/VoorraadAfmelden";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { absolute: "Voorraadmelding — ZekerFlex Shop" }, robots: { index: false } };

// De links uit de bevestigingsmail van "Laat me weten als hij er weer is" (lib/shop/voorraadmelding.ts). Bevestigen gebeurt
// meteen; afmelden pas met een knop (een linkscanner van een mailprogramma opent de link ook, en mag niemand afmelden).
export default async function VoorraadmeldingPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await props.searchParams;
  const tekst = (k: string) => (typeof p[k] === "string" ? (p[k] as string).slice(0, 64) : "");
  const actie = tekst("actie") === "af" ? "af" : tekst("actie") === "ja" ? "ja" : null;
  const v = tekst("v");
  const a = tekst("a");
  const s = tekst("s");
  const t = (await getDict()).shop;
  const bevestigd = actie === "ja" && v && a && s ? await verwerkVoorraadLink("ja", v, a, s).catch(() => ({ ok: false as const })) : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">{t.voorraadVraag}</h1>
      {actie === "ja" && bevestigd?.ok ? (
        <>
          <p className="mt-3 text-[15px] text-neutralx-700">{t.voorraadBevestigd}</p>
          {bevestigd.product && (
            <Link href={`/shop/${bevestigd.product.slug}`} className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-[14px] font-bold text-white">
              {t.voorraadNaarProduct}
            </Link>
          )}
        </>
      ) : actie === "af" && v && a && s ? (
        <VoorraadAfmelden v={v} a={a} s={s} />
      ) : (
        <>
          <p className="mt-3 text-[15px] text-neutralx-700">{t.voorraadLinkFout}</p>
          <Link href="/shop" className="mt-6 inline-flex h-11 items-center rounded-lg bg-ink px-5 text-[14px] font-bold text-white">
            {t.vergelijkNaarShop}
          </Link>
        </>
      )}
    </div>
  );
}
