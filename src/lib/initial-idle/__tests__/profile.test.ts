import { describe, expect, test } from "vitest";
import {
  inspectIdleSignals,
  loadIdleProfile,
  profileIssues,
  saveIdleProfile,
} from "../profile";
import { profile, schema } from "./fixtures";
import { createXarmIdleProfile } from "../presets";

describe("signal semantics and saved profiles", () => {
  test("maps all 17 xArm dimensions, including pose and the final gripper", () => {
    const info = schema();
    const names = [
      ...Array.from({ length: 7 }, (_, i) => `J${i + 1}.pos`),
      "pose.x",
      "pose.y",
      "pose.z",
      "pose.r11",
      "pose.r21",
      "pose.r31",
      "pose.r12",
      "pose.r22",
      "pose.r32",
      "gripper.pos",
    ];
    for (const key of ["observation.state", "action"])
      info.features[key] = { dtype: "float32", shape: [17], names: [...names] };
    info.fps = 15;
    const configured = createXarmIdleProfile(info)!;
    expect(inspectIdleSignals(info, configured).ready).toBe(true);
    expect(configured.channels[16]).toMatchObject({
      role: "gripper",
      stateIndex: 16,
      actionIndex: 16,
    });
    expect(configured.channels[7].stateUnit).toBe("mm");
    expect(configured.channels[10].stateUnit).toBe("dimensionless");
    expect(configured.maxGapSeconds).toBeCloseTo(2.5 / 15);
    info.features.action.names = [...names].reverse();
    expect(createXarmIdleProfile(info)).toBeNull();
  });
  test("does not guess gripper, action semantics or thresholds", () => {
    expect(inspectIdleSignals(schema()).ready).toBe(false);
    expect(inspectIdleSignals(schema(), profile()).ready).toBe(true);
    const p = profile();
    p.channels.pop();
    expect(inspectIdleSignals(schema(), p).ready).toBe(false);
    expect(
      profileIssues({ ...profile(), channels: [null] }).length,
    ).toBeGreaterThan(0);
  });
  test("refuses unmapped dimensions, duplicate mapping, invalid thresholds and mismatched tracking units", () => {
    const p = profile();
    p.channels[0].stateIndex = 1;
    expect(profileIssues(p).length).toBeGreaterThan(0);
    p.channels[0].stateIndex = 0;
    p.channels[0].stateSpeed = 0;
    expect(profileIssues(p).length).toBeGreaterThan(0);
    p.channels[0].stateSpeed = 0.05;
    p.channels[0].trackingError = 1;
    p.channels[0].actionUnit = "different";
    expect(profileIssues(p).length).toBeGreaterThan(0);
  });
  test("requires an actual declared boolean event", () => {
    expect(
      inspectIdleSignals(schema(), { ...profile(), startEventKey: "next.done" })
        .ready,
    ).toBe(false);
  });
  test("restores only the same dataset and signal schema; malformed storage is ignored", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    saveIdleProfile(storage, "lab/a", schema(), profile());
    expect(loadIdleProfile(storage, "lab/a", schema())).toEqual(profile());
    expect(loadIdleProfile(storage, "lab/b", schema())).toBeNull();
    expect(
      loadIdleProfile(storage, "lab/a", { ...schema(), fps: 30 }),
    ).toBeNull();
    data.set("lerobot-initial-idle:lab/a", "broken json");
    expect(loadIdleProfile(storage, "lab/a", schema())).toBeNull();
    expect(() =>
      saveIdleProfile(
        {
          ...storage,
          setItem: () => {
            throw new Error("quota");
          },
        },
        "lab/a",
        schema(),
        profile(),
      ),
    ).toThrow("quota");
  });
});
