export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apple App Site Association: welke iPhone-app bij zekerflex.com hoort. Nodig voor
// passkeys in de app (webcredentials: de app mag de passkeys van zekerflex.com
// gebruiken) en voor universele links (een link naar zekerflex.com/dashboard… opent
// de app). Apple haalt dit zelf op via zijn eigen CDN, zonder doorverwijzing.
// Aan zodra APPLE_TEAM_ID op de server staat (owner-todo "ios-app"); de bundel-id is
// APNS_TOPIC of standaard com.zekerflex.app (zelfde als ios-app/project.yml).

export async function GET(): Promise<Response> {
  const team = (process.env.APPLE_TEAM_ID ?? "").trim();
  if (!/^[A-Z0-9]{10}$/.test(team)) return new Response("Not found", { status: 404 });
  const app = `${team}.${(process.env.APNS_TOPIC ?? "").trim() || "com.zekerflex.app"}`;
  const inhoud = {
    applinks: {
      details: [
        {
          appIDs: [app],
          // alleen de schermen van de app; de site zelf en klantsites blijven in de browser
          components: [
            { "/": "/dashboard*" },
            { "/": "/werkgever*" },
            { "/": "/berichten*" },
            { "/": "/id-scan*" },
            { "/": "/i/*" },
            { "/": "/r/*" },
            { "/": "/uitnodiging*" },
            { "/": "/verifieer-email*" },
            { "/": "/wachtwoord-herstellen*" },
          ],
        },
      ],
    },
    webcredentials: { apps: [app] },
  };
  return new Response(JSON.stringify(inhoud), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}
