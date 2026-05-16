import { NextResponse } from "next/server";

import {
  readRmbenchModelServerLog,
  EvaluationModelServerError,
} from "@/server/evaluation-model-server/service";
import {
  EVALUATION_MODEL_SERVER_LOG_SOURCES,
  type EvaluationModelServerLogSource,
} from "@/types/evaluation-model-server";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const source = requestUrl.searchParams.get("source");
    if (!source) {
      return NextResponse.json(
        { error: "Missing model server log source" },
        { status: 400 },
      );
    }
    if (!EVALUATION_MODEL_SERVER_LOG_SOURCES.includes(source as EvaluationModelServerLogSource)) {
      return NextResponse.json(
        { error: "Invalid model server log source" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      await readRmbenchModelServerLog(source as EvaluationModelServerLogSource),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof EvaluationModelServerError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to load RMBench model server log" },
      { status: 500 },
    );
  }
}
