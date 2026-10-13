"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/chat/Avatar";
import {
  createPoolAction,
  renamePoolAction,
  deletePoolAction,
  addPoolMemberAction,
  removePoolMemberAction,
} from "@/app/werkgever/favorieten/pools/actions";

interface Favorite {
  userId: string;
  name: string;
}
interface Pool {
  id: string;
  name: string;
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
          placeholder="Naam van nieuwe pool, bijv. Horeca team A"
          className="field-input flex-1"
        />
        <button type="button" onClick={createPool} disabled={pending || !newPoolName.trim()} className="btn-primary text-sm">
          Pool aanmaken
        </button>
      </div>

      {pools.length === 0 ? (
        <p className="text-sm text-neutralx-500">Nog geen pools — maak hierboven je eerste pool aan.</p>
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
                        const name = window.prompt("Nieuwe naam voor deze pool:", pool.name);
                        if (name && name.trim() && name.trim() !== pool.name) {
                          run(() => renamePoolAction(pool.id, name));
                        }
                      }}
                      className="text-xs text-neutralx-500 hover:text-brand-600"
                    >
                      Hernoem
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Pool "${pool.name}" verwijderen?`)) run(() => deletePoolAction(pool.id));
                      }}
                      className="text-xs text-crit hover:underline"
                    >
                      Verwijder
                    </button>
                  </div>
                </div>

                {pool.members.length === 0 ? (
                  <p className="mt-3 text-xs text-neutralx-400">Nog geen leden.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {pool.members.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Avatar userId={m.userId} name={nameById.get(m.userId) ?? "?"} avatars={avatars} size={28} />
                          <span className="text-sm text-ink">{nameById.get(m.userId) ?? "Onbekend"}</span>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => removePoolMemberAction(pool.id, m.userId))}
                          className="text-xs text-neutralx-400 hover:text-crit"
                        >
                          Verwijder
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
                      <option value="">+ Voeg favoriet toe…</option>
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
