import React from "react";

import { EvaluationDashboardView } from "@/components/thesis/evaluation-dashboard";
import { loadEvaluationDashboard } from "@/server/eval-results/summary";

export default async function EvaluationReplayPage() {
  const dashboard = await loadEvaluationDashboard();

  return <EvaluationDashboardView dashboard={dashboard} mode="replay" />;
}
