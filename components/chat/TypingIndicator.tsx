"use client";

export function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-1 text-sm text-gray-500">
      <span>{name} tikt…</span>
      <div className="flex gap-1">
        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}
