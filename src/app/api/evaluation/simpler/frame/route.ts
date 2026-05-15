import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import {
  SimplerLaunchError,
  resolveSimplerFramePath,
} from "@/server/simpler-launch/service";

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

    const filePath = await resolveSimplerFramePath(runId);
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "image/jpeg",
      },
    });
  } catch (error) {
    if (error instanceof SimplerLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: "Failed to load SimplerEnv frame" },
      { status: 500 },
    );
  }
}
