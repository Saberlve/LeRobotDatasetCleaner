import { NextResponse } from "next/server";

import {
  SimplerLaunchError,
  launchSimplerEvaluation,
} from "@/server/simpler-launch/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const taskId =
      body && typeof body === "object" && "taskId" in body ? body.taskId : null;
    if (typeof taskId !== "string") {
      return NextResponse.json(
        { error: "请求体必须包含 taskId。" },
        { status: 400 },
      );
    }
    return NextResponse.json(await launchSimplerEvaluation(taskId));
  } catch (error) {
    if (error instanceof SimplerLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to launch SimplerEnv evaluation" },
      { status: 500 },
    );
  }
}
