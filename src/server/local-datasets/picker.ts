import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PickDirectoryResult = {
  path: string | null;
  error: string | null;
};

type CreateProcess = typeof execFileAsync;

function formatPickerError(error: unknown): string {
  const baseMessage = "无法打开本地文件夹选择窗口";

  if (error instanceof Error) {
    const detail = error.message.trim();
    if (detail) {
      return `${baseMessage}：${detail}`;
    }
  }

  return `${baseMessage}，当前环境可能不支持 GUI。`;
}

export async function pickDirectory(deps?: {
  createProcess?: CreateProcess;
}): Promise<PickDirectoryResult> {
  const createProcess = deps?.createProcess ?? execFileAsync;

  try {
    const script = [
      "import tkinter as tk",
      "from tkinter import filedialog",
      "root = tk.Tk()",
      "root.withdraw()",
      "root.attributes('-topmost', True)",
      "print(filedialog.askdirectory())",
      "root.destroy()",
    ].join(";");
    const { stdout } = await createProcess("python3", ["-c", script]);
    const selectedPath = stdout.trim();

    return {
      path: selectedPath || null,
      error: null,
    };
  } catch (error) {
    return {
      path: null,
      error: formatPickerError(error),
    };
  }
}
