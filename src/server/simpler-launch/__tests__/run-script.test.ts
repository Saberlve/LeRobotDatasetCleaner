import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, test } from "vitest";

describe("run_simpler_launch.sh", () => {
  test(
    "waits for the websocket server listening log before starting the client",
    async () => {
      const tempRoot = await mkdtemp(path.join(os.tmpdir(), "simpler-launch-script-"));
      const openpiRoot = path.join(tempRoot, "openpi");
      const runtimeDir = path.join(tempRoot, "runtime");
      const scriptsDir = path.join(openpiRoot, "scripts");
      const simplerDir = path.join(openpiRoot, "third_party", "SimplerEnv", "simpler_env");

      await mkdir(scriptsDir, { recursive: true });
      await mkdir(simplerDir, { recursive: true });
      await mkdir(runtimeDir, { recursive: true });

      await writeFile(
        path.join(scriptsDir, "serve_policy.py"),
        `import argparse
import socket
import time

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--port", type=int, required=True)
args, _ = parser.parse_known_args()

sock = socket.socket()
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(("127.0.0.1", args.port))
sock.listen(1)
time.sleep(7)
print(f"INFO:websockets.server:server listening on 0.0.0.0:{args.port}", flush=True)
time.sleep(30)
`,
        "utf8",
      );

      await writeFile(
        path.join(simplerDir, "main_inference.py"),
        `import argparse
from pathlib import Path

parser = argparse.ArgumentParser(add_help=False)
parser.add_argument("--logging-dir", required=True)
args, _ = parser.parse_known_args()

logging_dir = Path(args.logging_dir)
server_log = logging_dir / "server.log"
marker = "INFO:websockets.server:server listening on"
content = server_log.read_text(encoding="utf8") if server_log.exists() else ""
if marker in content:
    (logging_dir / "client-started-after-listening.txt").write_text("ok\\n", encoding="utf8")
else:
    (logging_dir / "client-started-before-listening.txt").write_text("too-early\\n", encoding="utf8")
`,
        "utf8",
      );

      const scriptPath = path.resolve("scripts/run_simpler_launch.sh");
      await chmod(scriptPath, 0o755);

      const exitCode = await runLaunchScript(scriptPath, runtimeDir, openpiRoot);

      expect(exitCode).toBe(0);
      await expect(
        access(path.join(runtimeDir, "client-started-after-listening.txt")),
      ).resolves.toBeUndefined();
      await expect(
        access(path.join(runtimeDir, "client-started-before-listening.txt")),
      ).rejects.toThrow();

      const launcherLog = await readFile(path.join(runtimeDir, "launcher.log"), "utf8");
      expect(launcherLog).toContain("policy server is ready");
    },
    20000,
  );
});

function runLaunchScript(scriptPath: string, runtimeDir: string, openpiRoot: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(scriptPath, ["bridge_carrot", "test_run"], {
      env: {
        ...process.env,
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
