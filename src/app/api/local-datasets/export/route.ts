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
    throw new ClientInputError("请求体必须包含 repoId、flaggedEpisodeIds、mode 和 outputPath。");
  }

  if (
    !isObjectRecord(payload) ||
    typeof payload.repoId !== "string" ||
    !Array.isArray(payload.flaggedEpisodeIds) ||
    typeof payload.mode !== "string" ||
    typeof payload.outputPath !== "string"
  ) {
    throw new ClientInputError("请求体必须包含 repoId、flaggedEpisodeIds、mode 和 outputPath。");
  }

  if (!payload.flaggedEpisodeIds.every((value) => typeof value === "number")) {
    throw new ClientInputError("请求体中的 flaggedEpisodeIds 必须是数字数组。");
  }

  if (payload.alias != null && typeof payload.alias !== "string") {
    throw new ClientInputError("请求体中的 alias 必须是字符串。");
  }

  return {
    repoId: payload.repoId,
    flaggedEpisodeIds: payload.flaggedEpisodeIds,
    mode: payload.mode as "flagged" | "unflagged",
    outputPath: payload.outputPath,
    alias: payload.alias ?? "",
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
        error: error instanceof Error ? error.message : "过滤导出失败，请检查输入和磁盘状态。",
      },
      { status: 500 },
    );
  }
}
