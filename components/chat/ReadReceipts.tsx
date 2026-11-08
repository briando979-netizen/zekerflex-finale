"use client";

export function ReadReceipts({ status }: { status: "sent" | "delivered" | "read" }) {
  const icons = {
    sent: "✓",
    delivered: "✓✓",
    read: "✓✓",
  };

  const colors = {
    sent: "text-gray-400",
    delivered: "text-gray-500",
    read: "text-blue-500",
  };

  return (
    <span className={`inline-flex text-xs ${colors[status]}`} title={status}>
      {icons[status]}
    </span>
  );
}
