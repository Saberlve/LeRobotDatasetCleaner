import { NextResponse } from "next/server";

import {
  loadLocalDatasetRegistry,
  removeLocalDatasetRegistryEntry,
} from "@/server/local-datasets/registry";

export async function GET() {
  try {
    return NextResponse.json({
      entries: await loadLocalDatasetRegistry(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "本地数据集注册表读取失败",
      },
      { status: 500 },
    );
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function DELETE(request: Request) {
  try {
    const payload: unknown = await request.json();
    if (
      !isObjectRecord(payload) ||
      typeof payload.repoId !== "string" ||
      typeof payload.path !== "string"
    ) {
      return NextResponse.json(
        { error: "请求体必须包含 repoId 和 path 字符串。" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await removeLocalDatasetRegistryEntry({
        repoId: payload.repoId,
        path: payload.path,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "本地数据集注册表删除失败",
      },
      { status: 500 },
    );
  }
}
