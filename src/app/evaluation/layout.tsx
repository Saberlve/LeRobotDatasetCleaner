import React from "react";

import { EvaluationWorkspaceNav } from "@/components/evaluation/evaluation-workspace-nav";

export default function EvaluationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <EvaluationWorkspaceNav />
      {children}
    </>
  );
}
