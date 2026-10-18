import type { Metadata } from "next";
import { canonical } from "@/lib/seo";

// The status page itself is a client component (live polling), so its
// metadata lives here.
const title = "Systeemstatus";
const description = "Live status van het ZekerFlex-platform: website, inloggen, uitbetalingen en meldingen.";

export const metadata: Metadata = {
  title,
  description,
  ...canonical("/status", { title, description }),
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
