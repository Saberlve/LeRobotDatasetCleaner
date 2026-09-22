"use client";

import { useCallback, useSyncExternalStore } from "react";
import { batchStorageKey, type BatchEntry } from "./batch";

const eventName = "lerobot-idle-batch-updated";
const empty: BatchEntry[] = [];
const snapshots = new Map<
  string,
  { raw: string | null; entries: BatchEntry[] }
>();

function readRaw(repoId: string) {
  try {
    return sessionStorage.getItem(batchStorageKey(repoId));
  } catch {
    return snapshots.get(repoId)?.raw ?? null;
  }
}

export function getBatchResults(repoId: string): BatchEntry[] {
  const raw = readRaw(repoId);
  const cached = snapshots.get(repoId);
  if (cached && cached.raw === raw) return cached.entries;
  let entries = empty;
  try {
    const saved = JSON.parse(raw ?? "[]");
    if (Array.isArray(saved))
      entries = saved.filter(
        (entry) =>
          entry &&
          Number.isSafeInteger(entry.episodeId) &&
          ["start", "end"].includes(entry.edge) &&
          entry.profile,
      );
  } catch {
    /* Invalid session data does not prevent a new detection. */
  }
  snapshots.set(repoId, { raw, entries });
  return entries;
}
const getServerSnapshot = () => empty;

export function saveBatchResults(repoId: string, entries: BatchEntry[]) {
  let saved = true;
  try {
    sessionStorage.setItem(batchStorageKey(repoId), JSON.stringify(entries));
  } catch {
    saved = false;
  }
  publishBatchResults(repoId, entries);
  return saved;
}

export function publishBatchResults(repoId: string, entries: BatchEntry[]) {
  snapshots.set(repoId, { raw: readRaw(repoId), entries: [...entries] });
  window.dispatchEvent(
    new CustomEvent(eventName, { detail: { repoId, entries } }),
  );
}

export function useBatchResults(repoId: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const update = (event: Event) => {
        if ((event as CustomEvent<{ repoId: string }>).detail.repoId === repoId)
          notify();
      };
      window.addEventListener(eventName, update);
      return () => window.removeEventListener(eventName, update);
    },
    [repoId],
  );
  const snapshot = useCallback(() => getBatchResults(repoId), [repoId]);
  return useSyncExternalStore(subscribe, snapshot, getServerSnapshot);
}
