"use client";

import dynamic from "next/dynamic";

// Laadt de bewerklaag als een aparte, luie chunk. De marketing-layout rendert
// deze mount alléén voor een PLATFORM_ADMIN, dus bezoekers vragen de chunk
// nooit op en krijgen geen extra client-code.
const CmsEditLayer = dynamic(() => import("./CmsEditLayer").then((m) => m.CmsEditLayer), { ssr: false });

export function CmsEditMount() {
  return <CmsEditLayer />;
}
