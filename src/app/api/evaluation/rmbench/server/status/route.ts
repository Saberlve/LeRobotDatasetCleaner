import { NextResponse } from "next/server";

import { getRmbenchModelServerStatus } from "@/server/evaluation-model-server/service";

export async function GET() {
  return NextResponse.json(await getRmbenchModelServerStatus());
}
