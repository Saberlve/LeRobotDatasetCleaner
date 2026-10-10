import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

test("recomputes clipped numeric, video and global statistics", async () => {
  const { stderr } = await promisify(execFile)(
    process.env.LEROBOT_EXPORT_PYTHON || "python3",
    [path.resolve("src/server/dataset-export/__tests__/test_clip_stats.py")],
  );
  expect(stderr).toContain("OK");
}, 60_000);
