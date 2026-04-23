# Visualizer Chinese Home And Local Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chinese landing page plus persistent local dataset folder import to `lerobot-dataset-visualizer` while keeping the existing dataset detail routes and data loading pipeline intact.

**Architecture:** Introduce a server-side local dataset registry stored in a JSON file, expose minimal API routes for listing/registering/picking folders, extend the existing local dataset resolution utilities to read the persistent registry in addition to environment variables, and replace the current English landing page with a Chinese dual-entry page for remote and local datasets. Keep detail pages and existing `/api/local-datasets/...` asset serving behavior unchanged.

**Tech Stack:** Next.js App Router, React, TypeScript, Node fs/path, Vitest, npm

---

## File Map

- Create: `src/server/local-datasets/registry.ts`
- Create: `src/server/local-datasets/picker.ts`
- Create: `src/server/local-datasets/__tests__/registry.test.ts`
- Create: `src/server/local-datasets/__tests__/picker.test.ts`
- Create: `src/app/api/local-datasets/registry/route.ts`
- Create: `src/app/api/local-datasets/register/route.ts`
- Create: `src/app/api/local-datasets/pick-directory/route.ts`
- Create: `src/components/home/remote-dataset-card.tsx`
- Create: `src/components/home/local-dataset-card.tsx`
- Create: `src/components/home/recent-local-datasets.tsx`
- Create: `src/app/__tests__/home-page.test.tsx`
- Create: `data/local_datasets_registry.json`
- Modify: `src/utils/localDatasets.ts`
- Modify: `src/utils/__tests__/versionUtils.test.ts`
- Modify: `src/app/page.tsx`
- Modify: `README.md`
- Modify: `run_local_v21.sh`

### Task 1: Persistent Local Dataset Registry

**Files:**
- Create: `src/server/local-datasets/registry.ts`
- Create: `src/server/local-datasets/__tests__/registry.test.ts`
- Create: `data/local_datasets_registry.json`

- [ ] **Step 1: Write the failing registry tests**

```ts
import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildLocalRepoId,
  loadLocalDatasetRegistry,
  registerLocalDataset,
  validateLocalDatasetPath,
} from "@/server/local-datasets/registry";

describe("local dataset registry", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "visualizer-local-"));
    process.env.LOCAL_DATASET_REGISTRY_PATH = path.join(tempRoot, "registry.json");
  });

  afterEach(async () => {
    delete process.env.LOCAL_DATASET_REGISTRY_PATH;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test("buildLocalRepoId normalizes custom aliases", () => {
    expect(buildLocalRepoId("/tmp/demo", "straighten_box")).toBe("local/straighten_box");
    expect(buildLocalRepoId("/tmp/demo", "local/existing")).toBe("local/existing");
  });

  test("validateLocalDatasetPath reads v2.1 info", async () => {
    const datasetRoot = path.join(tempRoot, "dataset");
    await fs.mkdir(path.join(datasetRoot, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(datasetRoot, "meta", "info.json"),
      JSON.stringify({
        codebase_version: "v2.1",
        total_episodes: 8,
        fps: 30,
        robot_type: "Acone",
      }),
      "utf8",
    );

    const summary = await validateLocalDatasetPath(datasetRoot);
    expect(summary.version).toBe("v2.1");
    expect(summary.totalEpisodes).toBe(8);
  });

  test("registerLocalDataset persists latest entry", async () => {
    const datasetRoot = path.join(tempRoot, "dataset");
    await fs.mkdir(path.join(datasetRoot, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(datasetRoot, "meta", "info.json"),
      JSON.stringify({
        codebase_version: "v3.0",
        total_episodes: 3,
        fps: 50,
        robot_type: "SO101",
      }),
      "utf8",
    );

    const entry = await registerLocalDataset({ datasetPath: datasetRoot, alias: "demo_box" });
    const all = await loadLocalDatasetRegistry();

    expect(entry.repoId).toBe("local/demo_box");
    expect(all[0].repoId).toBe("local/demo_box");
    expect(all[0].path).toBe(path.resolve(datasetRoot));
  });
});
```

- [ ] **Step 2: Run registry tests to verify they fail**

Run: `npm test -- src/server/local-datasets/__tests__/registry.test.ts`

Expected: FAIL with module-not-found for `@/server/local-datasets/registry`

- [ ] **Step 3: Write the minimal registry implementation**

```ts
import fs from "node:fs/promises";
import path from "node:path";

export type LocalDatasetSummary = {
  path: string;
  version: string;
  totalEpisodes: number;
  fps: number;
  robotType: string | null;
};

export type LocalDatasetRegistryEntry = LocalDatasetSummary & {
  repoId: string;
  displayName: string;
  lastOpenedAt: string;
};

const DEFAULT_REGISTRY_PATH = path.resolve(process.cwd(), "data/local_datasets_registry.json");
const SUPPORTED_VERSIONS = new Set(["v2.0", "v2.1", "v3.0"]);

function getRegistryPath() {
  return process.env.LOCAL_DATASET_REGISTRY_PATH
    ? path.resolve(process.env.LOCAL_DATASET_REGISTRY_PATH)
    : DEFAULT_REGISTRY_PATH;
}

export function buildLocalRepoId(datasetPath: string, customAlias: string) {
  const alias = customAlias.trim();
  if (alias) return alias.startsWith("local/") ? alias : `local/${alias}`;
  return `local/${path.basename(path.resolve(datasetPath))}`;
}

export async function loadLocalDatasetRegistry(): Promise<LocalDatasetRegistryEntry[]> {
  const registryPath = getRegistryPath();
  try {
    const raw = await fs.readFile(registryPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalDatasetRegistry(entries: LocalDatasetRegistryEntry[]) {
  const registryPath = getRegistryPath();
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, JSON.stringify(entries, null, 2), "utf8");
}

export async function validateLocalDatasetPath(datasetPath: string): Promise<LocalDatasetSummary> {
  const absolutePath = path.resolve(datasetPath);
  const infoPath = path.join(absolutePath, "meta", "info.json");
  const raw = await fs.readFile(infoPath, "utf8");
  const info = JSON.parse(raw) as Record<string, unknown>;
  const version = String(info.codebase_version ?? "").trim();
  if (!SUPPORTED_VERSIONS.has(version)) throw new Error(`Unsupported local dataset version: ${version || "unknown"}`);

  return {
    path: absolutePath,
    version,
    totalEpisodes: Number(info.total_episodes),
    fps: Number(info.fps),
    robotType: info.robot_type == null ? null : String(info.robot_type),
  };
}

export async function registerLocalDataset(input: { datasetPath: string; alias: string }) {
  const summary = await validateLocalDatasetPath(input.datasetPath);
  const repoId = buildLocalRepoId(summary.path, input.alias);
  const entry: LocalDatasetRegistryEntry = {
    ...summary,
    repoId,
    displayName: repoId.replace(/^local\//, ""),
    lastOpenedAt: new Date().toISOString(),
  };
  const existing = await loadLocalDatasetRegistry();
  const next = [entry, ...existing.filter((item) => item.repoId !== entry.repoId && item.path !== entry.path)];
  await saveLocalDatasetRegistry(next);
  return entry;
}
```

- [ ] **Step 4: Run registry tests to verify they pass**

Run: `npm test -- src/server/local-datasets/__tests__/registry.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add data/local_datasets_registry.json src/server/local-datasets/registry.ts src/server/local-datasets/__tests__/registry.test.ts
git commit -m "feat: add persistent local dataset registry"
```

### Task 2: Picker And Registration APIs

**Files:**
- Create: `src/server/local-datasets/picker.ts`
- Create: `src/server/local-datasets/__tests__/picker.test.ts`
- Create: `src/app/api/local-datasets/registry/route.ts`
- Create: `src/app/api/local-datasets/register/route.ts`
- Create: `src/app/api/local-datasets/pick-directory/route.ts`

- [ ] **Step 1: Write the failing picker and API tests**

```ts
import { describe, expect, test, vi } from "vitest";

import { pickDirectory } from "@/server/local-datasets/picker";

describe("pickDirectory", () => {
  test("returns a chinese gui error when tk is unavailable", async () => {
    const result = await pickDirectory({
      createProcess: vi.fn().mockRejectedValue(new Error("tk unavailable")),
    });

    expect(result.path).toBeNull();
    expect(result.error).toMatch("无法打开本地文件夹选择窗口");
  });
});
```

```ts
import { describe, expect, test } from "vitest";

import { POST as registerRoute } from "@/app/api/local-datasets/register/route";

describe("local dataset register api", () => {
  test("returns repoId and entryRoute", async () => {
    const request = new Request("http://localhost/api/local-datasets/register", {
      method: "POST",
      body: JSON.stringify({ path: "/tmp/demo", alias: "demo_box" }),
      headers: { "content-type": "application/json" },
    });

    const response = await registerRoute(request);
    expect(response.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm test -- src/server/local-datasets/__tests__/picker.test.ts`

Expected: FAIL with module-not-found or route import failure

- [ ] **Step 3: Implement picker and API routes**

```ts
// src/server/local-datasets/picker.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function pickDirectory(deps = { createProcess: execFileAsync }) {
  try {
    const script = [
      "import tkinter as tk",
      "from tkinter import filedialog",
      "root = tk.Tk()",
      "root.withdraw()",
      "root.attributes('-topmost', True)",
      "print(filedialog.askdirectory())",
      "root.destroy()",
    ].join(";");
    const { stdout } = await deps.createProcess("python3", ["-c", script]);
    const selected = stdout.trim();
    return selected ? { path: selected, error: null } : { path: null, error: null };
  } catch {
    return { path: null, error: "无法打开本地文件夹选择窗口，当前环境可能不支持 GUI。" };
  }
}
```

```ts
// src/app/api/local-datasets/registry/route.ts
import { NextResponse } from "next/server";
import { loadLocalDatasetRegistry } from "@/server/local-datasets/registry";

export async function GET() {
  return NextResponse.json({ entries: await loadLocalDatasetRegistry() });
}
```

```ts
// src/app/api/local-datasets/register/route.ts
import { NextResponse } from "next/server";
import { registerLocalDataset } from "@/server/local-datasets/registry";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { path?: string; alias?: string };
    const entry = await registerLocalDataset({
      datasetPath: payload.path ?? "",
      alias: payload.alias ?? "",
    });
    return NextResponse.json({
      repoId: entry.repoId,
      summary: entry,
      entryRoute: `/${entry.repoId}/episode_0`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "本地数据集注册失败" },
      { status: 400 },
    );
  }
}
```

```ts
// src/app/api/local-datasets/pick-directory/route.ts
import { NextResponse } from "next/server";
import { pickDirectory } from "@/server/local-datasets/picker";

export async function POST() {
  const result = await pickDirectory();
  if (result.error) return NextResponse.json(result, { status: 400 });
  return NextResponse.json(result);
}
```

- [ ] **Step 4: Run API and picker tests to verify they pass**

Run: `npm test -- src/server/local-datasets/__tests__/picker.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/local-datasets/picker.ts src/server/local-datasets/__tests__/picker.test.ts src/app/api/local-datasets/registry/route.ts src/app/api/local-datasets/register/route.ts src/app/api/local-datasets/pick-directory/route.ts
git commit -m "feat: add local dataset picker and register APIs"
```

### Task 3: Extend Existing Local Dataset Resolution

**Files:**
- Modify: `src/utils/localDatasets.ts`
- Modify: `src/utils/__tests__/versionUtils.test.ts`

- [ ] **Step 1: Write the failing compatibility test**

```ts
test("builds local dataset url from persistent registry when env is empty", async () => {
  delete process.env.LOCAL_LEROBOT_DATASETS_JSON;
  process.env.LOCAL_DATASET_REGISTRY_PATH = "/tmp/visualizer-registry.json";
  await fs.writeFile(
    process.env.LOCAL_DATASET_REGISTRY_PATH,
    JSON.stringify([
      {
        repoId: "local/straighten_box",
        path: "/mnt/d/straighten_the_box",
        displayName: "straighten_box",
        version: "v2.1",
        totalEpisodes: 4,
        fps: 30,
        robotType: "Acone",
        lastOpenedAt: "2026-04-23T00:00:00.000Z",
      },
    ]),
    "utf8",
  );

  const url = buildVersionedUrl("local/straighten_box", "v2.1", "meta/info.json");
  expect(url).toBe(
    "http://127.0.0.1:3000/api/local-datasets/local/straighten_box/meta/info.json",
  );
});
```

- [ ] **Step 2: Run the focused version utils test to verify it fails**

Run: `npm test -- src/utils/__tests__/versionUtils.test.ts`

Expected: FAIL because registry-backed local lookup is not implemented

- [ ] **Step 3: Extend local dataset resolution**

```ts
import fs from "node:fs";
import path from "node:path";

export const LOCAL_DATASETS_ENV = "LOCAL_LEROBOT_DATASETS_JSON";
const DEFAULT_REGISTRY_PATH = path.resolve(process.cwd(), "data/local_datasets_registry.json");

type RegistryEntry = {
  repoId: string;
  path: string;
};

function loadPersistentRegistry(): Record<string, string> {
  const registryPath = process.env.LOCAL_DATASET_REGISTRY_PATH
    ? path.resolve(process.env.LOCAL_DATASET_REGISTRY_PATH)
    : DEFAULT_REGISTRY_PATH;
  try {
    const raw = fs.readFileSync(registryPath, "utf8");
    const parsed = JSON.parse(raw) as RegistryEntry[];
    return Array.isArray(parsed)
      ? Object.fromEntries(parsed.map((entry) => [entry.repoId, entry.path]))
      : {};
  } catch {
    return {};
  }
}

function loadLocalDatasetRegistry(): Record<string, string> {
  const envRegistry = loadEnvRegistry();
  const fileRegistry = loadPersistentRegistry();
  return { ...fileRegistry, ...envRegistry };
}
```

- [ ] **Step 4: Run the focused version utils test to verify it passes**

Run: `npm test -- src/utils/__tests__/versionUtils.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/localDatasets.ts src/utils/__tests__/versionUtils.test.ts
git commit -m "feat: support persistent local dataset resolution"
```

### Task 4: Chinese Home Page With Local Import UI

**Files:**
- Create: `src/components/home/remote-dataset-card.tsx`
- Create: `src/components/home/local-dataset-card.tsx`
- Create: `src/components/home/recent-local-datasets.tsx`
- Create: `src/app/__tests__/home-page.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `README.md`
- Modify: `run_local_v21.sh`

- [ ] **Step 1: Write the failing home page tests**

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("home page", () => {
  test("renders chinese landing page sections", () => {
    render(<Home />);
    expect(screen.getByText("LeRobot 数据集可视化工具")).toBeInTheDocument();
    expect(screen.getByText("远程数据集")).toBeInTheDocument();
    expect(screen.getByText("本地数据集")).toBeInTheDocument();
    expect(screen.getByText("选择本地文件夹")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the home page test to verify it fails**

Run: `npm test -- src/app/__tests__/home-page.test.tsx`

Expected: FAIL because the current home page is still English and has no local import card

- [ ] **Step 3: Implement the Chinese landing page and local import UI**

```tsx
// src/app/page.tsx
"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { RemoteDatasetCard } from "@/components/home/remote-dataset-card";
import { LocalDatasetCard } from "@/components/home/local-dataset-card";

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const path = searchParams.get("path");
    if (path) router.push(path);
  }, [router, searchParams]);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16">
        <header className="space-y-3 text-center">
          <h1 className="text-4xl font-bold">LeRobot 数据集可视化工具</h1>
          <p className="text-base text-white/70">
            支持远程 Hugging Face 数据集浏览，也支持本地 LeRobot 数据文件夹导入。
          </p>
        </header>
        <section className="grid gap-6 lg:grid-cols-2">
          <RemoteDatasetCard />
          <LocalDatasetCard />
        </section>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
```

```tsx
// src/components/home/local-dataset-card.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecentLocalDatasets } from "@/components/home/recent-local-datasets";

export function LocalDatasetCard() {
  const router = useRouter();
  const [selectedPath, setSelectedPath] = useState("");
  const [alias, setAlias] = useState("");
  const [summary, setSummary] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function handlePickDirectory() {
    setError("");
    const response = await fetch("/api/local-datasets/pick-directory", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "无法选择本地文件夹");
      return;
    }
    setSelectedPath(payload.path ?? "");
  }

  async function handleRegister() {
    setError("");
    const response = await fetch("/api/local-datasets/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: selectedPath, alias }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error ?? "本地数据集导入失败");
      return;
    }
    setSummary(`已导入：${payload.summary.path}`);
    router.push(payload.entryRoute);
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-2xl font-semibold">本地数据集</h2>
      <p className="mt-2 text-sm text-white/65">选择本地 LeRobot 数据文件夹并进入可视化页面。</p>
      <div className="mt-4 flex flex-col gap-3">
        <button onClick={handlePickDirectory} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-white">
          选择本地文件夹
        </button>
        <input value={selectedPath} readOnly placeholder="已选择的本地路径将显示在这里" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="可选别名，例如 straighten_the_box" className="rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm" />
        <button onClick={handleRegister} disabled={!selectedPath} className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          进入可视化
        </button>
        {summary ? <p className="text-sm text-emerald-300">{summary}</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
      <RecentLocalDatasets />
    </section>
  );
}
```

- [ ] **Step 4: Run focused UI tests, then full verification**

Run: `npm test -- src/app/__tests__/home-page.test.tsx`

Expected: PASS

Run: `npm test && npm run type-check`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/home/remote-dataset-card.tsx src/components/home/local-dataset-card.tsx src/components/home/recent-local-datasets.tsx src/app/__tests__/home-page.test.tsx README.md run_local_v21.sh
git commit -m "feat: add chinese home page and local dataset import"
```

## Self-Review

- Spec coverage: all approved scope is mapped to tasks:
  - Chinese home page: Task 4
  - picker-based local folder import: Tasks 2 and 4
  - persistent recent imports: Task 1 and Task 4
  - preserve current detail route/data path: Task 3
- Placeholder scan: all tasks include concrete files, commands, and starter code.
- Type consistency: registry entry fields use `repoId`, `path`, `version`, `totalEpisodes`, `fps`, `robotType`, `lastOpenedAt` consistently across tasks.
