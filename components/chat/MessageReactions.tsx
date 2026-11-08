"use client";

import { useState } from "react";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "✨"];

export function MessageReactions({ messageId, reactions = {} }: { messageId: string; reactions?: Record<string, string[]> }) {
  const [open, setOpen] = useState(false);

  const handleReaction = async (emoji: string) => {
    await fetch("/api/chat/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, emoji }),
    });
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setOpen(!open)}
        className="rounded px-2 py-1 text-xs hover:bg-gray-100"
        title="Reageer"
      >
        😊
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 flex gap-1 rounded-lg bg-white p-2 shadow-lg">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              className="text-lg hover:scale-125"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        {Object.entries(reactions).map(([emoji, users]) => (
          <span key={emoji} className="rounded-full bg-gray-100 px-2 py-1 text-xs">
            {emoji} {users.length}
          </span>
        ))}
      </div>
    </div>
  );
}
