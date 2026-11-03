"use client";

import { useEffect } from "react";
import { SiteBuilder } from "@/components/app/SiteBuilder";
import { useStudio } from "@/components/studio/context";

// Websitestudio → Website: de pagina's en blokken, met de bouwer over de volle
// breedte. Die bewaart en publiceert zelf; na het verlaten haalt de studio de
// nieuwe stand op (Overzicht, Publiceren in de bovenbalk).
export default function Website({ origin }: { origin: string }) {
  const { reload } = useStudio();
  useEffect(() => () => void reload(), [reload]);
  return <SiteBuilder origin={origin} />;
}
