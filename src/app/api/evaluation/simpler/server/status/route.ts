import { NextResponse } from "next/server";

import { getSimplerModelServerStatus } from "@/server/evaluation-model-server/service";

export async function GET() {
  return NextResponse.json(await getSimplerModelServerStatus());
}
