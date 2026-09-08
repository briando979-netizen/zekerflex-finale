"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

type Kind = "favorite" | "block";

async function post(action: string, userId: string, name: string, failMsg: string) {
  const res = await fetch("/api/werkgever/relations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, userId, name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? failMsg);
  return data;
}

/**
 * Toggle a freelancer's favourite / blocked state for the caller's organisation.
 * `kind` = "favorite" shows a heart toggle; "block" shows a block / unblock control.
 */
export function FreelancerRelationButton({
  userId,
  name,
  kind,
  active,
  variant = "chip",
}: {
  userId: string;
  name: string;
  kind: Kind;
  active: boolean;
  variant?: "chip" | "row";
}) {
  const r = useT().relations;
  const toast = useToast();
  const router = useRouter();
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();

  function toggle() {
    const action =
      kind === "favorite" ? (on ? "unfavorite" : "favorite") : on ? "unblock" : "block";
    start(async () => {
      try {
        await post(action, userId, name, r.actionFailed);
        setOn((v) => !v);
        toast.success(
          kind === "favorite"
            ? on
              ? r.toastFavRemoved
              : fmt(r.toastFavAdded, { name })
            : on
              ? fmt(r.toastUnblocked, { name })
              : fmt(r.toastBlocked, { name }),
        );
        router.refresh();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  if (kind === "favorite") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={on}
        title={on ? r.favFrom : r.favTo}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
          on
            ? "border-brand-500 bg-brand-50 text-brand-700"
            : "border-hairstrong text-neutralx-500 hover:border-brand-400 hover:text-brand-600"
        }`}
      >
        <span aria-hidden>{on ? "♥" : "♡"}</span>
        {variant === "row" ? (on ? r.favorite : r.makeFavorite) : r.favorite}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
        on
          ? "border-hairstrong text-neutralx-500 hover:border-crit/40 hover:text-crit"
          : "border-crit/30 text-crit hover:bg-crit/5"
      }`}
    >
      {on ? r.unblock : r.block}
    </button>
  );
}
