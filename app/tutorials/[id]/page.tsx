"use client";

import { useCallback, useEffect, useState } from "react";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { useParams } from "next/navigation";

interface Video {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  hostedOn: "vimeo" | "youtube" | "self-hosted";
  hostId: string;
  views: number;
  watchTime: number;
  subtitles?: { language: string; url: string }[];
}

export default function VideoDetailPage() {
  const params = useParams();
  const videoId = params.id as string;
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVideo = async () => {
      try {
        const res = await fetch(`/api/videos/${videoId}`);
        if (!res.ok) throw new Error("Video not found");
        const data = await res.json();
        setVideo(data.video);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load video");
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId]);

  const handleView = useCallback(
    async (watchedSeconds: number) => {
      try {
        await fetch("/api/videos/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId, watchedSeconds }),
        });
      } catch {
        /* ignore */
      }
    },
    [videoId]
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-fg-muted">Video laden...</div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-[#f87171]">{error || "Video niet gevonden"}</div>
      </div>
    );
  }

  const avgWatchTime = video.views > 0 ? Math.floor(video.watchTime / video.views) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 space-y-4">
          <VideoPlayer hostId={video.hostId} provider={video.hostedOn} title={video.title} onView={handleView} />

          <div>
            <h1 className="mb-2 text-3xl font-bold text-ink">{video.title}</h1>
            <div className="flex flex-wrap gap-4 text-sm text-fg-muted">
              <span>{video.views} weergaves</span>
              <span>Gemiddeld gekeken: {avgWatchTime}s</span>
              <span>Duur: {Math.floor(video.durationSeconds / 60)}m {video.durationSeconds % 60}s</span>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-ink">Over deze video</h2>
            <p className="text-fg-muted leading-relaxed">{video.description}</p>
          </div>

          {video.subtitles && video.subtitles.length > 0 && (
            <div className="rounded-lg bg-blue-50 p-4">
              <h3 className="mb-2 font-semibold text-blue-900">Beschikbare ondertitels</h3>
              <div className="flex flex-wrap gap-2">
                {video.subtitles.map((sub) => (
                  <a
                    key={sub.language}
                    href={sub.url}
                    className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200"
                  >
                    {sub.language}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-gray-50 p-4 text-sm text-fg-muted">
            <p>💡 Tip: Gebruik de bedieningstoetsen in de video voor sneller navigeren (spatiebalk = afspelen, F = volledig scherm)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
