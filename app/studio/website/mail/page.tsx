import { MailScherm } from "@/components/studio/account/Schermen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mail" };

// Website → Mail: het account in de studio zelf, los van /werkgever (lib/studio/account.ts).
export default function StudioWebsiteMailPage() {
  return <MailScherm />;
}
