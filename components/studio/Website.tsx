"use client";

import { useEffect } from "react";
import { SiteBuilder } from "@/components/app/SiteBuilder";
import { useStudio } from "@/components/studio/context";

// Studio → Website → Bouwer en Webshop → Pagina's: de pagina's en blokken, met de
// bouwer over de volle breedte, op de site van deze werkruimte (de soort uit de
// StudioProvider, zodat elke aanroep `?soort=` meekrijgt). De bouwer bewaart en
// publiceert zelf; na het verlaten haalt de studio de nieuwe stand op (Overzicht,
// Publiceren in de bovenbalk). `pagina`: het adres van de pagina om mee te beginnen;
// `ontwerp`: het ontwerp uit Studio → Ontwerpen waarmee een nieuwe site begint.
export default function Website({ origin, pagina, ontwerp }: { origin: string; pagina?: string | undefined; ontwerp?: string | undefined }) {
  const { reload, soort } = useStudio();
  useEffect(() => () => void reload(), [reload]);
  // de webshop begint bij de lijst met pagina's (het menu-item heet Pagina's); de website bij de blokken
  return <SiteBuilder origin={origin} soort={soort} beginPagina={pagina} beginTab={soort === "webshop" ? "paginas" : "blokken"} beginOntwerp={ontwerp} />;
}
