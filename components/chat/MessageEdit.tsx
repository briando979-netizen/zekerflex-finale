"use client";

import { useState } from "react";

export function MessageEdit({ messageId, originalText, onEdit }: { messageId: string; originalText: string; onEdit: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(originalText);

  const handleSave = async () => {
    await fetch("/api/chat/messages/edit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, text }),
    });
    onEdit(text);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs text-gray-500 hover:underline">
        Bewerk
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="flex-1 rounded border px-2 py-1 text-sm"
        autoFocus
      />
      <button onClick={handleSave} className="rounded bg-blue-500 px-2 py-1 text-xs text-white">
        Opslaan
      </button>
      <button onClick={() => setEditing(false)} className="rounded bg-gray-300 px-2 py-1 text-xs">
        Annuleren
      </button>
    </div>
  );
}
