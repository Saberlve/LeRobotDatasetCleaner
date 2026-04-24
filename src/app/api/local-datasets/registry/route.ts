import { NextResponse } from "next/server";

import { loadLocalDatasetRegistry } from "@/server/local-datasets/registry";

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
