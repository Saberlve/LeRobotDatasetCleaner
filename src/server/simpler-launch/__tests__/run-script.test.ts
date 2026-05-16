import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, test } from "vitest";

describe("run_simpler_launch.sh", () => {
  test("uses an already-running policy server port instead of starting one locally", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "simpler-launch-script-"));
    const openpiRoot = path.join(tempRoot, "openpi");
    const runtimeDir = path.join(tempRoot, "runtime");
    const simplerDir = path.join(openpiRoot, "third_party", "SimplerEnv", "simpler_env");

    await mkdir(simplerDir, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });

    await writeFile(
      path.join(simplerDir, "main_inference.py"),
      `import argparse
import os
from pathlib import Path

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--logging-dir", required=True)
args, _ = parser.parse_known_args()

logging_dir = Path(args.logging_dir)
(logging_dir / "client-policy-port.txt").write_text(os.environ.get("OPENPI_POLICY_PORT", "missing"), encoding="utf8")
`,
      "utf8",
    );

    const scriptPath = path.resolve("scripts/run_simpler_launch.sh");
    await chmod(scriptPath, 0o755);

    const exitCode = await runLaunchScript(scriptPath, runtimeDir, openpiRoot, {
      SIMPLERENV_LAUNCH_SERVER_PORT: "8123",
    });

    expect(exitCode).toBe(0);
    await expect(
      readFile(path.join(runtimeDir, "client-policy-port.txt"), "utf8"),
    ).resolves.toBe("8123");
    await expect(
      access(path.join(openpiRoot, "scripts", "serve_policy.py")),
    ).rejects.toThrow();

    const launcherLog = await readFile(path.join(runtimeDir, "launcher.log"), "utf8");
    expect(launcherLog).toContain("using persistent policy server on port 8123");
  });

  test("passes random single-episode evaluation flags to SimplerEnv", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "simpler-launch-script-"));
    const openpiRoot = path.join(tempRoot, "openpi");
    const runtimeDir = path.join(tempRoot, "runtime");
    const simplerDir = path.join(openpiRoot, "third_party", "SimplerEnv", "simpler_env");

    await mkdir(simplerDir, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });

    await writeFile(
      path.join(simplerDir, "main_inference.py"),
      `import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--logging-dir", required=True)
parser.add_argument("--obj-episode-range", nargs=2, type=int, required=True)
parser.add_argument("--max-episode-steps", type=int, required=True)
parser.add_argument("--success-render-seconds", type=float, required=True)
parser.add_argument("--random-single-episode", action="store_true")
args, _ = parser.parse_known_args()

logging_dir = Path(args.logging_dir)
(logging_dir / "launch-args.json").write_text(
    json.dumps(
        {
            "obj_episode_range": args.obj_episode_range,
            "max_episode_steps": args.max_episode_steps,
            "success_render_seconds": args.success_render_seconds,
            "random_single_episode": args.random_single_episode,
        }
    ),
    encoding="utf8",
)
`,
      "utf8",
    );

    const scriptPath = path.resolve("scripts/run_simpler_launch.sh");
    await chmod(scriptPath, 0o755);

    const exitCode = await runLaunchScript(scriptPath, runtimeDir, openpiRoot, {});

    expect(exitCode).toBe(0);
    await expect(
      readFile(path.join(runtimeDir, "launch-args.json"), "utf8").then((content) =>
        JSON.parse(content),
      ),
    ).resolves.toEqual({
        obj_episode_range: [0, 26],
        max_episode_steps: 250,
        success_render_seconds: 2,
        random_single_episode: true,
      });
  });
});

function runLaunchScript(
  scriptPath: string,
  runtimeDir: string,
  openpiRoot: string,
  extraEnv: Record<string, string>,
) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(scriptPath, ["bridge_carrot", "test_run"], {
      env: {
        ...process.env,
        ...extraEnv,
        OPENPI_CODE_ROOT: openpiRoot,
        SIMPLERENV_LAUNCH_RUNTIME_DIR: runtimeDir,
        SIMPLERENV_LAUNCH_RUN_ID: "test_run",
      },
      stdio: "ignore",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`launch script exited with signal ${signal}`));
        return;
      }
      resolve(code ?? 0);
    });
  });
}
