import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock("@/server/rmbench-launch/service");
});

describe("GET /api/evaluation/rmbench/frame/stream", () => {
  test("returns 400 when runId is missing", async () => {
    const { GET } = await import("@/app/api/evaluation/rmbench/frame/stream/route");

    const response = await GET(
      new Request("http://localhost/api/evaluation/rmbench/frame/stream?camera=third_view"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Missing RMBench runId",
    });
  });

  test("returns 400 when camera is missing", async () => {
    const { GET } = await import("@/app/api/evaluation/rmbench/frame/stream/route");

    const response = await GET(
      new Request(
        "http://localhost/api/evaluation/rmbench/frame/stream?runId=2026-05-16T12-00-00-000Z_swap_blocks",
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Missing RMBench camera",
    });
  });

  test("returns multipart MJPEG headers for a valid run", async () => {
    const createRmbenchFrameStream = vi.fn(async () => new ReadableStream());
    vi.doMock("@/server/rmbench-launch/service", async () => {
      const actual = await vi.importActual<typeof import("@/server/rmbench-launch/service")>(
        "@/server/rmbench-launch/service",
      );
      return {
        ...actual,
        createRmbenchFrameStream,
      };
    });

    const { GET } = await import("@/app/api/evaluation/rmbench/frame/stream/route");
    const response = await GET(
      new Request(
        "http://localhost/api/evaluation/rmbench/frame/stream?runId=2026-05-16T12-00-00-000Z_swap_blocks&camera=third_view",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "multipart/x-mixed-replace",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(createRmbenchFrameStream).toHaveBeenCalledWith(
      "2026-05-16T12-00-00-000Z_swap_blocks",
      "third_view",
    );
  });
});
