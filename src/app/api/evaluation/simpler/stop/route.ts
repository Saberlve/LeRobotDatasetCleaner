import { NextResponse } from "next/server";

import {
  SimplerLaunchError,
  stopSimplerEvaluation,
} from "@/server/simpler-launch/service";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const body = raw ? (JSON.parse(raw) as { runId?: string | null }) : {};
    return NextResponse.json(await stopSimplerEvaluation(body.runId ?? undefined));
  } catch (error) {
    if (error instanceof SimplerLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to stop SimplerEnv evaluation" },
      { status: 500 },
    );
  }
}
