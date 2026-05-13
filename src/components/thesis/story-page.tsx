import React from "react";

import { AnalysisPage } from "./story-page/analysis-page";
import { ConclusionPage } from "./story-page/conclusion-page";
import { MethodPage } from "./story-page/method-page";
import { ProblemPage } from "./story-page/problem-page";
import { ResultsPage } from "./story-page/results-page";
import { SystemsPage } from "./story-page/systems-page";
import type { StoryPageProps } from "./story-page/types";

export function StoryPage({ page }: StoryPageProps) {
  if (page.href === "/why-memory") return <ProblemPage page={page} />;
  if (page.href === "/method") return <MethodPage page={page} />;
  if (page.href === "/memory-systems") return <SystemsPage page={page} />;
  if (page.href === "/results") return <ResultsPage page={page} />;
  if (page.href === "/analysis") return <AnalysisPage page={page} />;
  return <ConclusionPage page={page} />;
}
