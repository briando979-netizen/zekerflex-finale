"use client";

export function ChatStatus({ status = "offline" }: { status?: "online" | "away" | "busy" | "offline" }) {
  const indicators = {
    online: { color: "bg-green-500", label: "Online" },
    away: { color: "bg-yellow-500", label: "Afwezig" },
    busy: { color: "bg-red-500", label: "Bezet" },
    offline: { color: "bg-gray-400", label: "Offline" },
  };

  const { color, label } = indicators[status];

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-600">{label}</span>
    </div>
  );
}
