"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  normalizeFrameIntervals,
  type FrameInterval,
} from "@/server/dataset-export/clips";

type ClipDrafts = Record<number, FrameInterval[]>;
type ClipDraftContextValue = {
  drafts: ClipDrafts;
  setInterval: (episodeId: number, interval: FrameInterval) => void;
  removeInterval: (episodeId: number, index: number) => void;
  removedFrames: number;
  clippedEpisodes: number;
};
const ClipDraftContext = createContext<ClipDraftContextValue | undefined>(
  undefined,
);

export function ClipDraftsProvider({
  repoId,
  children,
}: {
  repoId: string;
  children: React.ReactNode;
}) {
  const storageKey = `lerobot-clip-drafts:${repoId}`;
  const [drafts, setDrafts] = useState<ClipDrafts>({});
  useEffect(() => {
    try {
      setDrafts(
        JSON.parse(sessionStorage.getItem(storageKey) ?? "{}") as ClipDrafts,
      );
    } catch {
      setDrafts({});
    }
  }, [storageKey]);
  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(drafts));
  }, [drafts, storageKey]);
  const setInterval = useCallback(
    (episodeId: number, interval: FrameInterval) => {
      setDrafts((old) => {
        const next = normalizeFrameIntervals(
          [...(old[episodeId] ?? []), interval],
          Number.MAX_SAFE_INTEGER,
        );
        return { ...old, [episodeId]: next };
      });
    },
    [],
  );
  const removeInterval = useCallback(
    (episodeId: number, index: number) =>
      setDrafts((old) => {
        const next = (old[episodeId] ?? []).filter(
          (_, current) => current !== index,
        );
        const result = { ...old };
        if (next.length) result[episodeId] = next;
        else delete result[episodeId];
        return result;
      }),
    [],
  );
  const value = useMemo(
    () => ({
      drafts,
      setInterval,
      removeInterval,
      clippedEpisodes: Object.keys(drafts).length,
      removedFrames: Object.values(drafts)
        .flat()
        .reduce((sum, item) => sum + item.end - item.start + 1, 0),
    }),
    [drafts, setInterval, removeInterval],
  );
  return (
    <ClipDraftContext.Provider value={value}>
      {children}
    </ClipDraftContext.Provider>
  );
}
export function useClipDrafts() {
  const value = useContext(ClipDraftContext);
  if (!value)
    throw new Error("useClipDrafts must be used within ClipDraftsProvider");
  return value;
}
