"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Dispatch, SetStateAction } from "react";

const STORAGE_KEY = "lerobot-viewer.playback-rate";
let playbackRate = 1;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function restore() {
  try {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    playbackRate = Number.isFinite(saved) && saved > 0 ? saved : 1;
  } catch {
    // Keep the shared in-memory setting when browser storage is unavailable.
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  restore();
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) restore();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePlaybackRate(): [number, Dispatch<SetStateAction<number>>] {
  const rate = useSyncExternalStore(
    subscribe,
    () => playbackRate,
    () => 1,
  );
  const setRate = useCallback((value: SetStateAction<number>) => {
    const next = typeof value === "function" ? value(playbackRate) : value;
    if (!Number.isFinite(next) || next <= 0) return;
    playbackRate = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // The setting still survives episode navigation in memory.
    }
    notify();
  }, []);
  return [rate, setRate];
}
