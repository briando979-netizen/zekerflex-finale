import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { VideoEditor } from "@/components/admin/video/VideoEditor";

export const dynamic = "force-dynamic";

export default async function VideoPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De video-editor is alleen voor platformbeheerders." />;
  }
  return <VideoEditor />;
}
