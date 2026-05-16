import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.doUnmock("@/server/simpler-launch/service");
});

describe("GET /api/evaluation/simpler/frame/stream", () => {
  test("returns 400 when runId is missing", async () => {
    const { GET } = await import("@/app/api/evaluation/simpler/frame/stream/route");

    const response = await GET(
      new Request("http://localhost/api/evaluation/simpler/frame/stream"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Missing SimplerEnv runId",
    });
  });

  test("returns multipart MJPEG headers for a valid run", async () => {
    const createSimplerFrameStream = vi.fn(async () => new ReadableStream());
    vi.doMock("@/server/simpler-launch/service", async () => {
      const actual = await vi.importActual<typeof import("@/server/simpler-launch/service")>(
        "@/server/simpler-launch/service",
      );
      return {
        ...actual,
        createSimplerFrameStream,
      };
    });

    const { GET } = await import("@/app/api/evaluation/simpler/frame/stream/route");
    const response = await GET(
      new Request(
        "http://localhost/api/evaluation/simpler/frame/stream?runId=2026-05-16T12-00-00-000Z_bridge_carrot",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "multipart/x-mixed-replace",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    expect(createSimplerFrameStream).toHaveBeenCalledWith(
      "2026-05-16T12-00-00-000Z_bridge_carrot",
    );
  });
});
