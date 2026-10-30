import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// De Jarvis-assistent heet nu "ZekerFlex AI" en leeft in de studio op
// /admin/zekerflex-ai. Oude links (incl. de ⌘K-balk met ?q=…) blijven werken via
// deze doorverwijzing.
export default async function JarvisRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = sp.q;
  const q = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  redirect(q ? `/admin/zekerflex-ai?q=${encodeURIComponent(q)}` : "/admin/zekerflex-ai");
}
