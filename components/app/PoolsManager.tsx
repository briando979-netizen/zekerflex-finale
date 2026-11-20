"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/chat/Avatar";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import {
  createPoolAction,
  renamePoolAction,
  deletePoolAction,
  addPoolMemberAction,
  removePoolMemberAction,
  setPoolAutoAcceptAction,
} from "@/app/werkgever/favorieten/pools/actions";

interface Favorite {
  userId: string;
  name: string;
}
interface Pool {
  id: string;
  name: string;
  /** vaste schil: leden staan direct ingepland als ze reageren (lib/pools/vaste-schil.ts) */
  autoAccept: boolean;
  members: { userId: string }[];
}

export function PoolsManager({
  favorites,
  pools,
  avatars,
}: {
  favorites: Favorite[];
  pools: Pool[];
  avatars: Record<string, string>;
}) {
  const p = useT().pools;
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newPoolName, setNewPoolName] = useState("");
  const nameById = new Map(favorites.map((f) => [f.userId, f.name]));

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function createPool() {
    const name = newPoolName.trim();
    if (!name) return;
    run(async () => {
      const r = await createPoolAction(name);
      if (r.ok) setNewPoolName("");
      return r;
    });
  }

  return (
    <div className="space-y-6">
      <div className="surface flex items-center gap-2 p-4">
        <input
          value={newPoolName}
          onChange={(e) => setNewPoolName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createPool()}
          placeholder={p.namePh}
          className="field-input flex-1"
        />
        <button type="button" onClick={createPool} disabled={pending || !newPoolName.trim()} className="btn-primary text-sm">
          {p.create}
        </button>
      </div>

      {pools.length === 0 ? (
        <p className="text-sm text-neutralx-500">{p.none}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {pools.map((pool) => {
            const memberIds = new Set(pool.members.map((m) => m.userId));
            const addable = favorites.filter((f) => !memberIds.has(f.userId));
            return (
              <li key={pool.id} className="surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-base font-bold text-ink">{pool.name}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        const name = window.prompt(p.renamePrompt, pool.name);
                        if (name && name.trim() && name.trim() !== pool.name) {
                          run(() => renamePoolAction(pool.id, name));
                        }
                      }}
                      className="text-xs text-neutralx-500 hover:text-brand-600"
                    >
                      {p.rename}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(fmt(p.deleteConfirm, { naam: pool.name }))) run(() => deletePoolAction(pool.id));
                      }}
                      className="text-xs text-crit hover:underline"
                    >
                      {p.remove}
                    </button>
                  </div>
                </div>

                <label className="mt-3 flex items-start gap-2 rounded-xl bg-paper-soft p-3 text-xs text-neutralx-700">
                  <input
                    type="checkbox"
                    checked={pool.autoAccept}
                    disabled={pending}
                    onChange={(e) => run(() => setPoolAutoAcceptAction(pool.id, e.target.checked))}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-semibold text-ink">{p.vasteSchil}</span>
                    {p.vasteSchilUitleg}
                  </span>
                </label>

                {pool.members.length === 0 ? (
                  <p className="mt-3 text-xs text-neutralx-400">{p.noMembers}</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {pool.members.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar userId={m.userId} name={nameById.get(m.userId) ?? "?"} avatars={avatars} size={28} />
                          <span className="text-sm text-ink">{nameById.get(m.userId) ?? p.unknown}</span>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => removePoolMemberAction(pool.id, m.userId))}
                          className="text-xs text-neutralx-400 hover:text-crit"
                        >
                          {p.remove}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {addable.length > 0 && (
                  <div className="mt-3 border-t border-hair pt-3">
                    <select
                      disabled={pending}
                      value=""
                      onChange={(e) => {
                        if (e.target.value) run(() => addPoolMemberAction(pool.id, e.target.value));
                      }}
                      className="field-input text-sm"
                    >
                      <option value="">{p.addFavorite}</option>
                      {addable.map((f) => (
                        <option key={f.userId} value={f.userId}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
