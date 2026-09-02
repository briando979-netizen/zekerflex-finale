import { getPrincipal, hasRole } from "@/lib/auth";
import { JarvisConsole } from "@/components/jarvis/JarvisConsole";

export const dynamic = "force-dynamic";

export default async function JarvisPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">
          De Jarvis-console is alleen beschikbaar voor platformbeheerders.
        </p>
      </main>
    );
  }
  return <JarvisConsole />;
}
