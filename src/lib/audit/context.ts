import { AsyncLocalStorage } from "node:async_hooks";

/** Who is making a change, for the audit log. */
export type Actor = { id: string; name: string };

type Store = { actor: Actor | null };
const storage = new AsyncLocalStorage<Store>();

/**
 * Runs `fn` with room for an actor, filled in by the auth guard once it knows who is signed in. Every
 * API route runs inside one (apiRoute), so model writes deep inside a service know who made them.
 */
export const withAuditContext = <T>(fn: () => Promise<T>) => storage.run({ actor: null }, fn);

/** Runs `fn` as `actor`: for scripts, jobs and tests. */
export const runAs = <T>(actor: Actor | null, fn: () => Promise<T>) => storage.run({ actor }, fn);

/** Records who is acting for the rest of this request (no-op outside a context). */
export function setActor(actor: Actor) {
  const store = storage.getStore();
  if (store) store.actor = actor;
}

/** Who is making the current change; null for the system (sign-in bookkeeping, accepted invites, jobs). */
export const currentActor = () => storage.getStore()?.actor ?? null;
