import { NextResponse } from "next/server";

import {
  readSimplerEvaluationLog,
  SimplerLaunchError,
} from "@/server/simpler-launch/service";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const runId = requestUrl.searchParams.get("runId");
    const source = requestUrl.searchParams.get("source");
    if (!runId) {
      return NextResponse.json(
        { error: "Missing SimplerEnv runId" },
        { status: 400 },
      );
    }
    if (!source) {
      return NextResponse.json(
        { error: "Missing SimplerEnv log source" },
        { status: 400 },
      );
    }

    return NextResponse.json(await readSimplerEvaluationLog(runId, source), {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof SimplerLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to load SimplerEnv logs" },
      { status: 500 },
    );
  }
}
