import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { EVAL_RESULTS_ROOT } from "@/server/eval-results/summary";

function buildCorsHeaders(): HeadersInit {
  return {
    "access-control-allow-headers": "range, content-type",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-origin": "*",
    "accept-ranges": "bytes",
    "cache-control": "no-store",
    "cross-origin-resource-policy": "cross-origin",
  };
}

function getContentType(filePath: string) {
  if (filePath.endsWith(".mp4")) return "video/mp4";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function resolveEvalAsset(relativePath: string): string | null {
  const root = EVAL_RESULTS_ROOT;
  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && filePath.startsWith(`${root}${path.sep}`)) {
    return filePath;
  }
  return null;
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
    return { start: Math.max(0, fileSize - suffixLength), end: fileSize - 1 };
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

function createFileStream(
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
        if (!closed) controller.enqueue(new Uint8Array(chunk as Buffer));
      });
      stream.on("end", () => {
        if (closed) return;
        closed = true;
        controller.close();
      });
      stream.on("error", (error) => {
        if (closed) return;
        closed = true;
        controller.error(error);
      });
    },
    cancel() {
      closed = true;
      stream?.destroy();
    },
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const relativePath = requestUrl.searchParams.get("path");
  if (!relativePath) {
    return NextResponse.json(
      { error: "Missing eval result media path" },
      { status: 400, headers: buildCorsHeaders() },
    );
  }

  const filePath = resolveEvalAsset(relativePath);
  if (!filePath) {
    return NextResponse.json(
      { error: "Eval result media not found" },
      { status: 404, headers: buildCorsHeaders() },
    );
  }

  try {
    const fileInfo = await stat(filePath);
    const baseHeaders = {
      ...buildCorsHeaders(),
      "content-type": getContentType(filePath),
      "content-length": String(fileInfo.size),
    };
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, fileInfo.size);
      if (!range) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            "content-range": `bytes */${fileInfo.size}`,
            "content-length": "0",
          },
        });
      }
      const stream = createFileStream(filePath, {
        ...range,
        signal: request.signal,
      });
      return new NextResponse(stream, {
        status: 206,
        headers: {
          ...baseHeaders,
          "content-length": String(range.end - range.start + 1),
          "content-range": `bytes ${range.start}-${range.end}/${fileInfo.size}`,
        },
      });
    }

    return new NextResponse(
      createFileStream(filePath, { signal: request.signal }),
      { status: 200, headers: baseHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Eval result media not found" },
      { status: 404, headers: buildCorsHeaders() },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(),
  });
}
