import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

test("exports native tactile video and lossless mesh for head, middle, tail and reordered selections", async () => {
  const { stderr } = await promisify(execFile)(
    process.env.LEROBOT_EXPORT_PYTHON || "python3",
    [
      path.resolve(
        "src/server/dataset-export/__tests__/test_native_tactile_export.py",
      ),
    ],
  );
  expect(stderr).toContain("OK");
}, 60_000);
