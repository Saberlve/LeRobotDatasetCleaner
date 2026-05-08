import { NextResponse } from "next/server";

import { loadEvaluationDashboard } from "@/server/eval-results/summary";

export async function GET() {
  const dashboard = await loadEvaluationDashboard();
  return NextResponse.json(dashboard);
}
