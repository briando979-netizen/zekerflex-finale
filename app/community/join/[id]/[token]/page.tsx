import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { acceptInvite } from "@/lib/communities/store";

export const dynamic = "force-dynamic";

export default async function JoinCommunityPage({
  params,
}: {
  params: { id: string; token: string };
}) {
  const principal = await getPrincipal();
  if (!principal) {
    redirect(`/login?next=${encodeURIComponent(`/community/join/${params.id}/${params.token}`)}`);
  }

  const community = await acceptInvite(params.id, params.token, principal.userId);

  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      {community ? (
        <>
          <h1 className="font-display text-2xl font-bold text-ink">Je bent lid van “{community.name}”</h1>
          <p className="mt-2 text-sm text-neutralx-600">Je vindt de community-chat nu in je berichten.</p>
          <a href="/dashboard/berichten" className="btn-primary mt-6 inline-block">
            Naar berichten
          </a>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold text-ink">Uitnodiging niet geldig</h1>
          <p className="mt-2 text-sm text-neutralx-600">
            Deze uitnodiging is verlopen, al gebruikt, of voor een ander account bedoeld.
          </p>
          <a href="/dashboard" className="btn-ghost mt-6 inline-block">
            Naar dashboard
          </a>
        </>
      )}
    </main>
  );
}
