import fs from "node:fs/promises";
import path from "node:path";

import {
  defaultExportAlias,
  type ExportMode,
} from "@/server/dataset-export/selection";

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

const DEFAULT_REGISTRY_PATH = path.resolve(
  process.cwd(),
  "data/local_datasets_registry.json",
);
const SUPPORTED_VERSIONS = new Set(["v2.0", "v2.1", "v3.0"]);
const LOCAL_ALIAS_PATTERN = /^[A-Za-z0-9._-]+$/;
const LOCAL_REPO_ID_PATTERN = /^local\/[A-Za-z0-9._-]+$/;

function getRegistryPath(): string {
  return process.env.LOCAL_DATASET_REGISTRY_PATH
    ? path.resolve(process.env.LOCAL_DATASET_REGISTRY_PATH)
    : DEFAULT_REGISTRY_PATH;
}

function normalizeAlias(customAlias: string): string | null {
  const alias = customAlias.trim();
  if (!alias) return null;

  const normalized = alias.startsWith("local/")
    ? alias.slice("local/".length)
    : alias;
  if (!normalized || !LOCAL_ALIAS_PATTERN.test(normalized)) {
    throw new Error(
      "Local dataset alias must be a single path segment containing letters, numbers, dot, underscore, or hyphen",
    );
  }

  return normalized;
}

export function buildLocalRepoId(
  datasetPath: string,
  customAlias: string,
): string {
  const alias = normalizeAlias(customAlias);
  if (alias) {
    return `local/${alias}`;
  }

  try {
    return `local/${normalizeAlias(path.basename(path.resolve(datasetPath)))}`;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        "Dataset basename is not a valid local alias; provide a valid alias explicitly",
      );
    }

    throw error;
  }
}

export function buildExportRepoId(
  sourceRepoId: string,
  customAlias: string,
  mode: ExportMode,
): string {
  if (mode !== "flagged" && mode !== "unflagged") {
    throw new Error("Export mode must be either flagged or unflagged");
  }

  if (!LOCAL_REPO_ID_PATTERN.test(sourceRepoId)) {
    throw new Error("Export repo id source must be a local dataset repo id");
  }

  const alias = customAlias.trim() || defaultExportAlias(sourceRepoId, mode);
  const exportRepoId = buildLocalRepoId(alias, alias);

  if (exportRepoId === sourceRepoId) {
    throw new Error("Export repo id must differ from the source repo id");
  }

  return exportRepoId;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFinitePositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && isFinitePositiveNumber(value);
}

function assertValidRegistryEntry(
  value: unknown,
  index: number,
): asserts value is LocalDatasetRegistryEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Local dataset registry is invalid: entry ${index} must be an object`,
    );
  }

  const entry = value as Record<string, unknown>;
  const hasValidShape =
    typeof entry.repoId === "string" &&
    typeof entry.path === "string" &&
    typeof entry.displayName === "string" &&
    typeof entry.version === "string" &&
    isFinitePositiveInteger(entry.totalEpisodes) &&
    isFinitePositiveNumber(entry.fps) &&
    (entry.robotType === null || typeof entry.robotType === "string") &&
    typeof entry.lastOpenedAt === "string";

  if (!hasValidShape) {
    throw new Error(
      `Local dataset registry is invalid: entry ${index} has an invalid shape`,
    );
  }

  const typedEntry = entry as LocalDatasetRegistryEntry;
  const { repoId, displayName } = typedEntry;

  if (!LOCAL_REPO_ID_PATTERN.test(repoId)) {
    throw new Error(
      `Local dataset registry is invalid: entry ${index} has an invalid shape`,
    );
  }

  if (displayName !== repoId.replace(/^local\//, "")) {
    throw new Error(
      `Local dataset registry is invalid: entry ${index} has an invalid shape`,
    );
  }
}

export async function loadLocalDatasetRegistry(): Promise<
  LocalDatasetRegistryEntry[]
> {
  const registryPath = getRegistryPath();

  try {
    const raw = await fs.readFile(registryPath, "utf8");
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const malformedError = new Error("Local dataset registry is malformed");
      (malformedError as Error & { cause?: unknown }).cause = error;
      throw malformedError;
    }

    if (!Array.isArray(parsed)) {
      throw new Error("Local dataset registry is invalid: expected an array");
    }

    parsed.forEach((entry, index) => {
      assertValidRegistryEntry(entry, index);
    });

    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function saveLocalDatasetRegistry(
  entries: LocalDatasetRegistryEntry[],
): Promise<void> {
  const registryPath = getRegistryPath();
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, JSON.stringify(entries, null, 2), "utf8");
}

export async function validateLocalDatasetPath(
  datasetPath: string,
): Promise<LocalDatasetSummary> {
  const absolutePath = path.resolve(datasetPath);
  const infoPath = path.join(absolutePath, "meta", "info.json");
  const raw = await fs.readFile(infoPath, "utf8");
  const info = JSON.parse(raw) as Record<string, unknown>;
  const version = String(info.codebase_version ?? "").trim();

  if (!SUPPORTED_VERSIONS.has(version)) {
    throw new Error(
      `Unsupported local dataset version: ${version || "unknown"}`,
    );
  }

  if (
    !isFinitePositiveInteger(info.total_episodes) ||
    !isFinitePositiveNumber(info.fps)
  ) {
    throw new Error("Local dataset metadata is invalid");
  }

  return {
    path: absolutePath,
    version,
    totalEpisodes: info.total_episodes,
    fps: info.fps,
    robotType: info.robot_type == null ? null : String(info.robot_type),
  };
}

export async function registerLocalDataset(input: {
  datasetPath: string;
  alias: string;
}): Promise<LocalDatasetRegistryEntry> {
  const summary = await validateLocalDatasetPath(input.datasetPath);
  const repoId = buildLocalRepoId(summary.path, input.alias);
  const entry: LocalDatasetRegistryEntry = {
    ...summary,
    repoId,
    displayName: repoId.replace(/^local\//, ""),
    lastOpenedAt: new Date().toISOString(),
  };

  const existing = await loadLocalDatasetRegistry();
  const next = [
    entry,
    ...existing.filter(
      (item) => item.repoId !== entry.repoId && item.path !== entry.path,
    ),
  ];

  await saveLocalDatasetRegistry(next);
  return entry;
}
