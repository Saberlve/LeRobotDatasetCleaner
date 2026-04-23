import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { loadLocalDatasetRegistry } from "@/server/local-datasets/registry";
import { LOCAL_DATASETS_ENV } from "@/utils/localDatasets";

function getContentType(assetPath: string): string {
  if (assetPath.endsWith(".json")) return "application/json; charset=utf-8";
  if (assetPath.endsWith(".parquet")) return "application/octet-stream";
  if (assetPath.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function loadEnvLocalDatasetRoots(): Record<string, string> {
  const raw = process.env[LOCAL_DATASETS_ENV];
  if (!raw) return {};

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `${LOCAL_DATASETS_ENV} must be a JSON object mapping repo ids to dataset paths.`,
    );
  }

  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([repoId, datasetPath]) =>
        typeof repoId === "string" && typeof datasetPath === "string",
    ),
  );
}

async function resolveLocalDatasetRoot(repoId: string): Promise<string | null> {
  const envRegistry = loadEnvLocalDatasetRoots();
  if (Object.prototype.hasOwnProperty.call(envRegistry, repoId)) {
    return envRegistry[repoId];
  }

  const persisted = await loadLocalDatasetRegistry();
  const match = persisted.find((entry) => entry.repoId === repoId);
  return match?.path ?? null;
}

async function resolveAssetPath(
  namespace: string,
  dataset: string,
  assetPathParts: string[],
): Promise<{ repoId: string; filePath: string } | null> {
  const repoId = `${namespace}/${dataset}`;
  const datasetRoot = await resolveLocalDatasetRoot(repoId);
  if (!datasetRoot) return null;

  const absoluteRoot = path.resolve(datasetRoot);
  const requestedPath = path.resolve(absoluteRoot, ...assetPathParts);
  if (
    requestedPath !== absoluteRoot &&
    !requestedPath.startsWith(`${absoluteRoot}${path.sep}`)
  ) {
    return null;
  }

  return { repoId, filePath: requestedPath };
}

type RouteParams = {
  params: Promise<{
    namespace: string;
    dataset: string;
    assetPath: string[];
  }>;
};

export async function GET(_: Request, { params }: RouteParams) {
  const { namespace, dataset, assetPath } = await params;
  const resolved = await resolveAssetPath(namespace, dataset, assetPath);
  if (!resolved) {
    return NextResponse.json({ error: "Local dataset asset not found" }, { status: 404 });
  }

  try {
    const buffer = await readFile(resolved.filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": getContentType(resolved.filePath),
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Local dataset asset not found" }, { status: 404 });
  }
}

export async function HEAD(_: Request, { params }: RouteParams) {
  const { namespace, dataset, assetPath } = await params;
  const resolved = await resolveAssetPath(namespace, dataset, assetPath);
  if (!resolved) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const fileInfo = await stat(resolved.filePath);
    return new NextResponse(null, {
      status: 200,
      headers: {
        "content-length": String(fileInfo.size),
        "content-type": getContentType(resolved.filePath),
        "cache-control": "no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
