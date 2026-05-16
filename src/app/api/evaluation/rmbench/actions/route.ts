import { NextResponse } from "next/server";

import {
  readRmbenchEvaluationActions,
  RmbenchLaunchError,
} from "@/server/rmbench-launch/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const runId = requestUrl.searchParams.get("runId");
    if (!runId) {
      return NextResponse.json({ error: "Missing RMBench runId" }, { status: 400 });
    }

    const afterStep = Number(requestUrl.searchParams.get("afterStep") ?? "0");
    return NextResponse.json(
      await readRmbenchEvaluationActions(
        runId,
        undefined,
        Number.isFinite(afterStep) ? afterStep : 0,
      ),
    );
  } catch (error) {
    if (error instanceof RmbenchLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to load RMBench actions" },
      { status: 500 },
    );
  }
}
