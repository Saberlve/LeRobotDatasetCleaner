"use client";

import React from "react";
import { useEffect, useState } from "react";
import type { EpisodeData } from "@/app/[org]/[dataset]/[episode]/fetch-data";
import MujocoSimViewer from "@/components/mujoco-sim-viewer";
import URDFViewer from "@/components/urdf-viewer";
import { useTime } from "@/context/time-context";
import {
  buildG1QposFrame,
  extractOrderedG1StateColumns,
} from "@/components/g1-mujoco-replay-helpers";
import { isG1Robot } from "@/lib/so101-robot";

type ChartRow = Record<string, unknown>;

type G1MujocoReplayProps = {
  datasetInfo: { robot_type: string | null; fps: number };
  episodeId: number;
  initialChartData: ChartRow[];
  fallbackData?: EpisodeData;
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
  const { isPlaying, setIsPlaying } = useTime();
  const isG1 = isG1Robot(datasetInfo.robot_type);

  useEffect(() => {
    setStatus("loading");
    setError(null);
    setFrame(0);
    setIsPlaying(false);
  }, [initialChartData, setIsPlaying]);

  useEffect(() => {
    let cancelled = false;

    function init() {
      try {
        if (!isG1) {
          if (!fallbackData) {
            throw new Error("Replay unavailable: no URDF trajectory data");
          }
          if (!cancelled) {
            setStatus("ready");
          }
          return;
        }

        const firstRow = initialChartData[0];
        if (!firstRow) {
          throw new Error("Replay unavailable: no trajectory data");
        }

        const orderedColumns = extractOrderedG1StateColumns(firstRow);
        buildG1QposFrame(firstRow, orderedColumns);

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

    init();

    return () => {
      cancelled = true;
    };
  }, [fallbackData, initialChartData, isG1]);

  useEffect(() => {
    if (!isPlaying || status !== "ready") return;

    const timer = window.setInterval(
      () => {
        setFrame((current) => (current + 1) % initialChartData.length);
      },
      1000 / Math.max(datasetInfo.fps || 30, 1),
    );

    return () => window.clearInterval(timer);
  }, [datasetInfo.fps, initialChartData.length, isPlaying, status]);

  if (status === "loading") {
    return <div className="p-6 text-slate-200">Loading Replay…</div>;
  }

  if (status === "error") {
    return <div className="p-6 text-red-400">Replay unavailable: {error}</div>;
  }

  if (!isG1 && fallbackData) {
    return <URDFViewer data={fallbackData} />;
  }

  if (fallbackData) {
    return <MujocoSimViewer data={fallbackData} showPhysicsToggle={false} />;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-sm text-slate-200">Episode {episodeId}</div>
      <div className="text-xs text-slate-400">
        Frame {frame}/{Math.max(initialChartData.length - 1, 0)}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setIsPlaying((value) => !value)}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            setIsPlaying(false);
            setFrame(0);
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
