import React from "react";

import { SimplerLaunchPanel } from "@/components/evaluation/simpler-launch-panel";

export function EvaluationLaunchPageView() {
  return (
    <main className="min-h-screen bg-[oklch(0.96_0.018_75)] px-4 pb-10 pt-6 text-[oklch(0.25_0.025_62)] md:px-6 md:pt-8">
      <div className="mx-auto grid max-w-7xl gap-5">
        <SimplerLaunchPanel />
      </div>
    </main>
  );
}
