"use client";

import { useState } from "react";

export function MessageDelete({ messageId, onDelete }: { messageId: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    await fetch("/api/chat/messages/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    onDelete();
  };

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-xs text-red-500 hover:underline">
        Verwijder
      </button>
    );
  }

  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-600">Zeker?</span>
      <button onClick={handleDelete} className="text-red-600 hover:underline">
        Ja, verwijder
      </button>
      <button onClick={() => setConfirming(false)} className="text-gray-600 hover:underline">
        Nee
      </button>
    </div>
  );
}
