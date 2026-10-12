import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

test("preserves packed v3 episodes, asynchronous clocks and original tactile assets", async () => {
  const { stderr } = await promisify(execFile)(
    process.env.LEROBOT_EXPORT_PYTHON || "python3",
    [
      path.resolve(
        "src/server/dataset-export/__tests__/test_v3_preservation.py",
      ),
    ],
  );
  expect(stderr).toMatch(/Ran \d+ tests/);
  expect(stderr).toContain("OK");
}, 60_000);
