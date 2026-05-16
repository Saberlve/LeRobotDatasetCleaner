import { NextResponse } from "next/server";

import {
  createRmbenchFrameStream,
  FRAME_STREAM_CONTENT_TYPE,
  RmbenchLaunchError,
} from "@/server/rmbench-launch/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const runId = requestUrl.searchParams.get("runId");
    const camera = requestUrl.searchParams.get("camera");
    if (!runId) {
      return NextResponse.json({ error: "Missing RMBench runId" }, { status: 400 });
    }
    if (!camera) {
      return NextResponse.json({ error: "Missing RMBench camera" }, { status: 400 });
    }

    const stream = await createRmbenchFrameStream(runId, camera);
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
    if (error instanceof RmbenchLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to stream RMBench frame" },
      { status: 500 },
    );
  }
}
