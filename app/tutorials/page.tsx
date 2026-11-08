import { Metadata } from "next";
import Link from "next/link";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Tutorials - ZekerFlex",
  description: "Video tutorials for ZekerFlex platform",
};

export default async function TutorialsPage() {
  const videos = await prisma.video.findMany({
    where: { category: "tutorial" },
    orderBy: { createdAt: "desc" },
  });

  const videosByRole = {
    general: videos.filter((v) => v.role === "general"),
    employer: videos.filter((v) => v.role === "employer"),
    worker: videos.filter((v) => v.role === "worker"),
    admin: videos.filter((v) => v.role === "admin"),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-ink">ZekerFlex Tutorials</h1>
          <p className="text-lg text-fg-muted">Leer hoe je het meeste uit ZekerFlex haalt met onze video tutorials</p>
        </div>

        {Object.entries(videosByRole).map(([role, roleVideos]) => {
          if (roleVideos.length === 0) return null;

          const roleLabels: Record<string, string> = {
            general: "Algemeen",
            employer: "Voor Opdrachtgevers",
            worker: "Voor Flexwerkers",
            admin: "Voor Beheerders",
          };

          return (
            <div key={role} className="mb-16">
              <h2 className="mb-8 text-2xl font-bold text-ink">{roleLabels[role]}</h2>
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {roleVideos.map((video) => (
                  <Link
                    key={video.id}
                    href={`/tutorials/${video.id}`}
                    className="group overflow-hidden rounded-lg bg-white shadow-md transition hover:shadow-lg"
                  >
                    <div className="relative overflow-hidden bg-gray-200">
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="h-48 w-full object-cover transition group-hover:scale-105"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                        <div className="text-4xl">▶️</div>
                      </div>
                      <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
                        {Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, "0")}
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="mb-2 font-semibold text-ink line-clamp-2">{video.title}</h3>
                      <p className="mb-3 text-sm text-fg-muted line-clamp-2">{video.description}</p>
                      <div className="flex items-center justify-between text-xs text-fg-faint">
                        <span>{video.views} weergaves</span>
                        <span className="rounded-full bg-gray-200 px-2 py-1">{video.category}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        {videos.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center">
            <p className="mb-4 text-fg-muted">Er zijn nog geen video tutorials beschikbaar.</p>
            <Link href="/admin/videos" className="text-accent-ink hover:underline">
              Video's toevoegen →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
