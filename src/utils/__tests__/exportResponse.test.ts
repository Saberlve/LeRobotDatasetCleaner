import { describe, expect, it } from "vitest";
import { readExportResponse } from "../exportResponse";

describe("export response", () => {
  it("identifies an HTML gateway error without hiding the status", async () => {
    await expect(
      readExportResponse(
        new Response("<html>Gateway Timeout</html>", { status: 504 }),
      ),
    ).rejects.toThrow(/HTML 页面（HTTP 504）.*后台运行/);
  });
  it("identifies empty responses", async () => {
    await expect(
      readExportResponse(new Response("", { status: 502 })),
    ).rejects.toThrow("空响应（HTTP 502）");
  });
  it("preserves backend errors", async () => {
    await expect(
      readExportResponse(
        Response.json({ error: "output already exists" }, { status: 500 }),
      ),
    ).rejects.toThrow("output already exists（HTTP 500）");
  });
  it("rejects unexpected successful JSON", async () => {
    await expect(readExportResponse(Response.json({}))).rejects.toThrow(
      "响应字段不完整",
    );
  });
  it("accepts a completed export", async () => {
    const result = {
      entryRoute: "/local/test/episode_0",
      repoId: "local/test",
      totalEpisodes: 2,
      path: "/tmp/test",
    };
    await expect(readExportResponse(Response.json(result))).resolves.toEqual(
      result,
    );
  });
});
