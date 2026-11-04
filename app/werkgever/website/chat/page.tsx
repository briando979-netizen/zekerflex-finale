import type { Metadata } from "next";
import Link from "next/link";
import { SiteChatInbox } from "@/components/app/SiteChatInbox";

export const metadata: Metadata = { title: "Websitechat" };
export const dynamic = "force-dynamic";

// De chat op de eigen website: aan/uit en alle gesprekken (lib/sitechat).
// Toegang is al afgedwongen in app/werkgever/layout.tsx; het API controleert het bedrijf.
export default function WebsiteChatPage() {
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/werkgever/website" className="underline">
          ← Website
        </Link>
      </p>
      <h1 className="mb-6 font-display text-2xl font-bold text-ink">Websitechat</h1>
      <SiteChatInbox />
    </>
  );
}
