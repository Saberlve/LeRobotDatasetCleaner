import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PickDirectoryResult = {
  path: string | null;
  error: string | null;
};

type CreateProcess = typeof execFileAsync;
type PickerCommand = {
  command: string;
  args: string[];
  outputPathStyle?: "windows";
};

function formatPickerError(error: unknown): string {
  const baseMessage = "无法打开本地文件夹选择窗口";

  if (error instanceof Error) {
    const detail = error.message.trim();
    const normalizedDetail = detail.toLowerCase();

    if (
      normalizedDetail.includes("no module named 'tkinter'") ||
      normalizedDetail.includes('no module named "tkinter"') ||
      normalizedDetail.includes(
        "modulenotfounderror: no module named 'tkinter'",
      )
    ) {
      return `${baseMessage}：当前 Python 环境缺少 tkinter。请直接在输入框里粘贴本地数据集绝对路径，例如 /mnt/d/straighten_the_box。`;
    }

    if (detail) {
      return `${baseMessage}：${detail}`;
    }
  }

  return `${baseMessage}，当前环境可能不支持 GUI。`;
}

export async function pickDirectory(deps?: {
  createProcess?: CreateProcess;
  platform?: NodeJS.Platform | string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<PickDirectoryResult> {
  const createProcess = deps?.createProcess ?? execFileAsync;
  const platform = deps?.platform ?? process.platform;
  const env = deps?.env ?? process.env;
  const errors: unknown[] = [];

  for (const picker of buildPickerCommands(platform, env)) {
    try {
      const { stdout } = await createProcess(picker.command, picker.args);
      const selectedPath = normalizeSelectedPath(
        stdout.trim(),
        picker.outputPathStyle,
      );

      return {
        path: selectedPath || null,
        error: null,
      };
    } catch (error) {
      errors.push(error);
    }
  }

  return {
    path: null,
    error: formatPickerError(errors.at(-1)),
  };
}

function buildPickerCommands(
  platform: NodeJS.Platform | string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
) {
  const commands: PickerCommand[] = [];

  if (platform === "linux" && isWsl(env)) {
    commands.push(buildWindowsFolderPickerCommand());
  }

  if (platform === "linux") {
    commands.push(
      {
        command: "zenity",
        args: [
          "--file-selection",
          "--directory",
          "--title=选择本地数据集文件夹",
        ],
      },
      {
        command: "kdialog",
        args: ["--getexistingdirectory", process.cwd(), "选择本地数据集文件夹"],
      },
    );
  } else if (platform === "darwin") {
    commands.push({
      command: "osascript",
      args: [
        "-e",
        'POSIX path of (choose folder with prompt "选择本地数据集文件夹")',
      ],
    });
  } else if (platform === "win32") {
    commands.push(buildWindowsFolderPickerCommand());
  }

  commands.push({
    command: "python3",
    args: ["-c", buildTkinterPickerScript()],
  });

  return commands;
}

function buildWindowsFolderPickerCommand(): PickerCommand {
  return {
    command: "powershell.exe",
    outputPathStyle: "windows",
    args: [
      "-NoProfile",
      "-Command",
      [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
        '$dialog.Description = "选择本地数据集文件夹"',
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }",
      ].join("; "),
    ],
  };
}

function isWsl(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP);
}

function normalizeSelectedPath(
  path: string,
  style?: PickerCommand["outputPathStyle"],
) {
  if (style === "windows") {
    return windowsPathToWslPath(path);
  }
  return path;
}

function windowsPathToWslPath(path: string) {
  const match = path.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) return path;

  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

function buildTkinterPickerScript() {
  return [
    "import tkinter as tk",
    "from tkinter import filedialog",
    "root = tk.Tk()",
    "root.withdraw()",
    "root.attributes('-topmost', True)",
    "print(filedialog.askdirectory())",
    "root.destroy()",
  ].join(";");
}
