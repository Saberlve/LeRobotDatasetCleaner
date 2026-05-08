import { NextRequest, NextResponse } from "next/server";

import { updateTrainingConfig } from "@/server/eval-results/training-config";

export async function POST(request: NextRequest) {
  try {
    const patch = await request.json();
    const result = await updateTrainingConfig(patch);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update config",
      },
      { status: 400 },
    );
  }
}
