import React, { Suspense } from "react";

import { DatasetCleaningEntry } from "@/components/thesis/dataset-cleaning-entry";
import { ThesisSiteShell } from "@/components/thesis/site-shell";

export default function DatasetCleaningPage() {
  return (
    <ThesisSiteShell>
      <Suspense fallback={null}>
        <DatasetCleaningEntry />
      </Suspense>
    </ThesisSiteShell>
  );
}
