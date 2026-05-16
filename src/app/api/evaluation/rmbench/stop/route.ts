import { NextResponse } from "next/server";

import {
  RmbenchLaunchError,
  stopRmbenchEvaluation,
} from "@/server/rmbench-launch/service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { runId?: string } | null;
    return NextResponse.json(await stopRmbenchEvaluation(body?.runId));
  } catch (error) {
    if (error instanceof RmbenchLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to stop RMBench evaluation" },
      { status: 500 },
    );
  }
}
