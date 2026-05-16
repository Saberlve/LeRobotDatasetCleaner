import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import {
  resolveRmbenchFramePath,
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

    const filePath = await resolveRmbenchFramePath(runId, camera);
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "cache-control":
          "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, no-transform",
        "content-type": "image/jpeg",
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
      { error: "Failed to load RMBench frame" },
      { status: 500 },
    );
  }
}
