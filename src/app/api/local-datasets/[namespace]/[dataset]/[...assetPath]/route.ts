import { createReadStream } from "node:fs";
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

  const result: Record<string, string> = {};
  for (const [repoId, datasetPath] of Object.entries(parsed)) {
    if (typeof datasetPath === "string") {
      result[repoId] = datasetPath;
    }
  }

  return result;
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

function buildBaseHeaders(filePath: string, size: number): HeadersInit {
  return {
    "access-control-allow-headers": "range, content-type",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-origin": "*",
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "content-length": String(size),
    "content-type": getContentType(filePath),
    "cross-origin-resource-policy": "cross-origin",
  };
}

function buildCorsHeaders(): HeadersInit {
  return {
    "access-control-allow-headers": "range, content-type",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin",
  };
}

function parseByteRange(
  rangeHeader: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (startRaw === "" && endRaw === "") return null;

  if (startRaw === "") {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(0, fileSize - suffixLength);
    return { start, end: fileSize - 1 };
  }

  const start = Number.parseInt(startRaw, 10);
  const end = endRaw === "" ? fileSize - 1 : Number.parseInt(endRaw, 10);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

function createAbortableFileStream(
  filePath: string,
  options: { start?: number; end?: number; signal: AbortSignal },
): ReadableStream<Uint8Array> {
  let closed = false;
  let stream: ReturnType<typeof createReadStream> | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        stream?.destroy();
      };

      if (options.signal.aborted) {
        close();
        return;
      }

      stream = createReadStream(filePath, {
        start: options.start,
        end: options.end,
      });

      options.signal.addEventListener("abort", close, { once: true });

      stream.on("data", (chunk) => {
        if (closed) return;
        try {
          const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          controller.enqueue(new Uint8Array(bytes));
        } catch {
          close();
        }
      });

      stream.on("end", () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The client may have navigated away and closed the controller first.
        }
      });

      stream.on("error", (error) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(error);
        } catch {
          // Ignore errors emitted after the client has already cancelled.
        }
      });
    },
    cancel() {
      closed = true;
      stream?.destroy();
    },
  });
}

export async function GET(request: Request, { params }: RouteParams) {
  const { namespace, dataset, assetPath } = await params;
  const resolved = await resolveAssetPath(namespace, dataset, assetPath);
  if (!resolved) {
    return NextResponse.json(
      { error: "Local dataset asset not found" },
      { status: 404, headers: buildCorsHeaders() },
    );
  }

  try {
    const fileInfo = await stat(resolved.filePath);
    const rangeHeader = request.headers.get("range");
    const headers = buildBaseHeaders(resolved.filePath, fileInfo.size);

    if (rangeHeader) {
      const byteRange = parseByteRange(rangeHeader, fileInfo.size);
      if (!byteRange) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...headers,
            "content-range": `bytes */${fileInfo.size}`,
            "content-length": "0",
          },
        });
      }

      const { start, end } = byteRange;
      const stream = createAbortableFileStream(resolved.filePath, {
        start,
        end,
        signal: request.signal,
      });
      return new NextResponse(stream, {
        status: 206,
        headers: {
          ...headers,
          "content-length": String(end - start + 1),
          "content-range": `bytes ${start}-${end}/${fileInfo.size}`,
        },
      });
    }

    const buffer = await readFile(resolved.filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: "Local dataset asset not found" },
      { status: 404, headers: buildCorsHeaders() },
    );
  }
}

export async function HEAD(_: Request, { params }: RouteParams) {
  const { namespace, dataset, assetPath } = await params;
  const resolved = await resolveAssetPath(namespace, dataset, assetPath);
  if (!resolved) {
    return new NextResponse(null, { status: 404, headers: buildCorsHeaders() });
  }

  try {
    const fileInfo = await stat(resolved.filePath);
    return new NextResponse(null, {
      status: 200,
      headers: buildBaseHeaders(resolved.filePath, fileInfo.size),
    });
  } catch {
    return new NextResponse(null, { status: 404, headers: buildCorsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(),
  });
}
