import { NextResponse } from "next/server";

import {
  EvaluationModelServerError,
  stopSimplerModelServer,
} from "@/server/evaluation-model-server/service";

export async function POST() {
  try {
    return NextResponse.json(await stopSimplerModelServer());
  } catch (error) {
    if (error instanceof EvaluationModelServerError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "停止 Simpler 模型服务失败" },
      { status: 500 },
    );
  }
}
