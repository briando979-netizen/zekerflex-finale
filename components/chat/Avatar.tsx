"use client";

import { useState } from "react";
import { initials, ROLE_COLOR } from "./shared";

export function Avatar({
  userId,
  name,
  role = "freelancer",
  avatars,
  size = 40,
  support = false,
  online,
}: {
  userId: string;
  name: string;
  role?: string;
  avatars: Record<string, string>;
  size?: number;
  support?: boolean;
  online?: boolean | null | undefined;
}) {
  const [broken, setBroken] = useState(false);
  const src = !support && avatars[userId] ? `/api/profile/${userId}/avatar` : null;
  const bg = support ? "#0C0E12" : ROLE_COLOR[role] ?? "#0E5C4A";

  return (
    <span className="relative inline-flex flex-shrink-0" style={{ width: size, height: size }}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          onError={() => setBroken(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center rounded-full font-semibold text-white"
          style={{ background: bg, fontSize: size * 0.36 }}
        >
          {support ? "ZF" : initials(name)}
        </span>
      )}
      {online != null && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-white"
          style={{
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            background: online ? "#22c55e" : "#9ca3af",
          }}
          aria-hidden
        />
      )}
    </span>
  );
}
