import { NextResponse } from "next/server";

import { getRmbenchEvaluationStatus } from "@/server/rmbench-launch/service";

export async function GET() {
  return NextResponse.json(await getRmbenchEvaluationStatus());
}
