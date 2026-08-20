import { describe, expect, it } from "vitest";
import { hasURDFSupport, isXArm7Robot } from "@/lib/so101-robot";

describe("xArm7 URDF support", () => {
  it("recognizes xArm7 robot types case-insensitively", () => {
    expect(isXArm7Robot("xarm7")).toBe(true);
    expect(isXArm7Robot("XArm7_Gripper")).toBe(true);
    expect(hasURDFSupport("XArm7")).toBe(true);
  });

  it("does not select the xArm7 model for other xArm variants", () => {
    expect(isXArm7Robot("xarm6")).toBe(false);
    expect(isXArm7Robot(null)).toBe(false);
  });
});
