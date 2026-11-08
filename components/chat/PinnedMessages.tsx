"use client";

import { useState } from "react";

export function PinnedMessages({ messages = [] }: { messages?: Array<{ id: string; text: string; from: string }> }) {
  const [open, setOpen] = useState(false);

  if (messages.length === 0) return null;

  return (
    <div className="border-b bg-gray-50 p-3">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-sm font-semibold">
        <span>📌</span>
        <span>{messages.length} vastgezet</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="rounded bg-white p-2 text-sm border-l-2 border-blue-500">
              <div className="font-semibold text-xs text-gray-600">{msg.from}</div>
              <div className="text-gray-700">{msg.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
