import { NextResponse } from "next/server";

import {
  EvaluationModelServerError,
  startSimplerModelServer,
} from "@/server/evaluation-model-server/service";

export async function POST() {
  try {
    return NextResponse.json(await startSimplerModelServer());
  } catch (error) {
    if (error instanceof EvaluationModelServerError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "启动 Simpler 模型服务失败" },
      { status: 500 },
    );
  }
}
