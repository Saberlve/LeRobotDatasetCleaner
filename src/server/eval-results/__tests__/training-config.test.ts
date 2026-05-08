import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  parseTrainingConfigs,
  updateTrainingConfig,
} from "@/server/eval-results/training-config";

const SAMPLE_CONFIG = `
import dataclasses

@dataclasses.dataclass(frozen=True)
class TrainConfig:
    batch_size: int = 32
    gradient_accumulation_steps: int = 1
    num_train_steps: int = 30_000
    save_interval: int = 2000
    base_lr: float | None = None
    memory_lr: float | None = None

_CONFIGS = [
    TrainConfig(
        name="explicit",
        memory=MemoryConfig(
            moment_token_count=4,
        ),
        batch_size=128,
        lr_schedule=_optimizer.CosineDecaySchedule(
            peak_lr=5e-5,
        ),
        num_train_steps=30_000,
    ),
]
`;

const BASELINE_SAMPLE_CONFIG = `
_CONFIGS = [
    TrainConfig(
        name="pi05_simpler_baseline",
        batch_size=64,
    ),
    TrainConfig(
        name="pi05_simpler_memory",
        memory=MemoryConfig(
            moment_token_count=4,
        ),
    ),
]
`;

describe("training config parser and editor", () => {
  test("connects omitted values to TrainConfig and MemoryConfig defaults", () => {
    const [config] = parseTrainingConfigs(SAMPLE_CONFIG);

    expect(config.batchSize).toBe("128");
    expect(config.gradientAccumulationSteps).toBe("1");
    expect(config.saveInterval).toBe("2000");
    expect(config.peakLr).toBe("5e-5");
    expect(config.warmupSteps).toBe("1000");
    expect(config.decayLr).toBe("2.5e-6");
    expect(config.memory.enabled).toBe(true);
    expect(config.memory.momentTokenCount).toBe("4");
    expect(config.memory.cacheSize).toBe("0");
    expect(config.memory.decisionStride).toBe("None");
  });

  test("marks configs without memory as baseline configs", () => {
    const configs = parseTrainingConfigs(BASELINE_SAMPLE_CONFIG);
    const baseline = configs.find(
      (config) => config.name === "pi05_simpler_baseline",
    );
    const memory = configs.find(
      (config) => config.name === "pi05_simpler_memory",
    );

    expect(baseline?.memory.enabled).toBe(false);
    expect(baseline?.isBaseline).toBe(true);
    expect(memory?.memory.enabled).toBe(true);
    expect(memory?.isBaseline).toBe(false);
  });

  test("updates explicit and default-backed fields in config.py", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "training-config-"));
    const configPath = path.join(dir, "config.py");
    await writeFile(configPath, SAMPLE_CONFIG, "utf8");

    const result = await updateTrainingConfig(
      {
        name: "explicit",
        batchSize: "64",
        saveInterval: "500",
        peakLr: "1e-4",
        warmupSteps: "2000",
        memory: {
          momentTokenCount: "6",
          cacheSize: "8",
          decisionStride: "4",
        },
      },
      configPath,
    );

    const updatedSource = await readFile(configPath, "utf8");
    expect(result.config.batchSize).toBe("64");
    expect(result.config.saveInterval).toBe("500");
    expect(result.config.warmupSteps).toBe("2000");
    expect(result.config.memory.cacheSize).toBe("8");
    expect(updatedSource).toContain("batch_size=64");
    expect(updatedSource).toContain("save_interval=500");
    expect(updatedSource).toContain("warmup_steps=2000");
    expect(updatedSource).toContain("peak_lr=1e-4");
    expect(updatedSource).toContain("moment_token_count=6");
    expect(updatedSource).toContain("cache_size=8");
    expect(updatedSource).toContain("decision_stride=4");
  });
});
