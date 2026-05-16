# SimplerEnv MJPEG Stream Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SimplerEnv launch page's polled single-frame preview with a low-latency MJPEG stream while preserving the existing status/action polling flow and static final-frame fallback.

**Architecture:** Keep `/api/evaluation/simpler/status` as the source of task state and action data, add a dedicated MJPEG route backed by a service-layer `ReadableStream`, and switch the launch panel to derive image mode from `runId + status` instead of `frameVersion`. Update the external SimplerEnv runtime so JPEG writes become temp-file writes followed by atomic replacement.

**Tech Stack:** Next.js 15 route handlers, Web `ReadableStream`, Node `fs/promises`, React 19 client components, Vitest, Python `pathlib` + Pillow in `/VLA/openpi/third_party/SimplerEnv`

---

## File Structure

- Create: `src/app/api/evaluation/simpler/frame/stream/route.ts`
- Modify: `src/server/simpler-launch/service.ts`
- Modify: `src/server/simpler-launch/__tests__/service.test.ts`
- Modify: `src/components/evaluation/simpler-launch-panel.tsx`
- Modify: `src/components/evaluation/__tests__/simpler-launch-panel.test.tsx`
- Modify: `src/types/simpler-launch.ts`
- Modify: `/VLA/openpi/third_party/SimplerEnv/simpler_env/evaluation/live_runtime.py`
- Create: `/VLA/openpi/third_party/SimplerEnv/tests/test_live_runtime.py`

### Task 1: Add service-level MJPEG stream support

**Files:**
- Modify: `src/server/simpler-launch/__tests__/service.test.ts`
- Modify: `src/server/simpler-launch/service.ts`
- Test: `src/server/simpler-launch/__tests__/service.test.ts`

- [ ] **Step 1: Write the failing service tests**

```ts
test("builds an MJPEG stream that emits the current frame immediately and appends later file updates", async () => {
  const { createSimplerFrameStream } = await import("@/server/simpler-launch/service");

  const runId = "2026-05-16T12-00-00-000Z_bridge_carrot";
  const runRoot = path.join(tempRoot, runId);
  const framePath = path.join(runRoot, "latest-frame.jpg");
  await mkdir(runRoot, { recursive: true });
  await writeRuntimeStatus(runRoot, runId, framePath, "running");
  await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const stream = await createSimplerFrameStream(runId, {
    runtimeRoot: tempRoot,
    framePollIntervalMs: 1,
  });
  const reader = stream.getReader();

  const first = await readChunkText(reader);
  expect(first).toContain("--frame");
  expect(first).toContain("Content-Type: image/jpeg");

  await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]));
  const second = await readChunkText(reader);
  expect(second).toContain("Content-Length: 6");

  await reader.cancel();
});

test("returns the final frame and then closes once the run has already finished", async () => {
  const { createSimplerFrameStream } = await import("@/server/simpler-launch/service");

  const runId = "2026-05-16T12-05-00-000Z_bridge_carrot";
  const runRoot = path.join(tempRoot, runId);
  const framePath = path.join(runRoot, "latest-frame.jpg");
  await mkdir(runRoot, { recursive: true });
  await writeRuntimeStatus(runRoot, runId, framePath, "succeeded");
  await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const stream = await createSimplerFrameStream(runId, {
    runtimeRoot: tempRoot,
    framePollIntervalMs: 1,
  });
  const reader = stream.getReader();

  expect(await readChunkText(reader)).toContain("--frame");
  await expect(reader.read()).resolves.toMatchObject({ done: true });
});
```

- [ ] **Step 2: Run the service test slice and verify it fails for the missing stream API**

Run: `npx vitest run src/server/simpler-launch/__tests__/service.test.ts`
Expected: FAIL with `createSimplerFrameStream is not exported` or equivalent missing-stream assertions.

- [ ] **Step 3: Implement the minimal stream builder in the service layer**

```ts
const FRAME_STREAM_BOUNDARY = "frame";
const DEFAULT_FRAME_POLL_INTERVAL_MS = Math.max(
  30,
  Number(process.env.SIMPLER_FRAME_STREAM_POLL_INTERVAL_MS || 40),
);

export async function createSimplerFrameStream(
  runId: string,
  deps?: ServiceDeps & { framePollIntervalMs?: number },
): Promise<ReadableStream<Uint8Array>> {
  validateRunId(runId);
  const resolved = resolveDeps(deps);
  const encoder = new TextEncoder();
  const pollIntervalMs = deps?.framePollIntervalMs ?? DEFAULT_FRAME_POLL_INTERVAL_MS;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let cancelled = false;
      let lastSignature: string | null = null;

      while (!cancelled) {
        const runtimeStatus = await readRuntimeStatus(path.join(resolved.runtimeRoot, runId));
        if (!runtimeStatus) break;

        const framePath =
          runtimeStatus.latestFramePath ??
          path.join(resolved.runtimeRoot, runId, "latest-frame.jpg");
        const snapshot = await readFrameSnapshot(framePath);
        if (snapshot && snapshot.signature !== lastSignature) {
          lastSignature = snapshot.signature;
          controller.enqueue(buildMjpegPart(snapshot.buffer, encoder));
        }

        if (FINAL_STATUSES.has(runtimeStatus.status)) {
          break;
        }

        await sleep(pollIntervalMs);
      }

      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
}
```

- [ ] **Step 4: Re-run the service test slice and verify it passes**

Run: `npx vitest run src/server/simpler-launch/__tests__/service.test.ts`
Expected: PASS for the new MJPEG stream tests with no regression in existing service tests.

### Task 2: Add the streaming route and align response metadata

**Files:**
- Create: `src/app/api/evaluation/simpler/frame/stream/route.ts`
- Modify: `src/server/simpler-launch/service.ts`
- Modify: `src/types/simpler-launch.ts`
- Test: `src/server/simpler-launch/__tests__/service.test.ts`
- Test: `src/app/api/local-datasets/export/__tests__/route.test.ts` as route-test reference only

- [ ] **Step 1: Write the failing route/status tests**

```ts
test("route returns 400 when runId is missing", async () => {
  const { GET } = await import("@/app/api/evaluation/simpler/frame/stream/route");
  const response = await GET(new Request("http://localhost/api/evaluation/simpler/frame/stream"));

  expect(response.status).toBe(400);
});

test("route returns multipart MJPEG headers for a valid run", async () => {
  const createSimplerFrameStream = vi.fn(async () => new ReadableStream());
  vi.doMock("@/server/simpler-launch/service", async () => {
    const actual = await vi.importActual<typeof import("@/server/simpler-launch/service")>(
      "@/server/simpler-launch/service",
    );
    return { ...actual, createSimplerFrameStream };
  });

  const { GET } = await import("@/app/api/evaluation/simpler/frame/stream/route");
  const response = await GET(
    new Request("http://localhost/api/evaluation/simpler/frame/stream?runId=demo"),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("multipart/x-mixed-replace");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
```

- [ ] **Step 2: Run the route/service tests and verify the new route coverage fails**

Run: `npx vitest run src/server/simpler-launch/__tests__/service.test.ts`
Expected: FAIL because `src/app/api/evaluation/simpler/frame/stream/route.ts` does not exist yet.

- [ ] **Step 3: Implement the route and keep status payload shape stable**

```ts
import { NextResponse } from "next/server";

import {
  SimplerLaunchError,
  createSimplerFrameStream,
  FRAME_STREAM_CONTENT_TYPE,
} from "@/server/simpler-launch/service";

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const runId = requestUrl.searchParams.get("runId");
    if (!runId) {
      return NextResponse.json({ error: "Missing SimplerEnv runId" }, { status: 400 });
    }

    const stream = await createSimplerFrameStream(runId);
    return new Response(stream, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": FRAME_STREAM_CONTENT_TYPE,
      },
    });
  } catch (error) {
    if (error instanceof SimplerLaunchError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Failed to stream SimplerEnv frame" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Re-run the route/service tests and verify they pass**

Run: `npx vitest run src/server/simpler-launch/__tests__/service.test.ts`
Expected: PASS with the new route import and status/stream helpers green.

### Task 3: Switch the launch panel from frame-version swapping to run-state-driven streaming

**Files:**
- Modify: `src/components/evaluation/__tests__/simpler-launch-panel.test.tsx`
- Modify: `src/components/evaluation/simpler-launch-panel.tsx`
- Test: `src/components/evaluation/__tests__/simpler-launch-panel.test.tsx`

- [ ] **Step 1: Replace the old frame refresh tests with failing stream/static mode tests**

```tsx
test("uses the MJPEG stream URL while a run is active", async () => {
  vi.stubGlobal(
    "fetch",
    createFetchMock({
      simplerStatus: createStatus({
        status: "running",
        runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
        latestFrameUrl: "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
        frameVersion: 3,
      }),
      simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
      rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
    }),
  );

  const { SimplerLaunchPanel } = await import("@/components/evaluation/simpler-launch-panel");
  render(<SimplerLaunchPanel />);

  await waitFor(() => {
    expect(screen.getByRole("img", { name: "bridge_carrot latest frame" })).toHaveAttribute(
      "src",
      "/api/evaluation/simpler/frame/stream?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
    );
  });
});

test("falls back to the static final frame once the run has finished", async () => {
  vi.stubGlobal(
    "fetch",
    createFetchMock({
      simplerStatus: createStatus({
        status: "succeeded",
        runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
        latestFrameUrl: "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
        frameVersion: 7,
      }),
      simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
      rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
    }),
  );

  const { SimplerLaunchPanel } = await import("@/components/evaluation/simpler-launch-panel");
  render(<SimplerLaunchPanel />);

  await waitFor(() => {
    expect(screen.getByRole("img", { name: "bridge_carrot latest frame" }).getAttribute("src"))
      .toContain("/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot&v=7");
  });
});
```

- [ ] **Step 2: Run the panel tests and verify the old preloading behavior breaks the new expectations**

Run: `npx vitest run src/components/evaluation/__tests__/simpler-launch-panel.test.tsx`
Expected: FAIL because the component still builds `displayedFrameSrc` from `frameVersion` and `new Image()`.

- [ ] **Step 3: Implement the simpler stream/static source selection in the panel**

```tsx
const streamingStatuses = new Set<SimplerLaunchRunStatus>([
  "starting",
  "running",
  "stopping",
]);

function resolveFrameImageSrc(status: SimplerLaunchStatusResponse) {
  if (!status.runId) {
    return null;
  }
  if (streamingStatuses.has(status.status)) {
    return `/api/evaluation/simpler/frame/stream?runId=${encodeURIComponent(status.runId)}`;
  }
  if (status.latestFrameUrl) {
    return `${status.latestFrameUrl}&v=${status.frameVersion}`;
  }
  return null;
}
```

- [ ] **Step 4: Re-run the panel tests and verify they pass**

Run: `npx vitest run src/components/evaluation/__tests__/simpler-launch-panel.test.tsx`
Expected: PASS with the running-state stream URL, final-state static fallback, and unchanged action/status behavior.

### Task 4: Make SimplerEnv frame writes atomic

**Files:**
- Modify: `/VLA/openpi/third_party/SimplerEnv/simpler_env/evaluation/live_runtime.py`
- Create: `/VLA/openpi/third_party/SimplerEnv/tests/test_live_runtime.py`
- Test: `/VLA/openpi/third_party/SimplerEnv/tests/test_live_runtime.py`

- [ ] **Step 1: Write the failing runtime atomic-write test**

```py
from pathlib import Path

import numpy as np
from PIL import Image

from simpler_env.evaluation.live_runtime import LiveRuntimeWriter


def test_write_frame_replaces_latest_frame_atomically(tmp_path: Path):
    writer = LiveRuntimeWriter(
        runtime_dir=str(tmp_path),
        run_id="demo",
        task_id="bridge_carrot",
        meta={"taskId": "bridge_carrot"},
    )

    writer._write_frame(np.zeros((4, 4, 3), dtype=np.uint8))

    frame_path = tmp_path / "latest-frame.jpg"
    temp_path = tmp_path / "latest-frame.jpg.tmp"

    assert frame_path.exists()
    assert not temp_path.exists()
    Image.open(frame_path).load()
```

- [ ] **Step 2: Run the runtime test and verify it fails against direct overwrite behavior**

Run: `pytest /VLA/openpi/third_party/SimplerEnv/tests/test_live_runtime.py -q`
Expected: FAIL because `latest-frame.jpg.tmp` handling is not implemented yet.

- [ ] **Step 3: Implement atomic JPEG replacement**

```py
def _write_frame(self, image):
    frame = np.asarray(image)
    if frame.dtype != np.uint8:
        frame = np.clip(frame, 0, 255).astype(np.uint8)

    temp_path = Path(f"{self.frame_path}.tmp")
    Image.fromarray(frame).save(temp_path, format="JPEG", quality=90)
    temp_path.replace(self.frame_path)
```

- [ ] **Step 4: Re-run the runtime test and verify it passes**

Run: `pytest /VLA/openpi/third_party/SimplerEnv/tests/test_live_runtime.py -q`
Expected: PASS with the final frame readable and no leftover temp file.

### Task 5: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run targeted TypeScript verification**

Run: `npx vitest run src/server/simpler-launch/__tests__/service.test.ts src/components/evaluation/__tests__/simpler-launch-panel.test.tsx`
Expected: PASS

- [ ] **Step 2: Run targeted Python runtime verification**

Run: `pytest /VLA/openpi/third_party/SimplerEnv/tests/test_live_runtime.py -q`
Expected: PASS

- [ ] **Step 3: Run type checking for the app**

Run: `npm run type-check`
Expected: PASS
