import { NextResponse } from "next/server";

import { getSimplerEvaluationStatus } from "@/server/simpler-launch/service";

export async function GET() {
  return NextResponse.json(await getSimplerEvaluationStatus());
}
