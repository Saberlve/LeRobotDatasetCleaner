import { NextResponse } from "next/server";

import { registerLocalDataset } from "@/server/local-datasets/registry";

class ClientInputError extends Error {}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseRegisterPayload(request: Request): Promise<{ path: string; alias: string }> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    throw new ClientInputError("请求体必须是 JSON 对象，且包含 path 字符串。");
  }

  if (!isObjectRecord(payload) || typeof payload.path !== "string") {
    throw new ClientInputError("请求体必须是 JSON 对象，且包含 path 字符串。");
  }

  if (payload.alias != null && typeof payload.alias !== "string") {
    throw new ClientInputError("请求体中的 alias 必须是字符串。");
  }

  return {
    path: payload.path,
    alias: payload.alias ?? "",
  };
}

export async function POST(request: Request) {
  try {
    const payload = await parseRegisterPayload(request);
    const entry = await registerLocalDataset({
      datasetPath: payload.path,
      alias: payload.alias,
    });

    return NextResponse.json({
      repoId: entry.repoId,
      summary: entry,
      entryRoute: `/${entry.repoId}/episode_0`,
    });
  } catch (error) {
    if (error instanceof ClientInputError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "本地数据集注册失败，请检查注册表或磁盘状态。",
      },
      { status: 500 },
    );
  }
}
