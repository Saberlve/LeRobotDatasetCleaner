import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const OPENPI_TRAINING_CONFIG_PATH =
  process.env.OPENPI_TRAINING_CONFIG_PATH ||
  path.join(os.homedir(), "code/openpi-simpler/src/openpi/training/config.py");

export type TrainingConfigSummary = {
  name: string;
  projectName: string;
  expName: string;
  dataFactory: string;
  repoId: string;
  model: string;
  actionHorizon: string;
  discreteStateInput: string;
  batchSize: string;
  gradientAccumulationSteps: string;
  numTrainSteps: string;
  saveInterval: string;
  peakLr: string;
  warmupSteps: string;
  decaySteps: string;
  decayLr: string;
  baseLr: string;
  memoryLr: string;
  emaDecay: string;
  wandbEnabled: string;
  trainVisionEncoder: string;
  loraEnabled: boolean;
  memory: {
    enabled: boolean;
    momentTokenCount: string;
    cacheSize: string;
    decisionStride: string;
    layerIndices: string;
    initialization: string;
  };
};

export type EditableTrainingConfigPatch = {
  name: string;
  batchSize?: string;
  gradientAccumulationSteps?: string;
  numTrainSteps?: string;
  saveInterval?: string;
  peakLr?: string;
  warmupSteps?: string;
  decaySteps?: string;
  decayLr?: string;
  baseLr?: string;
  memoryLr?: string;
  memory?: {
    momentTokenCount?: string;
    cacheSize?: string;
    decisionStride?: string;
  };
};

const TRAIN_DEFAULTS = {
  projectName: "openpi-rmbench",
  expName: "-",
  batchSize: "32",
  gradientAccumulationSteps: "1",
  numTrainSteps: "30000",
  saveInterval: "2000",
  peakLr: "2.5e-5",
  warmupSteps: "1000",
  decaySteps: "30000",
  decayLr: "2.5e-6",
  baseLr: "None",
  memoryLr: "None",
  emaDecay: "0.99",
  wandbEnabled: "True",
  trainVisionEncoder: "True",
};

const MEMORY_DEFAULTS = {
  momentTokenCount: "0",
  cacheSize: "0",
  decisionStride: "None",
  layerIndices: "None",
};

function stripComments(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => {
      let quote: string | null = null;
      let escaped = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (quote) {
          if (escaped) {
            escaped = false;
          } else if (char === "\\") {
            escaped = true;
          } else if (char === quote) {
            quote = null;
          }
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === "#") return line.slice(0, index);
      }
      return line;
    })
    .join("\n");
}

function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
}

function extractCallBlocks(source: string, functionName: string): string[] {
  const blocks: string[] = [];
  let searchIndex = 0;
  const needle = `${functionName}(`;

  while (searchIndex < source.length) {
    const start = source.indexOf(needle, searchIndex);
    if (start === -1) break;
    const openIndex = start + functionName.length;
    const closeIndex = findMatchingParen(source, openIndex);
    if (closeIndex === -1) break;
    blocks.push(source.slice(start, closeIndex + 1));
    searchIndex = closeIndex + 1;
  }

  return blocks;
}

function callArguments(callText: string): string {
  const openIndex = callText.indexOf("(");
  const closeIndex = callText.lastIndexOf(")");
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return "";
  }
  return callText.slice(openIndex + 1, closeIndex);
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let start = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }

  const finalPart = input.slice(start).trim();
  if (finalPart) parts.push(finalPart);
  return parts;
}

function topLevelEqualIndex(input: string): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth += 1;
    if (char === ")" || char === "]" || char === "}") depth -= 1;
    if (char === "=" && depth === 0) return index;
  }

  return -1;
}

function topLevelValue(callText: string, key: string): string | null {
  for (const part of splitTopLevel(callArguments(callText))) {
    const equalIndex = topLevelEqualIndex(part);
    if (equalIndex === -1) continue;
    if (part.slice(0, equalIndex).trim() === key) {
      return part.slice(equalIndex + 1).trim();
    }
  }
  return null;
}

function cleanLiteral(raw: string | null, fallback = "-"): string {
  if (!raw) return fallback;
  const value = raw.trim();
  const stringMatch = value.match(/^f?["']([\s\S]+)["']$/);
  if (stringMatch) return stringMatch[1];
  if (/^[\d_.+-]+(?:e[\d+-]+)?$/i.test(value)) {
    return value.replace(/_/g, "");
  }
  return value || fallback;
}

function functionName(raw: string | null, fallback = "-"): string {
  if (!raw) return fallback;
  const match = raw.trim().match(/^([\w.]+)\s*\(/);
  if (!match) return fallback;
  return match[1].split(".").at(-1) ?? fallback;
}

function nestedValue(raw: string | null, key: string): string | null {
  if (!raw || !raw.includes("(")) return null;
  return topLevelValue(raw, key);
}

function firstNestedValue(raw: string | null, key: string): string | null {
  if (!raw) return null;
  const direct = nestedValue(raw, key);
  if (direct) return direct;

  for (const block of extractCallBlocks(raw, "DataConfig")) {
    const value = topLevelValue(block, key);
    if (value) return value;
  }

  return null;
}

function parseMemory(raw: string | null): TrainingConfigSummary["memory"] {
  if (!raw) {
    return {
      enabled: false,
      momentTokenCount: MEMORY_DEFAULTS.momentTokenCount,
      cacheSize: MEMORY_DEFAULTS.cacheSize,
      decisionStride: MEMORY_DEFAULTS.decisionStride,
      layerIndices: MEMORY_DEFAULTS.layerIndices,
      initialization: "none",
    };
  }

  const initialization = nestedValue(raw, "initialization");
  return {
    enabled: true,
    momentTokenCount: cleanLiteral(
      nestedValue(raw, "moment_token_count"),
      MEMORY_DEFAULTS.momentTokenCount,
    ),
    cacheSize: cleanLiteral(
      nestedValue(raw, "cache_size"),
      MEMORY_DEFAULTS.cacheSize,
    ),
    decisionStride: cleanLiteral(
      nestedValue(raw, "decision_stride"),
      MEMORY_DEFAULTS.decisionStride,
    ),
    layerIndices: cleanLiteral(
      nestedValue(raw, "memory_layer_indices"),
      MEMORY_DEFAULTS.layerIndices,
    ),
    initialization: initialization
      ? functionName(initialization, "custom")
      : "none",
  };
}

function parseConfigBlock(block: string): TrainingConfigSummary | null {
  const name = cleanLiteral(topLevelValue(block, "name"), "");
  if (!name) return null;

  const data = topLevelValue(block, "data");
  const model = topLevelValue(block, "model");
  const lrSchedule = topLevelValue(block, "lr_schedule");
  const memory = topLevelValue(block, "memory");
  const loraConfig = topLevelValue(block, "lora_config");

  return {
    name,
    projectName: cleanLiteral(
      topLevelValue(block, "project_name"),
      TRAIN_DEFAULTS.projectName,
    ),
    expName: cleanLiteral(
      topLevelValue(block, "exp_name"),
      TRAIN_DEFAULTS.expName,
    ),
    dataFactory: functionName(data),
    repoId: cleanLiteral(firstNestedValue(data, "repo_id")),
    model: functionName(model, "Pi0Config"),
    actionHorizon: cleanLiteral(nestedValue(model, "action_horizon")),
    discreteStateInput: cleanLiteral(
      nestedValue(model, "discrete_state_input"),
      "-",
    ),
    batchSize: cleanLiteral(
      topLevelValue(block, "batch_size"),
      TRAIN_DEFAULTS.batchSize,
    ),
    gradientAccumulationSteps: cleanLiteral(
      topLevelValue(block, "gradient_accumulation_steps"),
      TRAIN_DEFAULTS.gradientAccumulationSteps,
    ),
    numTrainSteps: cleanLiteral(
      topLevelValue(block, "num_train_steps"),
      TRAIN_DEFAULTS.numTrainSteps,
    ),
    saveInterval: cleanLiteral(
      topLevelValue(block, "save_interval"),
      TRAIN_DEFAULTS.saveInterval,
    ),
    peakLr: cleanLiteral(
      nestedValue(lrSchedule, "peak_lr"),
      TRAIN_DEFAULTS.peakLr,
    ),
    warmupSteps: cleanLiteral(
      nestedValue(lrSchedule, "warmup_steps"),
      TRAIN_DEFAULTS.warmupSteps,
    ),
    decaySteps: cleanLiteral(
      nestedValue(lrSchedule, "decay_steps"),
      TRAIN_DEFAULTS.decaySteps,
    ),
    decayLr: cleanLiteral(
      nestedValue(lrSchedule, "decay_lr"),
      TRAIN_DEFAULTS.decayLr,
    ),
    baseLr: cleanLiteral(
      topLevelValue(block, "base_lr"),
      TRAIN_DEFAULTS.baseLr,
    ),
    memoryLr: cleanLiteral(
      topLevelValue(block, "memory_lr"),
      TRAIN_DEFAULTS.memoryLr,
    ),
    emaDecay: cleanLiteral(
      topLevelValue(block, "ema_decay"),
      TRAIN_DEFAULTS.emaDecay,
    ),
    wandbEnabled: cleanLiteral(
      topLevelValue(block, "wandb_enabled"),
      TRAIN_DEFAULTS.wandbEnabled,
    ),
    trainVisionEncoder: cleanLiteral(
      topLevelValue(block, "train_vision_encoder"),
      TRAIN_DEFAULTS.trainVisionEncoder,
    ),
    loraEnabled:
      cleanLiteral(nestedValue(loraConfig, "enabled"), "False") === "True",
    memory: parseMemory(memory),
  };
}

function configPriority(config: TrainingConfigSummary): number {
  if (config.name === "pi05_simpler_memory_pytorch_full") return 0;
  if (config.name.includes("gated_merge")) return 1;
  if (config.name.includes("rmbench") && config.name.includes("memory"))
    return 2;
  if (config.name.includes("memory")) return 3;
  if (config.name.includes("simpler") || config.name.includes("rmbench"))
    return 4;
  return 5;
}

export function parseTrainingConfigs(source: string): TrainingConfigSummary[] {
  const withoutComments = stripComments(source);
  return extractCallBlocks(withoutComments, "TrainConfig")
    .map(parseConfigBlock)
    .filter((config): config is TrainingConfigSummary => config !== null)
    .sort((left, right) => {
      const priority = configPriority(left) - configPriority(right);
      return priority || left.name.localeCompare(right.name);
    });
}

export async function loadTrainingConfigs(
  configPath: string = OPENPI_TRAINING_CONFIG_PATH,
): Promise<TrainingConfigSummary[]> {
  try {
    const source = await readFile(configPath, "utf8");
    return parseTrainingConfigs(source);
  } catch {
    return [];
  }
}

function pyValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("参数不能为空");
  }
  if (normalized === "None") return normalized;
  if (/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(normalized)) return normalized;
  throw new Error(`不支持的参数值: ${value}`);
}

function findTrainConfigRange(
  source: string,
  configName: string,
): { start: number; end: number } {
  let searchIndex = 0;
  const needle = "TrainConfig(";

  while (searchIndex < source.length) {
    const start = source.indexOf(needle, searchIndex);
    if (start === -1) break;
    const openIndex = start + "TrainConfig".length;
    const closeIndex = findMatchingParen(source, openIndex);
    if (closeIndex === -1) break;

    const block = source.slice(start, closeIndex + 1);
    const name = cleanLiteral(topLevelValue(stripComments(block), "name"), "");
    if (name === configName) return { start, end: closeIndex + 1 };
    searchIndex = closeIndex + 1;
  }

  throw new Error(`未找到训练配置: ${configName}`);
}

function inferIndent(block: string): string {
  const match = block.match(/\n(\s+)name\s*=/);
  return match?.[1] ?? "        ";
}

function replaceOrInsertScalarField(
  block: string,
  key: string,
  value: string,
): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fieldPattern = new RegExp(
    `^(\\s*)${escapedKey}\\s*=\\s*[^,\\n]+,?`,
    "m",
  );
  if (fieldPattern.test(block)) {
    return block.replace(fieldPattern, `$1${key}=${pyValue(value)},`);
  }

  const indent = inferIndent(block);
  const insertLine = `${indent}${key}=${pyValue(value)},\n`;
  const lrIndex = block.search(new RegExp(`^${indent}lr_schedule\\s*=`, "m"));
  const numStepsIndex = block.search(
    new RegExp(`^${indent}num_train_steps\\s*=`, "m"),
  );
  const insertIndex =
    lrIndex >= 0
      ? lrIndex
      : numStepsIndex >= 0
        ? numStepsIndex
        : block.lastIndexOf("\n)");

  return `${block.slice(0, insertIndex)}${insertLine}${block.slice(insertIndex)}`;
}

function findAssignedCallRange(
  block: string,
  assignmentKey: string,
): { start: number; end: number } | null {
  const assignmentIndex = block.search(
    new RegExp(`^\\s*${assignmentKey}\\s*=`, "m"),
  );
  if (assignmentIndex === -1) return null;
  const openIndex = block.indexOf("(", assignmentIndex);
  if (openIndex === -1) return null;
  const closeIndex = findMatchingParen(block, openIndex);
  if (closeIndex === -1) return null;
  return { start: assignmentIndex, end: closeIndex + 1 };
}

function ensureAssignedCall(
  block: string,
  assignmentKey: string,
  callName: string,
  insertAfterKey: string,
): string {
  if (findAssignedCallRange(block, assignmentKey)) return block;

  const indent = inferIndent(block);
  const inserted = `${indent}${assignmentKey}=${callName}(\n${indent}    ),\n`;
  const afterPattern = new RegExp(
    `^${indent}${insertAfterKey}\\s*=\\s*[^,\\n]+,?\\n`,
    "m",
  );
  const afterMatch = block.match(afterPattern);
  if (afterMatch?.index !== undefined) {
    const insertIndex = afterMatch.index + afterMatch[0].length;
    return `${block.slice(0, insertIndex)}${inserted}${block.slice(insertIndex)}`;
  }

  const insertIndex = block.lastIndexOf("\n)");
  return `${block.slice(0, insertIndex)}${inserted}${block.slice(insertIndex)}`;
}

function replaceOrInsertNestedField(
  callText: string,
  key: string,
  value: string,
): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fieldPattern = new RegExp(
    `^(\\s*)${escapedKey}\\s*=\\s*[^,\\n]+,?`,
    "m",
  );
  if (fieldPattern.test(callText)) {
    return callText.replace(fieldPattern, `$1${key}=${pyValue(value)},`);
  }

  const firstLine = callText.split(/\r?\n/)[0];
  const baseIndent = firstLine.match(/^(\s*)/)?.[1] ?? "";
  const fieldIndent = `${baseIndent}    `;
  const insertIndex = callText.indexOf("\n", callText.indexOf("("));
  return `${callText.slice(0, insertIndex + 1)}${fieldIndent}${key}=${pyValue(
    value,
  )},\n${callText.slice(insertIndex + 1)}`;
}

function updateAssignedCallField(
  block: string,
  assignmentKey: string,
  callName: string,
  insertAfterKey: string,
  nestedKey: string,
  value: string | undefined,
): string {
  if (value === undefined) return block;
  const ensured = ensureAssignedCall(
    block,
    assignmentKey,
    callName,
    insertAfterKey,
  );
  const range = findAssignedCallRange(ensured, assignmentKey);
  if (!range) return ensured;
  const callText = ensured.slice(range.start, range.end);
  const updatedCall = replaceOrInsertNestedField(callText, nestedKey, value);
  return `${ensured.slice(0, range.start)}${updatedCall}${ensured.slice(range.end)}`;
}

function applyTrainingPatchToBlock(
  block: string,
  patch: EditableTrainingConfigPatch,
): string {
  let next = block;
  const scalarFields: Array<[keyof EditableTrainingConfigPatch, string]> = [
    ["batchSize", "batch_size"],
    ["gradientAccumulationSteps", "gradient_accumulation_steps"],
    ["numTrainSteps", "num_train_steps"],
    ["saveInterval", "save_interval"],
    ["baseLr", "base_lr"],
    ["memoryLr", "memory_lr"],
  ];

  for (const [patchKey, pyKey] of scalarFields) {
    const value = patch[patchKey];
    if (typeof value === "string") {
      next = replaceOrInsertScalarField(next, pyKey, value);
    }
  }

  const lrFields: Array<[keyof EditableTrainingConfigPatch, string]> = [
    ["warmupSteps", "warmup_steps"],
    ["peakLr", "peak_lr"],
    ["decaySteps", "decay_steps"],
    ["decayLr", "decay_lr"],
  ];
  for (const [patchKey, pyKey] of lrFields) {
    const value = patch[patchKey];
    next = updateAssignedCallField(
      next,
      "lr_schedule",
      "_optimizer.CosineDecaySchedule",
      "batch_size",
      pyKey,
      typeof value === "string" ? value : undefined,
    );
  }

  const memoryFields: Array<
    [keyof NonNullable<EditableTrainingConfigPatch["memory"]>, string]
  > = [
    ["momentTokenCount", "moment_token_count"],
    ["cacheSize", "cache_size"],
    ["decisionStride", "decision_stride"],
  ];
  for (const [patchKey, pyKey] of memoryFields) {
    const value = patch.memory?.[patchKey];
    next = updateAssignedCallField(
      next,
      "memory",
      "MemoryConfig",
      "model",
      pyKey,
      typeof value === "string" ? value : undefined,
    );
  }

  return next;
}

export async function updateTrainingConfig(
  patch: EditableTrainingConfigPatch,
  configPath: string = OPENPI_TRAINING_CONFIG_PATH,
): Promise<{
  config: TrainingConfigSummary;
  configs: TrainingConfigSummary[];
}> {
  const source = await readFile(configPath, "utf8");
  const range = findTrainConfigRange(source, patch.name);
  const block = source.slice(range.start, range.end);
  const updatedBlock = applyTrainingPatchToBlock(block, patch);
  const updatedSource = `${source.slice(0, range.start)}${updatedBlock}${source.slice(
    range.end,
  )}`;

  await writeFile(configPath, updatedSource, "utf8");

  const configs = parseTrainingConfigs(updatedSource);
  const config = configs.find((item) => item.name === patch.name);
  if (!config) throw new Error(`更新后未找到训练配置: ${patch.name}`);
  return { config, configs };
}
