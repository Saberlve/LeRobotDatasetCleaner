import { NextResponse } from "next/server";

import {
  readRmbenchEvaluationLog,
  RmbenchLaunchError,
} from "@/server/rmbench-launch/service";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const runId = requestUrl.searchParams.get("runId");
    const source = requestUrl.searchParams.get("source");
    if (!runId) {
      return NextResponse.json({ error: "Missing RMBench runId" }, { status: 400 });
    }
    if (!source) {
      return NextResponse.json(
        { error: "Missing RMBench log source" },
        { status: 400 },
      );
    }

    return NextResponse.json(await readRmbenchEvaluationLog(runId, source));
  } catch (error) {
    if (error instanceof RmbenchLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to read RMBench logs" },
      { status: 500 },
    );
  }
}
