import { NextResponse } from "next/server";

import {
  createSimplerFrameStream,
  FRAME_STREAM_CONTENT_TYPE,
  SimplerLaunchError,
} from "@/server/simpler-launch/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const runId = requestUrl.searchParams.get("runId");
    if (!runId) {
      return NextResponse.json(
        { error: "Missing SimplerEnv runId" },
        { status: 400 },
      );
    }

    const stream = await createSimplerFrameStream(runId);
    return new Response(stream, {
      status: 200,
      headers: {
        "cache-control":
          "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, no-transform",
        connection: "keep-alive",
        "content-type": FRAME_STREAM_CONTENT_TYPE,
        expires: "0",
        pragma: "no-cache",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof SimplerLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to stream SimplerEnv frame" },
      { status: 500 },
    );
  }
}
