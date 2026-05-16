import { NextResponse } from "next/server";

import {
  launchRmbenchEvaluation,
  RmbenchLaunchError,
} from "@/server/rmbench-launch/service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { taskId?: string } | null;
    const taskId = body?.taskId ?? "swap_blocks";
    return NextResponse.json(await launchRmbenchEvaluation(taskId));
  } catch (error) {
    if (error instanceof RmbenchLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to launch RMBench evaluation" },
      { status: 500 },
    );
  }
}
