"use client";

import React from "react";
import { useEffect, useState } from "react";
import URDFViewer from "@/components/urdf-viewer";
import {
  buildG1QposFrame,
  extractOrderedG1StateColumns,
} from "@/components/g1-mujoco-replay-helpers";

type ChartRow = Record<string, unknown>;

type G1MujocoReplayProps = {
  datasetInfo: { robot_type: string | null; fps: number };
  episodeId: number;
  initialChartData: ChartRow[];
  fallbackData?: unknown;
};

type ReplayStatus = "loading" | "ready" | "error";

export default function G1MujocoReplay({
  datasetInfo,
  episodeId,
  initialChartData,
  fallbackData,
}: G1MujocoReplayProps) {
  const [status, setStatus] = useState<ReplayStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const firstRow = initialChartData[0];
        if (!firstRow) {
          throw new Error("Replay unavailable: no trajectory data");
        }

        const orderedColumns = extractOrderedG1StateColumns(firstRow);
        const qpos = buildG1QposFrame(firstRow, orderedColumns);

        const mujocoModuleName = ["@mujoco", "mujoco"].join("/");
        const loadMujocoModule = await import(mujocoModuleName);
        const loadMujoco = loadMujocoModule.default;
        const mujoco = await loadMujoco();
        mujoco.mj_forward?.({}, { qpos });

        if (!cancelled) {
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    }

    setStatus("loading");
    setError(null);
    void init();

    return () => {
      cancelled = true;
    };
  }, [initialChartData]);

  useEffect(() => {
    if (!playing || status !== "ready") return;

    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % initialChartData.length);
    }, 1000 / Math.max(datasetInfo.fps || 30, 1));

    return () => window.clearInterval(timer);
  }, [datasetInfo.fps, initialChartData.length, playing, status]);

  if (status === "loading") {
    return <div className="p-6 text-slate-200">Loading Replay…</div>;
  }

  if (status === "error") {
    if (fallbackData) {
      return <URDFViewer data={fallbackData as never} />;
    }

    return <div className="p-6 text-red-400">Replay unavailable: {error}</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-sm text-slate-200">Episode {episodeId}</div>
      <div className="text-xs text-slate-400">
        Frame {frame}/{Math.max(initialChartData.length - 1, 0)}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setPlaying((value) => !value)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setFrame(0);
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
