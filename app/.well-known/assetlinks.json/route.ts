import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { assetLink, type AssetLink } from "@/lib/rijschool/app/twa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Digital Asset Links: welke Android-apps zekerflex.com zonder adresbalk mogen
// openen (Trusted Web Activity). Vast: de ZekerFlex-app. Daarbij de apps van
// rijscholen (lib/rijschool/app), met de ondertekensleutel van Google en hun
// eigen uploadsleutel. Is de database even weg, dan blijven de vaste regels
// staan: anders verschijnt de adresbalk in de ZekerFlex-app.

const ZEKERFLEX: AssetLink[] = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.zekerflex",
      sha256_cert_fingerprints: [
        "1A:1C:6B:39:43:5F:F2:EC:0D:BC:78:89:FC:38:55:F7:8D:F3:0D:71:87:B4:C2:8C:B9:EB:9D:D8:83:16:90:5D",
        "D4:87:2E:B3:FC:86:FE:F3:26:66:C6:78:F6:E5:18:2F:97:8E:92:D5:AE:F6:EB:EC:1D:7E:12:90:76:AC:BA:2D",
      ],
    },
  },
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.zekerflex.app",
      sha256_cert_fingerprints: ["D4:87:2E:B3:FC:86:FE:F3:26:66:C6:78:F6:E5:18:2F:97:8E:92:D5:AE:F6:EB:EC:1D:7E:12:90:76:AC:BA:2D"],
    },
  },
];

export async function GET(): Promise<Response> {
  let rijscholen: AssetLink[] = [];
  try {
    const apps = await prisma.rijschoolApp.findMany({
      where: { OR: [{ playVingerafdruk: { not: null } }, { uploadVingerafdruk: { not: null } }] },
      select: { pakketnaam: true, playVingerafdruk: true, uploadVingerafdruk: true },
      take: 2000,
    });
    rijscholen = apps.map((a) => assetLink(a.pakketnaam, [a.playVingerafdruk, a.uploadVingerafdruk])).filter((l): l is AssetLink => l !== null);
  } catch (err) {
    logger.warn("assetlinks: rijschool-apps niet gelezen, alleen de vaste regels", { error: err instanceof Error ? err.message : String(err) });
  }
  return new Response(JSON.stringify([...ZEKERFLEX, ...rijscholen], null, 2), {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}
