"use client";

import React, { useState } from "react";
import {
  saveBatchResults,
  useBatchResults,
} from "@/lib/initial-idle/use-batch-results";
import type { IdleEdge } from "@/lib/initial-idle/batch";

export function BatchReviewCheckbox({
  repoId,
  episodeId,
  edge,
  disabled = false,
}: {
  repoId: string;
  episodeId: number;
  edge: IdleEdge;
  disabled?: boolean;
}) {
  const entries = useBatchResults(repoId);
  const [error, setError] = useState(false);
  const entry = entries.find(
    (item) => item.episodeId === episodeId && item.edge === edge,
  );
  if (!entry || (!entry.error && entry.result?.status !== "needs_review"))
    return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={entry.reviewed === true}
          disabled={disabled}
          aria-label={`Episode ${episodeId} ${edge === "start" ? "开头" : "结尾"}是否复核`}
          onChange={(event) => {
            const next = entries.map((item) =>
              item === entry
                ? { ...item, reviewed: event.target.checked }
                : item,
            );
            setError(!saveBatchResults(repoId, next));
          }}
        />
        是否复核
      </label>
      {error && (
        <span role="alert" className="text-amber-300 text-xs">
          复核状态未能保存，刷新后需重新勾选。
        </span>
      )}
    </span>
  );
}
