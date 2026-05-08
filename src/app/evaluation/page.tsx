import React from "react";

import { EvaluationDashboardView } from "@/components/thesis/evaluation-dashboard";
import { ThesisSiteShell } from "@/components/thesis/site-shell";
import { loadEvaluationDashboard } from "@/server/eval-results/summary";

export default async function EvaluationPage() {
  const dashboard = await loadEvaluationDashboard();

  return (
    <ThesisSiteShell>
      <EvaluationDashboardView dashboard={dashboard} />
    </ThesisSiteShell>
  );
}
