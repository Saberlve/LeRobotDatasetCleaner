# Filtered Dataset Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app export of `flagged` or `unflagged` episodes into a new valid local LeRobot dataset directory without modifying the source dataset.

**Architecture:** Keep export logic server-side and split it into focused modules: selection planning, source dataset inspection, dataset writing, and API orchestration. Reuse the existing local dataset registry and filtering UI, and drive the work with fixture-backed tests so metadata rewriting and episode remapping are proven before the UI is wired.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, Node `fs/promises`, existing local dataset registry utilities

---

### Task 1: Lock Down Episode Selection And Export Naming

**Files:**

- Create: `src/server/dataset-export/selection.ts`
- Create: `src/server/dataset-export/__tests__/selection.test.ts`
- Modify: `src/server/local-datasets/registry.ts`
- Modify: `src/server/local-datasets/__tests__/registry.test.ts`

- [ ] **Step 1: Write the failing selection tests**

```ts
import { describe, expect, test } from "vitest";

import {
  buildEpisodeSelectionPlan,
  defaultExportAlias,
} from "@/server/dataset-export/selection";

describe("buildEpisodeSelectionPlan", () => {
  test("keeps flagged episodes and remaps them densely", () => {
    expect(
      buildEpisodeSelectionPlan({
        totalEpisodes: 6,
        flaggedEpisodeIds: [4, 1, 4],
        mode: "flagged",
      }),
    ).toMatchObject({
      keptEpisodeIds: [1, 4],
      droppedEpisodeIds: [0, 2, 3, 5],
      episodeIdMap: { 1: 0, 4: 1 },
      newTotalEpisodes: 2,
    });
  });

  test("keeps unflagged episodes and remaps them densely", () => {
    expect(
      buildEpisodeSelectionPlan({
        totalEpisodes: 5,
        flaggedEpisodeIds: [1, 3],
        mode: "unflagged",
      }),
    ).toMatchObject({
      keptEpisodeIds: [0, 2, 4],
      droppedEpisodeIds: [1, 3],
      episodeIdMap: { 0: 0, 2: 1, 4: 2 },
      newTotalEpisodes: 3,
    });
  });

  test("rejects out-of-range episode ids", () => {
    expect(() =>
      buildEpisodeSelectionPlan({
        totalEpisodes: 3,
        flaggedEpisodeIds: [3],
        mode: "flagged",
      }),
    ).toThrow("Flagged episode id 3 is out of range");
  });

  test("rejects empty flagged export", () => {
    expect(() =>
      buildEpisodeSelectionPlan({
        totalEpisodes: 4,
        flaggedEpisodeIds: [],
        mode: "flagged",
      }),
    ).toThrow("没有可导出的 flagged episodes");
  });

  test("rejects empty unflagged export", () => {
    expect(() =>
      buildEpisodeSelectionPlan({
        totalEpisodes: 2,
        flaggedEpisodeIds: [0, 1],
        mode: "unflagged",
      }),
    ).toThrow("没有可导出的 unflagged episodes");
  });
});

describe("defaultExportAlias", () => {
  test("adds mode suffix to local repo display name", () => {
    expect(defaultExportAlias("local/demo_box", "flagged")).toBe(
      "demo_box_flagged",
    );
    expect(defaultExportAlias("local/demo_box", "unflagged")).toBe(
      "demo_box_unflagged",
    );
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- src/server/dataset-export/__tests__/selection.test.ts src/server/local-datasets/__tests__/registry.test.ts`

Expected: FAIL with `Cannot find module '@/server/dataset-export/selection'` and missing export helper errors.

- [ ] **Step 3: Add the minimal selection implementation**

```ts
export type ExportMode = "flagged" | "unflagged";

export type EpisodeSelectionPlan = {
  mode: ExportMode;
  sourceEpisodeIds: number[];
  keptEpisodeIds: number[];
  droppedEpisodeIds: number[];
  episodeIdMap: Record<number, number>;
  newTotalEpisodes: number;
};

export function buildEpisodeSelectionPlan(input: {
  totalEpisodes: number;
  flaggedEpisodeIds: number[];
  mode: ExportMode;
}): EpisodeSelectionPlan {
  const sourceEpisodeIds = Array.from(
    { length: input.totalEpisodes },
    (_, index) => index,
  );
  const flaggedEpisodeIds = [...new Set(input.flaggedEpisodeIds)].sort(
    (a, b) => a - b,
  );

  for (const episodeId of flaggedEpisodeIds) {
    if (
      !Number.isInteger(episodeId) ||
      episodeId < 0 ||
      episodeId >= input.totalEpisodes
    ) {
      throw new Error(`Flagged episode id ${episodeId} is out of range`);
    }
  }

  const flaggedSet = new Set(flaggedEpisodeIds);
  const keptEpisodeIds =
    input.mode === "flagged"
      ? flaggedEpisodeIds
      : sourceEpisodeIds.filter((episodeId) => !flaggedSet.has(episodeId));

  if (keptEpisodeIds.length === 0) {
    throw new Error(
      input.mode === "flagged"
        ? "没有可导出的 flagged episodes"
        : "没有可导出的 unflagged episodes",
    );
  }

  const droppedEpisodeIds = sourceEpisodeIds.filter(
    (episodeId) => !keptEpisodeIds.includes(episodeId),
  );
  const episodeIdMap = Object.fromEntries(
    keptEpisodeIds.map((episodeId, nextEpisodeId) => [
      episodeId,
      nextEpisodeId,
    ]),
  );

  return {
    mode: input.mode,
    sourceEpisodeIds,
    keptEpisodeIds,
    droppedEpisodeIds,
    episodeIdMap,
    newTotalEpisodes: keptEpisodeIds.length,
  };
}

export function defaultExportAlias(repoId: string, mode: ExportMode): string {
  const displayName = repoId.replace(/^local\//, "");
  return `${displayName}_${mode}`;
}
```

- [ ] **Step 4: Expose a registry helper for alias defaults**

```ts
export function buildExportRepoId(
  sourceRepoId: string,
  customAlias: string,
  mode: ExportMode,
): string {
  const alias = customAlias.trim() || defaultExportAlias(sourceRepoId, mode);
  return buildLocalRepoId(alias, alias);
}
```

If `buildExportRepoId` is awkward in `registry.ts`, keep `buildLocalRepoId()` unchanged and add a focused helper there that accepts a source repo id and mode but still reuses alias normalization.

- [ ] **Step 5: Extend registry tests for export alias fallback**

```ts
test("buildLocalRepoId falls back to dataset basename when alias is empty", () => {
  expect(buildLocalRepoId("/tmp/datasets/demo_box", "")).toBe("local/demo_box");
});
```

- [ ] **Step 6: Run tests to verify green**

Run: `npm test -- src/server/dataset-export/__tests__/selection.test.ts src/server/local-datasets/__tests__/registry.test.ts`

Expected: PASS for the new selection tests and existing registry coverage.

- [ ] **Step 7: Commit**

```bash
git add src/server/dataset-export/selection.ts src/server/dataset-export/__tests__/selection.test.ts src/server/local-datasets/registry.ts src/server/local-datasets/__tests__/registry.test.ts
git commit -m "test: add dataset export selection coverage"
```

### Task 2: Prove Fixture-Based Dataset Export On The Server

**Files:**

- Create: `src/server/dataset-export/inspect.ts`
- Create: `src/server/dataset-export/write.ts`
- Create: `src/server/dataset-export/exporter.ts`
- Create: `src/server/dataset-export/__tests__/exporter.test.ts`
- Create: `src/server/dataset-export/__tests__/fixtures/minimal-v21/meta/info.json`
- Create: `src/server/dataset-export/__tests__/fixtures/minimal-v21/meta/episodes.jsonl`
- Create: `src/server/dataset-export/__tests__/fixtures/minimal-v21/data/episode_000000.json`
- Create: `src/server/dataset-export/__tests__/fixtures/minimal-v21/data/episode_000001.json`
- Create: `src/server/dataset-export/__tests__/fixtures/minimal-v21/data/episode_000002.json`

- [ ] **Step 1: Write the failing exporter integration test**

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { exportFilteredDataset } from "@/server/dataset-export/exporter";

describe("exportFilteredDataset", () => {
  let tempRoot: string;
  let datasetRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "visualizer-export-"));
    datasetRoot = path.join(tempRoot, "demo_v21");
    await fs.cp(
      path.resolve("src/server/dataset-export/__tests__/fixtures/minimal-v21"),
      datasetRoot,
      { recursive: true },
    );
    process.env.LOCAL_DATASET_REGISTRY_PATH = path.join(
      tempRoot,
      "registry.json",
    );
  });

  afterEach(async () => {
    delete process.env.LOCAL_DATASET_REGISTRY_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test("exports unflagged episodes into a new local dataset directory", async () => {
    const outputPath = path.join(tempRoot, "demo_v21_unflagged");

    const result = await exportFilteredDataset({
      repoId: "local/demo_v21",
      datasetPath: datasetRoot,
      flaggedEpisodeIds: [1],
      mode: "unflagged",
      outputPath,
      alias: "demo_v21_unflagged",
    });

    const exportedInfo = JSON.parse(
      await fs.readFile(path.join(outputPath, "meta", "info.json"), "utf8"),
    );
    const exportedEpisodes = (
      await fs.readFile(path.join(outputPath, "meta", "episodes.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    expect(result.repoId).toBe("local/demo_v21_unflagged");
    expect(exportedInfo.total_episodes).toBe(2);
    expect(
      exportedEpisodes.map(
        (entry: { episode_index: number }) => entry.episode_index,
      ),
    ).toEqual([0, 1]);
    await expect(
      fs.access(path.join(outputPath, "data", "episode_000002.json")),
    ).rejects.toThrow();
    expect(result.entryRoute).toBe("/local/demo_v21_unflagged/episode_0");
  });
});
```

- [ ] **Step 2: Run the exporter test to verify it fails**

Run: `npm test -- src/server/dataset-export/__tests__/exporter.test.ts`

Expected: FAIL because `exportFilteredDataset` and fixture-aware export helpers do not exist yet.

- [ ] **Step 3: Create a minimal fixture format and inspection contract**

Use a deliberately small fixture that mirrors the project’s local-dataset assumptions without needing real parquet bytes first.

```json
{
  "codebase_version": "v2.1",
  "total_episodes": 3,
  "fps": 30,
  "robot_type": "SO101",
  "data_path": "data/episode_{episode_index:06d}.json"
}
```

```json
{"episode_index":0,"tasks":["pick"],"data_file":"data/episode_000000.json"}
{"episode_index":1,"tasks":["pick"],"data_file":"data/episode_000001.json"}
{"episode_index":2,"tasks":["pick"],"data_file":"data/episode_000002.json"}
```

Document the fixture assumption inline in the test file so later real-parquet support can replace the JSON payloads without changing the plan shape.

- [ ] **Step 4: Implement minimal inspection and write helpers for the fixture-backed path**

```ts
export type DatasetExportInspection = {
  datasetPath: string;
  info: Record<string, unknown>;
  episodes: Array<{
    episodeIndex: number;
    dataFile: string;
    raw: Record<string, unknown>;
  }>;
};

export async function inspectExportableDataset(
  datasetPath: string,
): Promise<DatasetExportInspection> {
  const info = JSON.parse(
    await fs.readFile(path.join(datasetPath, "meta", "info.json"), "utf8"),
  );
  const episodes = (
    await fs.readFile(path.join(datasetPath, "meta", "episodes.jsonl"), "utf8")
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .map((raw) => ({
      episodeIndex: Number(raw.episode_index),
      dataFile: String(raw.data_file),
      raw,
    }));

  return { datasetPath, info, episodes };
}
```

```ts
export async function writeFilteredDataset(input: {
  inspection: DatasetExportInspection;
  selection: EpisodeSelectionPlan;
  outputPath: string;
}): Promise<void> {
  await fs.mkdir(path.join(input.outputPath, "meta"), { recursive: true });
  await fs.mkdir(path.join(input.outputPath, "data"), { recursive: true });

  const rewrittenEpisodes = input.selection.keptEpisodeIds.map(
    (sourceEpisodeId) => {
      const episode = input.inspection.episodes.find(
        (item) => item.episodeIndex === sourceEpisodeId,
      );
      if (!episode)
        throw new Error(`Missing episode metadata for ${sourceEpisodeId}`);

      const nextEpisodeIndex = input.selection.episodeIdMap[sourceEpisodeId];
      const nextDataFile = `data/episode_${String(nextEpisodeIndex).padStart(6, "0")}.json`;
      return {
        ...episode.raw,
        episode_index: nextEpisodeIndex,
        data_file: nextDataFile,
        source_episode_index: sourceEpisodeId,
      };
    },
  );

  await fs.writeFile(
    path.join(input.outputPath, "meta", "episodes.jsonl"),
    `${rewrittenEpisodes.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );

  await fs.writeFile(
    path.join(input.outputPath, "meta", "info.json"),
    JSON.stringify(
      {
        ...input.inspection.info,
        total_episodes: input.selection.newTotalEpisodes,
      },
      null,
      2,
    ),
    "utf8",
  );
}
```

- [ ] **Step 5: Implement the export orchestrator and registry hookup**

```ts
export async function exportFilteredDataset(input: {
  repoId: string;
  datasetPath: string;
  flaggedEpisodeIds: number[];
  mode: ExportMode;
  outputPath: string;
  alias?: string;
}) {
  const inspection = await inspectExportableDataset(input.datasetPath);
  const selection = buildEpisodeSelectionPlan({
    totalEpisodes: Number(inspection.info.total_episodes),
    flaggedEpisodeIds: input.flaggedEpisodeIds,
    mode: input.mode,
  });

  await writeFilteredDataset({
    inspection,
    selection,
    outputPath: input.outputPath,
  });

  const entry = await registerLocalDataset({
    datasetPath: input.outputPath,
    alias: input.alias ?? defaultExportAlias(input.repoId, input.mode),
  });

  return {
    repoId: entry.repoId,
    path: input.outputPath,
    mode: input.mode,
    totalEpisodes: selection.newTotalEpisodes,
    entryRoute: `/${entry.repoId}/episode_0`,
    summary: {
      sourceRepoId: input.repoId,
      sourceTotalEpisodes: Number(inspection.info.total_episodes),
      exportedEpisodes: selection.newTotalEpisodes,
      droppedEpisodes: selection.droppedEpisodeIds.length,
    },
  };
}
```

- [ ] **Step 6: Run the exporter test and expand it for overwrite rejection**

Add:

```ts
test("rejects exporting into an existing directory", async () => {
  const outputPath = path.join(tempRoot, "existing-output");
  await fs.mkdir(outputPath, { recursive: true });

  await expect(
    exportFilteredDataset({
      repoId: "local/demo_v21",
      datasetPath: datasetRoot,
      flaggedEpisodeIds: [1],
      mode: "flagged",
      outputPath,
      alias: "demo_v21_flagged",
    }),
  ).rejects.toThrow("输出目录已存在");
});
```

Run: `npm test -- src/server/dataset-export/__tests__/exporter.test.ts`

Expected: PASS for successful export and overwrite rejection.

- [ ] **Step 7: Commit**

```bash
git add src/server/dataset-export/inspect.ts src/server/dataset-export/write.ts src/server/dataset-export/exporter.ts src/server/dataset-export/__tests__/exporter.test.ts src/server/dataset-export/__tests__/fixtures/minimal-v21
git commit -m "feat: add server-side filtered dataset exporter"
```

### Task 3: Add The Export API Route And API Validation Coverage

**Files:**

- Create: `src/app/api/local-datasets/export/route.ts`
- Create: `src/app/api/local-datasets/export/__tests__/route.test.ts`
- Modify: `src/server/dataset-export/exporter.ts`

- [ ] **Step 1: Write the failing API tests**

```ts
import { describe, expect, test, vi } from "vitest";

const exportFilteredDataset = vi.fn();

vi.mock("@/server/dataset-export/exporter", () => ({
  exportFilteredDataset,
}));

describe("POST /api/local-datasets/export", () => {
  test("returns 400 for invalid payloads", async () => {
    const { POST } = await import("@/app/api/local-datasets/export/route");
    const response = await POST(
      new Request("http://localhost/api/local-datasets/export", {
        method: "POST",
        body: JSON.stringify({ repoId: "local/demo", mode: "flagged" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "请求体必须包含 repoId、flaggedEpisodeIds、mode 和 outputPath。",
    });
  });

  test("passes parsed values to exporter and returns JSON result", async () => {
    exportFilteredDataset.mockResolvedValue({
      repoId: "local/demo_unflagged",
      path: "/tmp/demo_unflagged",
      mode: "unflagged",
      totalEpisodes: 4,
      entryRoute: "/local/demo_unflagged/episode_0",
      summary: {
        sourceRepoId: "local/demo",
        sourceTotalEpisodes: 5,
        exportedEpisodes: 4,
        droppedEpisodes: 1,
      },
    });

    const { POST } = await import("@/app/api/local-datasets/export/route");
    const response = await POST(
      new Request("http://localhost/api/local-datasets/export", {
        method: "POST",
        body: JSON.stringify({
          repoId: "local/demo",
          flaggedEpisodeIds: [1],
          mode: "unflagged",
          outputPath: "/tmp/demo_unflagged",
          alias: "demo_unflagged",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(exportFilteredDataset).toHaveBeenCalledWith({
      repoId: "local/demo",
      flaggedEpisodeIds: [1],
      mode: "unflagged",
      outputPath: "/tmp/demo_unflagged",
      alias: "demo_unflagged",
    });
  });
});
```

- [ ] **Step 2: Run the API tests to verify red**

Run: `npm test -- src/app/api/local-datasets/export/__tests__/route.test.ts`

Expected: FAIL because the route file does not exist.

- [ ] **Step 3: Implement payload parsing and error mapping**

```ts
class ClientInputError extends Error {}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function parseExportPayload(request: Request) {
  const payload = await request.json();

  if (
    !isObjectRecord(payload) ||
    typeof payload.repoId !== "string" ||
    !Array.isArray(payload.flaggedEpisodeIds) ||
    typeof payload.mode !== "string" ||
    typeof payload.outputPath !== "string"
  ) {
    throw new ClientInputError(
      "请求体必须包含 repoId、flaggedEpisodeIds、mode 和 outputPath。",
    );
  }

  if (payload.alias != null && typeof payload.alias !== "string") {
    throw new ClientInputError("请求体中的 alias 必须是字符串。");
  }

  return {
    repoId: payload.repoId,
    flaggedEpisodeIds: payload.flaggedEpisodeIds,
    mode: payload.mode,
    outputPath: payload.outputPath,
    alias: payload.alias ?? "",
  };
}
```

```ts
export async function POST(request: Request) {
  try {
    const payload = await parseExportPayload(request);
    return NextResponse.json(await exportFilteredDataset(payload));
  } catch (error) {
    if (error instanceof ClientInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "过滤导出失败，请检查输入和磁盘状态。",
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Add exporter input validation for local-only repo ids**

```ts
if (!input.repoId.startsWith("local/")) {
  throw new Error("只能导出本地数据集。");
}

if (!input.outputPath.trim()) {
  throw new Error("输出目录不能为空。");
}
```

- [ ] **Step 5: Run API and exporter tests to verify green**

Run: `npm test -- src/app/api/local-datasets/export/__tests__/route.test.ts src/server/dataset-export/__tests__/exporter.test.ts`

Expected: PASS with valid payload forwarding and user-facing error messages.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/local-datasets/export/route.ts src/app/api/local-datasets/export/__tests__/route.test.ts src/server/dataset-export/exporter.ts
git commit -m "feat: add filtered dataset export api"
```

### Task 4: Wire The Filtering UI To The Export API

**Files:**

- Modify: `src/components/filtering-panel.tsx`
- Create: `src/components/__tests__/filtering-panel.test.tsx`

- [ ] **Step 1: Write the failing UI tests**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import FilteringPanel from "@/components/filtering-panel";
import { FlaggedEpisodesProvider } from "@/context/flagged-episodes-context";

describe("FilteringPanel export controls", () => {
  test("disables flagged export when nothing is flagged", () => {
    render(
      <FlaggedEpisodesProvider>
        <FilteringPanel
          repoId="local/demo_v21"
          crossEpisodeData={null}
          crossEpisodeLoading={false}
          episodeLengthStats={null}
          flatChartData={[]}
        />
      </FlaggedEpisodesProvider>,
    );

    expect(screen.getByRole("button", { name: "导出数据集" })).toBeDisabled();
  });

  test("submits export request and shows open-result action", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          repoId: "local/demo_v21_unflagged",
          path: "/tmp/demo_v21_unflagged",
          mode: "unflagged",
          totalEpisodes: 2,
          entryRoute: "/local/demo_v21_unflagged/episode_0",
          summary: {
            sourceRepoId: "local/demo_v21",
            sourceTotalEpisodes: 3,
            exportedEpisodes: 2,
            droppedEpisodes: 1,
          },
        }),
      ),
    );

    render(
      <FlaggedEpisodesProvider>
        <FilteringPanel
          repoId="local/demo_v21"
          crossEpisodeData={null}
          crossEpisodeLoading={false}
          episodeLengthStats={null}
          flatChartData={[]}
        />
      </FlaggedEpisodesProvider>,
    );

    fireEvent.click(screen.getByTitle("Flag for review"));
    fireEvent.change(screen.getByLabelText("导出模式"), {
      target: { value: "unflagged" },
    });
    fireEvent.change(screen.getByLabelText("输出目录"), {
      target: { value: "/tmp/demo_v21_unflagged" },
    });
    fireEvent.click(screen.getByRole("button", { name: "导出数据集" }));

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "打开导出结果" }),
      ).toHaveAttribute("href", "/local/demo_v21_unflagged/episode_0"),
    );
  });
});
```

If the project does not already include Testing Library, add the dependency first or adapt the test to the existing React/Vitest setup before implementing UI code.

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `npm test -- src/components/__tests__/filtering-panel.test.tsx`

Expected: FAIL because the export controls are not rendered yet.

- [ ] **Step 3: Add the export form to the flagged section**

Implement a focused child component inside `src/components/filtering-panel.tsx` first, then extract it only if the file becomes unmanageable.

```tsx
function FlaggedExportCard({
  repoId,
  flaggedIds,
  totalEpisodes,
}: {
  repoId: string;
  flaggedIds: number[];
  totalEpisodes: number | null;
}) {
  const [mode, setMode] = useState<"flagged" | "unflagged">("flagged");
  const [outputPath, setOutputPath] = useState("");
  const [alias, setAlias] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | {
    entryRoute: string;
    repoId: string;
    totalEpisodes: number;
  }>(null);
  const [error, setError] = useState<string | null>(null);

  const isLocalRepo = repoId.startsWith("local/");
  const disableForMode =
    mode === "flagged"
      ? flaggedIds.length === 0
      : totalEpisodes != null && flaggedIds.length >= totalEpisodes;
  const disabled =
    !isLocalRepo || !outputPath.trim() || disableForMode || submitting;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/local-datasets/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId,
          flaggedEpisodeIds: flaggedIds,
          mode,
          outputPath,
          alias,
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "过滤导出失败");
      setResult(payload);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "过滤导出失败",
      );
    } finally {
      setSubmitting(false);
    }
  }
}
```

- [ ] **Step 4: Add a total-episodes input to `FlaggedIdsCopyBar`**

Pass the total episode count down from `FilteringPanel` using:

```ts
const totalEpisodes =
  episodeLengthStats?.allEpisodeLengths?.length ??
  crossEpisodeData?.numEpisodes ??
  null;
```

This keeps the disable logic local to the export card and avoids re-reading dataset metadata from another endpoint.

- [ ] **Step 5: Run UI and API tests to verify green**

Run: `npm test -- src/components/__tests__/filtering-panel.test.tsx src/app/api/local-datasets/export/__tests__/route.test.ts`

Expected: PASS with disabled-state coverage and successful submission rendering.

- [ ] **Step 6: Commit**

```bash
git add src/components/filtering-panel.tsx src/components/__tests__/filtering-panel.test.tsx
git commit -m "feat: add filtering panel dataset export controls"
```

### Task 5: End-To-End Validation And Documentation Touch-Up

**Files:**

- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-23-filtered-dataset-export-design.md` (only if implementation deviates from the approved design)

- [ ] **Step 1: Add README usage notes for export**

Add a short section near the Filtering Panel description:

```md
- **Filtered Dataset Export:** Export flagged or unflagged episodes from a local dataset into a new LeRobot dataset directory while preserving the original dataset.
```

And in usage docs:

```md
To export a filtered local dataset:

1. Open a local dataset in the visualizer.
2. Flag episodes in the Filtering panel.
3. Choose `flagged` or `unflagged`, pick an output directory, and run export.
4. Open the exported dataset from the success link or recent local datasets list.
```

- [ ] **Step 2: Run focused verification**

Run: `npm test -- src/server/dataset-export/__tests__/selection.test.ts src/server/dataset-export/__tests__/exporter.test.ts src/app/api/local-datasets/export/__tests__/route.test.ts src/components/__tests__/filtering-panel.test.tsx`

Expected: PASS

Run: `npm run type-check`

Expected: PASS

- [ ] **Step 3: Run broader regression checks**

Run: `npm test -- src/server/local-datasets/__tests__/registry.test.ts src/server/local-datasets/__tests__/picker.test.ts src/app/[org]/[dataset]/[episode]/__tests__/fetch-data.test.ts`

Expected: PASS for local dataset registration, picker behavior, and episode fetch paths.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-04-23-filtered-dataset-export-design.md
git commit -m "docs: document filtered dataset export"
```

## Self-Review

- Spec coverage: the plan covers selection logic, server-side export orchestration, API shape, filtering UI, registry integration, and verification. The one deliberate narrowing is fixture-backed export first; when implementing Task 2, confirm the fixture structure matches a real local dataset layout before broadening to more versions.
- Placeholder scan: no `TODO`/`TBD` placeholders remain. The only conditional note is the Testing Library dependency check in Task 4; resolve it before editing UI code.
- Type consistency: `ExportMode`, `EpisodeSelectionPlan`, `exportFilteredDataset`, and the API payload fields are used consistently across tasks. Keep those names unchanged during implementation.
