"use client";

import { useEffect, useRef, useState } from "react";
import { getEmbedUrl } from "@/lib/videos/hosting";

interface VideoPlayerProps {
  hostId: string;
  provider: "vimeo" | "youtube" | "self-hosted";
  title: string;
  onView?: (watchedSeconds: number) => void;
}

export function VideoPlayer({ hostId, provider, title, onView }: VideoPlayerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [quality, setQuality] = useState("720p");
  const [isMuted, setIsMuted] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTimeRef = useRef(Date.now());

  const embedUrl = getEmbedUrl({ provider, hostId });

  useEffect(() => {
    return () => {
      if (onView) {
        const watchedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
        onView(watchedSeconds);
      }
    };
  }, [onView]);

  const handleFullscreen = () => {
    if (playerRef.current) {
      if (!isFullscreen) {
        playerRef.current.requestFullscreen().catch(() => {
          setIsFullscreen(true);
        });
      } else {
        document.exitFullscreen().catch(() => {
          setIsFullscreen(false);
        });
      }
    }
  };

  const handleKeyboard = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case " ":
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        }
        break;
      case "f":
        handleFullscreen();
        break;
      case "m":
        setIsMuted(!isMuted);
        break;
      case "ArrowRight":
        if (videoRef.current) videoRef.current.currentTime += 5;
        break;
      case "ArrowLeft":
        if (videoRef.current) videoRef.current.currentTime -= 5;
        break;
    }
  };

  if (provider === "vimeo" || provider === "youtube") {
    return (
      <div
        ref={playerRef}
        className="relative w-full bg-black"
        style={{ paddingBottom: "56.25%" }}
        onKeyDown={handleKeyboard}
        tabIndex={0}
      >
        <iframe
          src={embedUrl}
          title={title}
          className="absolute inset-0 h-full w-full rounded-lg"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
    );
  }

  return (
    <div ref={playerRef} className="relative w-full bg-black rounded-lg overflow-hidden" onKeyDown={handleKeyboard} tabIndex={0}>
      <video
        ref={videoRef}
        src={embedUrl}
        className="w-full h-auto"
        controls
        muted={isMuted}
        onPlay={() => (startTimeRef.current = Date.now())}
      />

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
        <div className="flex items-center justify-between text-white text-sm">
          <div className="flex gap-2">
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="bg-black/50 text-white rounded px-2 py-1 text-xs"
            >
              <option value="360p">360p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
              <option value="4k">4K</option>
            </select>

            <select
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="bg-black/50 text-white rounded px-2 py-1 text-xs"
            >
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="bg-black/50 hover:bg-black/70 rounded px-3 py-1 text-xs transition"
              title="Toggle mute (m)"
            >
              {isMuted ? "🔇" : "🔊"}
            </button>

            <button
              onClick={handleFullscreen}
              className="bg-black/50 hover:bg-black/70 rounded px-3 py-1 text-xs transition"
              title="Toggle fullscreen (f)"
            >
              ⛶
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-300">
          Bedieningstoetsen: Spatiebalk = afspelen/pauzeren | F = volledig scherm | M = geluid uit | ← → = ±5 sec
        </div>
      </div>
    </div>
  );
}
