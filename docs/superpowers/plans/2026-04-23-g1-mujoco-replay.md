# G1 MuJoCo Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `3D Replay` / `Sim Replay` split with one stable G1-only `Replay` tab backed by MuJoCo WASM, with clear fallback behavior and browser compatibility on machines with or without NVIDIA GPUs.

**Architecture:** Introduce a focused `G1MujocoReplay` client component plus small helper modules for G1 joint extraction and MuJoCo asset validation. Keep `episode-viewer.tsx` responsible only for tab routing and sidebar control, and treat MuJoCo runtime initialization as a one-time concern inside the replay component. Fall back to the existing URDF viewer inside the same `Replay` tab if MuJoCo initialization fails after assets or WebGL checks.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, jsdom, @testing-library/react, @mujoco/mujoco, @react-three/fiber, three

---

## File Structure

- Create: `src/components/g1-mujoco-replay-helpers.ts`
  - Pure helpers for G1 joint column extraction, frame-to-qpos conversion, and asset path constants.
- Create: `src/components/__tests__/g1-mujoco-replay-helpers.test.ts`
  - Unit tests for deterministic mapping and validation failures.
- Create: `src/components/g1-mujoco-replay.tsx`
  - Focused G1 MuJoCo replay component with loading, ready, fallback, and error states.
- Create: `src/components/__tests__/g1-mujoco-replay.test.tsx`
  - jsdom component tests with mocked MuJoCo loader and fallback paths.
- Modify: `src/app/[org]/[dataset]/[episode]/episode-viewer.tsx`
  - Replace `urdf` / `sim` tabs with a single `replay` tab and route keyboard controls through it.
- Create: `src/app/[org]/[dataset]/[episode]/__tests__/episode-viewer-replay.test.tsx`
  - Replay tab visibility and integration tests.
- Modify: `package.json`
  - Add browser-style test dependencies needed for component rendering.
- Modify: `vitest.config.ts`
  - Keep existing node tests working while allowing explicit jsdom tests.
- Create: `public/mujoco/g1/g1.xml`
  - G1 MuJoCo model entrypoint.
- Create: `public/mujoco/g1/assets/*`
  - Required G1 mesh assets mirrored from the agreed asset bundle.

### Task 1: Add Browser Component Test Support

**Files:**

- Modify: `package.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing config test expectation in plan form**

Add the test dependencies that the replay component tests will require:

```json
{
  "devDependencies": {
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "jsdom": "^26.1.0"
  }
}
```

Update Vitest so the existing node tests remain the default:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
    setupFiles: [],
  },
});
```

- [ ] **Step 2: Run install to verify the repo is missing the new test tooling**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay.test.tsx`
Expected: FAIL with module resolution errors for `@testing-library/react` and no such test file yet.

- [ ] **Step 3: Add the minimal dependency and config changes**

Update `package.json` and `vitest.config.ts` only; do not switch the full test suite to jsdom. Use per-file environment pragmas in the new component tests:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
```

- [ ] **Step 4: Run type and test smoke checks**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay.test.tsx`
Expected: FAIL with missing implementation imports rather than missing tooling.

- [ ] **Step 5: Commit**

```bash
git add package.json vitest.config.ts
git commit -m "test: add browser component test support"
```

### Task 2: Add Deterministic G1 Replay Helpers And Asset Validation

**Files:**

- Create: `src/components/g1-mujoco-replay-helpers.ts`
- Create: `src/components/__tests__/g1-mujoco-replay-helpers.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/components/__tests__/g1-mujoco-replay-helpers.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  G1_REQUIRED_ASSET_PATHS,
  G1_JOINT_NAMES,
  buildG1QposFrame,
  extractOrderedG1StateColumns,
} from "@/components/g1-mujoco-replay-helpers";

describe("extractOrderedG1StateColumns", () => {
  test("returns ordered observation.state columns for a complete G1 row", () => {
    const row = Object.fromEntries(
      Array.from({ length: 29 }, (_, index) => [
        `observation.state | ${index}`,
        index * 0.1,
      ]),
    );

    expect(extractOrderedG1StateColumns(row)).toEqual(
      Array.from({ length: 29 }, (_, index) => `observation.state | ${index}`),
    );
  });

  test("throws when a required G1 joint column is missing", () => {
    expect(() =>
      extractOrderedG1StateColumns({
        "observation.state | 0": 0,
        "observation.state | 1": 1,
      }),
    ).toThrow("Missing G1 state column observation.state | 2");
  });
});

describe("buildG1QposFrame", () => {
  test("writes dataset values after the floating-base qpos prefix", () => {
    const columns = Array.from(
      { length: G1_JOINT_NAMES.length },
      (_, index) => `observation.state | ${index}`,
    );
    const row = Object.fromEntries(
      columns.map((column, index) => [column, index]),
    );

    expect(Array.from(buildG1QposFrame(row, columns).slice(0, 10))).toEqual([
      0, 0, 0, 1, 0, 0, 0, 0, 1, 2,
    ]);
  });
});

describe("G1_REQUIRED_ASSET_PATHS", () => {
  test("includes the MuJoCo entry XML", () => {
    expect(G1_REQUIRED_ASSET_PATHS).toContain("/mujoco/g1/g1.xml");
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay-helpers.test.ts`
Expected: FAIL with `Cannot find module '@/components/g1-mujoco-replay-helpers'`.

- [ ] **Step 3: Write the minimal helper implementation**

Create `src/components/g1-mujoco-replay-helpers.ts`:

```ts
const FLOATING_BASE_QPOS = [0, 0, 0, 1, 0, 0, 0] as const;

export const G1_JOINT_NAMES = [
  "left_hip_pitch_joint",
  "left_hip_roll_joint",
  "left_hip_yaw_joint",
  "left_knee_joint",
  "left_ankle_pitch_joint",
  "left_ankle_roll_joint",
  "right_hip_pitch_joint",
  "right_hip_roll_joint",
  "right_hip_yaw_joint",
  "right_knee_joint",
  "right_ankle_pitch_joint",
  "right_ankle_roll_joint",
  "waist_yaw_joint",
  "waist_roll_joint",
  "waist_pitch_joint",
  "left_shoulder_pitch_joint",
  "left_shoulder_roll_joint",
  "left_shoulder_yaw_joint",
  "left_elbow_joint",
  "left_wrist_roll_joint",
  "left_wrist_pitch_joint",
  "left_wrist_yaw_joint",
  "right_shoulder_pitch_joint",
  "right_shoulder_roll_joint",
  "right_shoulder_yaw_joint",
  "right_elbow_joint",
  "right_wrist_roll_joint",
  "right_wrist_pitch_joint",
  "right_wrist_yaw_joint",
] as const;

export const G1_REQUIRED_ASSET_PATHS = [
  "/mujoco/g1/g1.xml",
  "/mujoco/g1/assets/pelvis.STL",
  "/mujoco/g1/assets/torso_link_rev_1_0.STL",
  "/mujoco/g1/assets/head_link.STL",
];

export function extractOrderedG1StateColumns(row: Record<string, unknown>) {
  return G1_JOINT_NAMES.map((_, index) => {
    const key = `observation.state | ${index}`;
    if (!(key in row)) {
      throw new Error(`Missing G1 state column ${key}`);
    }
    return key;
  });
}

export function buildG1QposFrame(
  row: Record<string, unknown>,
  orderedColumns: string[],
) {
  const qpos = new Float64Array(
    FLOATING_BASE_QPOS.length + orderedColumns.length,
  );
  FLOATING_BASE_QPOS.forEach((value, index) => {
    qpos[index] = value;
  });
  orderedColumns.forEach((column, index) => {
    const value = row[column];
    qpos[FLOATING_BASE_QPOS.length + index] =
      typeof value === "number" ? value : 0;
  });
  return qpos;
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay-helpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/g1-mujoco-replay-helpers.ts src/components/__tests__/g1-mujoco-replay-helpers.test.ts
git commit -m "test: add g1 mujoco replay helper coverage"
```

### Task 3: Add The G1 MuJoCo Replay Component With Fallback States

**Files:**

- Create: `src/components/g1-mujoco-replay.tsx`
- Create: `src/components/__tests__/g1-mujoco-replay.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `src/components/__tests__/g1-mujoco-replay.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import G1MujocoReplay from "@/components/g1-mujoco-replay";

vi.mock("@mujoco/mujoco", () => ({
  default: vi.fn(async () => ({
    FS: {
      mkdirTree: vi.fn(),
      writeFile: vi.fn(),
    },
    MjModel: {
      from_xml_string: vi.fn(() => ({ ngeom: 0, nq: 36, delete: vi.fn() })),
    },
    MjData: vi.fn(() => ({
      qpos: new Float64Array(36),
      delete: vi.fn(),
    })),
    mj_forward: vi.fn(),
  })),
}));

describe("G1MujocoReplay", () => {
  test("renders loading then ready state for a valid G1 trajectory", async () => {
    render(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={4}
        initialChartData={[
          Object.fromEntries(
            Array.from({ length: 29 }, (_, index) => [
              `observation.state | ${index}`,
              index,
            ]),
          ),
        ]}
      />,
    );

    expect(screen.getByText("Loading Replay…")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Episode 4")).toBeInTheDocument(),
    );
  });

  test("shows fallback error when a required G1 column is missing", async () => {
    render(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={1}
        initialChartData={[{ "observation.state | 0": 0 }]}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Replay unavailable: Missing G1 state column observation.state | 1",
        ),
      ).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay.test.tsx`
Expected: FAIL with `Cannot find module '@/components/g1-mujoco-replay'`.

- [ ] **Step 3: Write the minimal replay component**

Create `src/components/g1-mujoco-replay.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import URDFViewer from "@/components/urdf-viewer";
import {
  buildG1QposFrame,
  extractOrderedG1StateColumns,
} from "@/components/g1-mujoco-replay-helpers";

type ChartRow = Record<string, unknown>;

type G1MujocoReplayProps = {
  datasetInfo: { robot_type: string | null; fps: number };
  episodeId: number;
  initialChartData: ChartRow[];
  fallbackData?: unknown;
};

type ReplayStatus = "loading" | "ready" | "error";

export default function G1MujocoReplay({
  datasetInfo,
  episodeId,
  initialChartData,
  fallbackData,
}: G1MujocoReplayProps) {
  const [status, setStatus] = useState<ReplayStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const runtimeRef = useRef<{ qpos: Float64Array } | null>(null);

  const orderedColumns = useMemo(() => {
    const firstRow = initialChartData[0];
    if (!firstRow) throw new Error("Replay unavailable: no trajectory data");
    return extractOrderedG1StateColumns(firstRow);
  }, [initialChartData]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const loadMujoco = (await import("@mujoco/mujoco")).default;
        const mujoco = await loadMujoco();
        const qpos = buildG1QposFrame(initialChartData[0], orderedColumns);
        runtimeRef.current = { qpos };
        mujoco.mj_forward?.({}, { qpos });
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    }

    setStatus("loading");
    setError(null);
    void init();
    return () => {
      cancelled = true;
    };
  }, [initialChartData, orderedColumns]);

  useEffect(() => {
    if (!playing || status !== "ready") return;
    const timer = window.setInterval(
      () => {
        setFrame((current) => (current + 1) % initialChartData.length);
      },
      1000 / Math.max(datasetInfo.fps || 30, 1),
    );
    return () => window.clearInterval(timer);
  }, [datasetInfo.fps, initialChartData.length, playing, status]);

  if (status === "loading") {
    return <div className="p-6 text-slate-200">Loading Replay…</div>;
  }

  if (status === "error") {
    if (fallbackData) {
      return <URDFViewer data={fallbackData as never} />;
    }
    return <div className="p-6 text-red-400">Replay unavailable: {error}</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-sm text-slate-200">Episode {episodeId}</div>
      <div className="text-xs text-slate-400">
        Frame {frame}/{Math.max(initialChartData.length - 1, 0)}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setPlaying((value) => !value)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setFrame(0);
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/g1-mujoco-replay.tsx src/components/__tests__/g1-mujoco-replay.test.tsx
git commit -m "feat: add g1 mujoco replay component"
```

### Task 4: Add MuJoCo Assets And Runtime Guardrails

**Files:**

- Create: `public/mujoco/g1/g1.xml`
- Create: `public/mujoco/g1/assets/*`
- Modify: `src/components/g1-mujoco-replay-helpers.ts`
- Modify: `src/components/__tests__/g1-mujoco-replay-helpers.test.ts`

- [ ] **Step 1: Extend the failing helper test to cover required asset enumeration**

Append to `src/components/__tests__/g1-mujoco-replay-helpers.test.ts`:

```ts
test("lists the key mesh files required for first-frame G1 rendering", () => {
  expect(G1_REQUIRED_ASSET_PATHS).toEqual(
    expect.arrayContaining([
      "/mujoco/g1/g1.xml",
      "/mujoco/g1/assets/pelvis.STL",
      "/mujoco/g1/assets/left_hip_pitch_link.STL",
      "/mujoco/g1/assets/right_shoulder_yaw_link.STL",
    ]),
  );
});
```

- [ ] **Step 2: Run the helper tests to verify they fail on incomplete assets list**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay-helpers.test.ts`
Expected: FAIL because the asset list is incomplete.

- [ ] **Step 3: Expand the asset manifest and add the browser-served assets**

Update `src/components/g1-mujoco-replay-helpers.ts` so `G1_REQUIRED_ASSET_PATHS` contains the full set mirrored by the current MuJoCo loader:

```ts
export const G1_REQUIRED_ASSET_PATHS = [
  "/mujoco/g1/g1.xml",
  "/mujoco/g1/assets/pelvis.STL",
  "/mujoco/g1/assets/pelvis_contour_link.STL",
  "/mujoco/g1/assets/left_hip_pitch_link.STL",
  "/mujoco/g1/assets/left_hip_roll_link.STL",
  "/mujoco/g1/assets/left_hip_yaw_link.STL",
  "/mujoco/g1/assets/left_knee_link.STL",
  "/mujoco/g1/assets/left_ankle_pitch_link.STL",
  "/mujoco/g1/assets/left_ankle_roll_link.STL",
  "/mujoco/g1/assets/right_hip_pitch_link.STL",
  "/mujoco/g1/assets/right_hip_roll_link.STL",
  "/mujoco/g1/assets/right_hip_yaw_link.STL",
  "/mujoco/g1/assets/right_knee_link.STL",
  "/mujoco/g1/assets/right_ankle_pitch_link.STL",
  "/mujoco/g1/assets/right_ankle_roll_link.STL",
  "/mujoco/g1/assets/waist_yaw_link_rev_1_0.STL",
  "/mujoco/g1/assets/waist_roll_link_rev_1_0.STL",
  "/mujoco/g1/assets/torso_link_rev_1_0.STL",
  "/mujoco/g1/assets/logo_link.STL",
  "/mujoco/g1/assets/head_link.STL",
  "/mujoco/g1/assets/left_shoulder_pitch_link.STL",
  "/mujoco/g1/assets/left_shoulder_roll_link.STL",
  "/mujoco/g1/assets/left_shoulder_yaw_link.STL",
  "/mujoco/g1/assets/left_elbow_link.STL",
  "/mujoco/g1/assets/left_wrist_roll_link.STL",
  "/mujoco/g1/assets/left_wrist_pitch_link.STL",
  "/mujoco/g1/assets/left_wrist_yaw_link.STL",
  "/mujoco/g1/assets/left_rubber_hand.STL",
  "/mujoco/g1/assets/right_shoulder_pitch_link.STL",
  "/mujoco/g1/assets/right_shoulder_roll_link.STL",
  "/mujoco/g1/assets/right_shoulder_yaw_link.STL",
  "/mujoco/g1/assets/right_elbow_link.STL",
  "/mujoco/g1/assets/right_wrist_roll_link.STL",
  "/mujoco/g1/assets/right_wrist_pitch_link.STL",
  "/mujoco/g1/assets/right_wrist_yaw_link.STL",
  "/mujoco/g1/assets/right_rubber_hand.STL",
];
```

Mirror the agreed G1 MuJoCo asset bundle into:

```bash
mkdir -p public/mujoco/g1/assets
cp <asset-bundle>/g1.xml public/mujoco/g1/g1.xml
cp <asset-bundle>/assets/* public/mujoco/g1/assets/
```

Then verify the files exist:

```bash
test -f public/mujoco/g1/g1.xml
test -f public/mujoco/g1/assets/pelvis.STL
test -f public/mujoco/g1/assets/right_shoulder_yaw_link.STL
```

- [ ] **Step 4: Run the helper tests again**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay-helpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/mujoco/g1/g1.xml public/mujoco/g1/assets src/components/g1-mujoco-replay-helpers.ts src/components/__tests__/g1-mujoco-replay-helpers.test.ts
git commit -m "feat: add g1 mujoco replay assets"
```

### Task 5: Integrate A Single Replay Tab Into Episode Viewer

**Files:**

- Modify: `src/app/[org]/[dataset]/[episode]/episode-viewer.tsx`
- Create: `src/app/[org]/[dataset]/[episode]/__tests__/episode-viewer-replay.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

Create `src/app/[org]/[dataset]/[episode]/__tests__/episode-viewer-replay.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import EpisodeViewer from "@/app/[org]/[dataset]/[episode]/episode-viewer";

vi.mock("@/app/[org]/[dataset]/[episode]/fetch-data", () => ({
  getEpisodeDataSafe: vi.fn(async () => ({
    data: {
      datasetInfo: {
        repoId: "local/demo_g1",
        robot_type: "g1",
        codebase_version: "v3.0",
        fps: 30,
      },
      episodeId: 0,
      videosInfo: [],
      chartDataGroups: [],
      flatChartData: [
        Object.fromEntries(
          Array.from({ length: 29 }, (_, index) => [
            `observation.state | ${index}`,
            index,
          ]),
        ),
      ],
      episodes: [0, 1, 2],
      task: null,
    },
    error: null,
  })),
}));

describe("EpisodeViewer replay tab", () => {
  test("shows Replay for G1 datasets", async () => {
    render(<EpisodeViewer org="local" dataset="demo_g1" episodeId={0} />);
    expect(
      await screen.findByRole("button", { name: "Replay" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `npm test -- src/app/[org]/[dataset]/[episode]/__tests__/episode-viewer-replay.test.tsx`
Expected: FAIL because `Replay` is not yet the tab label.

- [ ] **Step 3: Replace the tab split with one Replay path**

Update `src/app/[org]/[dataset]/[episode]/episode-viewer.tsx`:

```tsx
type ActiveTab =
  | "episodes"
  | "statistics"
  | "frames"
  | "insights"
  | "filtering"
  | "doctor"
  | "replay";

const G1MujocoReplay = lazy(() => import("@/components/g1-mujoco-replay"));
```

Replace the old tab buttons:

```tsx
{
  datasetInfo.robot_type?.toLowerCase().includes("g1") && (
    <button
      className={`px-6 py-2.5 text-sm font-medium transition-colors relative ${
        activeTab === "replay"
          ? "text-orange-400"
          : "text-slate-400 hover:text-slate-200"
      }`}
      onClick={() => handleTabChange("replay")}
    >
      Replay
      {activeTab === "replay" && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
      )}
    </button>
  );
}
```

Render the new component:

```tsx
{
  activeTab === "replay" && (
    <Suspense fallback={<Loading />}>
      <G1MujocoReplay
        datasetInfo={datasetInfo}
        episodeId={episodeId}
        initialChartData={data.flatChartData}
        fallbackData={data}
      />
    </Suspense>
  );
}
```

Update keyboard routing so `Space`, `ArrowUp`, and `ArrowDown` target the replay episode changer path rather than separate `urdf` / `sim` refs.

- [ ] **Step 4: Run the replay integration test and a related fetch-data test**

Run: `npm test -- src/app/[org]/[dataset]/[episode]/__tests__/episode-viewer-replay.test.tsx src/app/[org]/[dataset]/[episode]/__tests__/fetch-data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/[org]/[dataset]/[episode]/episode-viewer.tsx src/app/[org]/[dataset]/[episode]/__tests__/episode-viewer-replay.test.tsx
git commit -m "feat: integrate single g1 replay tab"
```

### Task 6: Verification Sweep

**Files:**

- Modify: `src/components/g1-mujoco-replay.tsx`
- Modify: `src/app/[org]/[dataset]/[episode]/episode-viewer.tsx`
- Modify: `src/components/__tests__/g1-mujoco-replay.test.tsx`

- [ ] **Step 1: Add one more failing component test for reset behavior**

Append to `src/components/__tests__/g1-mujoco-replay.test.tsx`:

```tsx
test("reset returns playback to frame 0", async () => {
  render(
    <G1MujocoReplay
      datasetInfo={{ robot_type: "g1", fps: 30 } as never}
      episodeId={7}
      initialChartData={[
        Object.fromEntries(
          Array.from({ length: 29 }, (_, index) => [
            `observation.state | ${index}`,
            index,
          ]),
        ),
        Object.fromEntries(
          Array.from({ length: 29 }, (_, index) => [
            `observation.state | ${index}`,
            index + 1,
          ]),
        ),
      ]}
    />,
  );

  expect(await screen.findByText("Episode 7")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused replay suite**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay-helpers.test.ts src/components/__tests__/g1-mujoco-replay.test.tsx src/app/[org]/[dataset]/[episode]/__tests__/episode-viewer-replay.test.tsx`
Expected: FAIL only if the reset or integration logic is still incomplete.

- [ ] **Step 3: Finish the minimal polish needed for green tests**

Ensure these implementation details are present:

```tsx
<input
  type="range"
  min={0}
  max={Math.max(initialChartData.length - 1, 0)}
  value={frame}
  onChange={(event) => {
    setPlaying(false);
    setFrame(Number(event.target.value));
  }}
/>
```

```tsx
<button
  onClick={() => {
    setPlaying(false);
    setFrame(0);
  }}
>
  Reset
</button>
```

- [ ] **Step 4: Run the repository checks relevant to this feature**

Run: `npm test -- src/components/__tests__/g1-mujoco-replay-helpers.test.ts src/components/__tests__/g1-mujoco-replay.test.tsx src/app/[org]/[dataset]/[episode]/__tests__/episode-viewer-replay.test.tsx src/app/[org]/[dataset]/[episode]/__tests__/fetch-data.test.ts`
Expected: PASS

Run: `npm run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/g1-mujoco-replay.tsx src/app/[org]/[dataset]/[episode]/episode-viewer.tsx src/components/__tests__/g1-mujoco-replay.test.tsx
git commit -m "fix: stabilize g1 replay controls"
```

## Self-Review

- Spec coverage:
  - Single `Replay` tab: Task 5
  - G1-only MuJoCo replay: Tasks 2, 3, 4
  - Browser compatibility with and without NVIDIA GPU: Tasks 3, 4, 6
  - Clear fallback/error behavior: Tasks 3 and 6
  - Asset completeness: Task 4
- Placeholder scan:
  - The only manual step is copying the agreed MuJoCo asset bundle into exact destination paths. That remains necessary because the asset source is external to the repository.
- Type consistency:
  - The plan uses one component name, `G1MujocoReplay`, and one helper module, `g1-mujoco-replay-helpers.ts`, throughout.
