"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Video {
  id: string;
  title: string;
  category: string;
  role: string;
  views: number;
  durationSeconds: number;
  createdAt: string;
}

export default function AdminVideosPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ category?: string; role?: string }>({});
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const params = new URLSearchParams();
        if (filter.category) params.append("category", filter.category);
        if (filter.role) params.append("role", filter.role);

        const res = await fetch(`/api/admin/videos?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setVideos(data.videos || []);
        }
      } catch (err) {
        console.error("Failed to fetch videos:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-ink">Video Beheer</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
        >
          + Nieuwe video
        </button>
      </div>

      {showForm && (
        <VideoForm
          onSuccess={() => {
            setShowForm(false);
            window.location.reload();
          }}
        />
      )}

      <div className="flex gap-4 flex-wrap">
        <select
          value={filter.category || ""}
          onChange={(e) => setFilter({ ...filter, category: e.target.value || undefined })}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Alle categorieën</option>
          <option value="tutorial">Tutorial</option>
          <option value="walkthrough">Walkthrough</option>
          <option value="guide">Gids</option>
          <option value="story">Verhaal</option>
          <option value="faq">FAQ</option>
        </select>

        <select
          value={filter.role || ""}
          onChange={(e) => setFilter({ ...filter, role: e.target.value || undefined })}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Alle rollen</option>
          <option value="general">Algemeen</option>
          <option value="employer">Opdrachtgever</option>
          <option value="worker">Flexwerker</option>
          <option value="admin">Beheerder</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center text-fg-muted">Laden...</div>
      ) : videos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-fg-muted">
          Geen video's gevonden. Voeg je eerste video toe!
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-ink">Titel</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Categorie</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Rol</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Weergaves</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Duur</th>
                <th className="px-4 py-3 text-left font-semibold text-ink">Actie</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3">{video.title}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">{video.category}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="rounded-full bg-green-100 px-2 py-1 text-green-700">{video.role}</span>
                  </td>
                  <td className="px-4 py-3">{video.views}</td>
                  <td className="px-4 py-3">
                    {Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/tutorials/${video.id}`} className="text-accent-ink hover:underline">
                      Bekijk
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VideoForm({ onSuccess }: { onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "tutorial" as const,
    role: "general" as const,
    durationSeconds: 0,
    thumbnailUrl: "",
    hostedOn: "vimeo" as const,
    hostId: "",
    qualities: ["720p"],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/admin/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onSuccess();
      }
    } catch (err) {
      console.error("Failed to create video:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-300 bg-white p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <input
          type="text"
          placeholder="Titel"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="rounded-lg border border-gray-300 px-3 py-2"
          required
        />
        <input
          type="number"
          placeholder="Duur (seconden)"
          value={formData.durationSeconds}
          onChange={(e) => setFormData({ ...formData, durationSeconds: parseInt(e.target.value) })}
          className="rounded-lg border border-gray-300 px-3 py-2"
          required
        />
      </div>

      <textarea
        placeholder="Beschrijving"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        className="w-full rounded-lg border border-gray-300 px-3 py-2"
        rows={3}
        required
      />

      <div className="grid gap-4 md:grid-cols-2">
        <select
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="tutorial">Tutorial</option>
          <option value="walkthrough">Walkthrough</option>
          <option value="guide">Gids</option>
          <option value="story">Verhaal</option>
          <option value="faq">FAQ</option>
        </select>

        <select
          value={formData.role}
          onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="general">Algemeen</option>
          <option value="employer">Opdrachtgever</option>
          <option value="worker">Flexwerker</option>
          <option value="admin">Beheerder</option>
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <select
          value={formData.hostedOn}
          onChange={(e) => setFormData({ ...formData, hostedOn: e.target.value as any })}
          className="rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="vimeo">Vimeo</option>
          <option value="youtube">YouTube</option>
          <option value="self-hosted">Self-hosted</option>
        </select>

        <input
          type="text"
          placeholder="Video ID / Host ID"
          value={formData.hostId}
          onChange={(e) => setFormData({ ...formData, hostId: e.target.value })}
          className="rounded-lg border border-gray-300 px-3 py-2"
          required
        />

        <input
          type="url"
          placeholder="Thumbnail URL"
          value={formData.thumbnailUrl}
          onChange={(e) => setFormData({ ...formData, thumbnailUrl: e.target.value })}
          className="rounded-lg border border-gray-300 px-3 py-2"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-brand-600 px-4 py-2 text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? "Opslaan..." : "Video toevoegen"}
      </button>
    </form>
  );
}
