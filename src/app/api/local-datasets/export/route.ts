import { NextResponse } from "next/server";

import { exportFilteredDataset } from "@/server/dataset-export/exporter";

class ClientInputError extends Error {}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseExportPayload(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    throw new ClientInputError(
      "请求体必须包含 repoId、flaggedEpisodeIds、mode 和 outputPath。",
    );
  }

  if (
    !isObjectRecord(payload) ||
    typeof payload.repoId !== "string" ||
    !Array.isArray(payload.flaggedEpisodeIds) ||
    typeof payload.mode !== "string" ||
    typeof payload.outputPath !== "string"
  ) {
    throw new ClientInputError(
      "请求体必须包含 repoId、flaggedEpisodeIds、mode 和 outputPath。",
    );
  }

  if (!payload.flaggedEpisodeIds.every((value) => typeof value === "number")) {
    throw new ClientInputError("请求体中的 flaggedEpisodeIds 必须是数字数组。");
  }

  if (payload.alias != null && typeof payload.alias !== "string") {
    throw new ClientInputError("请求体中的 alias 必须是字符串。");
  }
  const rawIntervals = payload.removedFrameIntervals;
  if (
    rawIntervals != null &&
    (!isObjectRecord(rawIntervals) ||
      !Object.entries(rawIntervals).every(
        ([episodeId, intervals]) =>
          /^\d+$/.test(episodeId) &&
          Array.isArray(intervals) &&
          intervals.every(
            (interval) =>
              isObjectRecord(interval) &&
              typeof interval.start === "number" &&
              typeof interval.end === "number",
          ),
      ))
  ) {
    throw new ClientInputError(
      "removedFrameIntervals 必须是按 episode 编号组织的帧区间。",
    );
  }

  return {
    repoId: payload.repoId,
    flaggedEpisodeIds: payload.flaggedEpisodeIds,
    mode: payload.mode as "flagged" | "unflagged",
    outputPath: payload.outputPath,
    alias: payload.alias ?? "",
    ...(rawIntervals != null
      ? {
          removedFrameIntervals: rawIntervals as Record<
            number,
            Array<{ start: number; end: number }>
          >,
        }
      : {}),
  };
}

export async function POST(request: Request) {
  try {
    const payload = await parseExportPayload(request);
    return NextResponse.json(await exportFilteredDataset(payload));
  } catch (error) {
    if (error instanceof ClientInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "过滤导出失败，请检查输入和磁盘状态。",
      },
      { status: 500 },
    );
  }
}
