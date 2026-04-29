import { describe, expect, test } from "vitest";
import {
  applyRobotMaterial,
  autoMatchJoints,
  getGripperJointValue,
  getMeshMaterialOptions,
  getRobotConfig,
  getViewConfig,
} from "@/components/urdf-viewer";
import * as THREE from "three";

describe("URDFViewer Acone support", () => {
  test("loads the Acone URDF asset for Acone robot types", () => {
    expect(getRobotConfig("Acone")).toEqual({
      urdfUrl: "/urdf/acone/acone.urdf",
      scale: 1,
    });
  });

  test("uses a side-facing Acone camera instead of the generic overhead view", () => {
    expect(getViewConfig("/urdf/acone/acone.urdf", 1)).toEqual({
      cameraPosition: [0.75, 0.45, 0.35],
      orbitTarget: [0, 0.08, 0.1],
      gridCellSize: 0.1,
      gridSectionSize: 0.5,
      gridFadeDistance: 5,
    });
  });

  test("inverts Acone gripper values so larger dataset values close the gripper", () => {
    const range = { min: 0, max: 100 };

    expect(getGripperJointValue("left_joint7", 0, range)).toBeCloseTo(0.044);
    expect(getGripperJointValue("left_joint7", 100, range)).toBeCloseTo(0);
    expect(getGripperJointValue("right_joint18", 25, range)).toBeCloseTo(0.033);
  });

  test("assigns distinct Acone mesh colors by side and gripper part", () => {
    expect(getMeshMaterialOptions("/urdf/acone/meshes/base_link.STL")).toEqual(
      expect.objectContaining({ color: "#ffffff" }),
    );
    expect(getMeshMaterialOptions("/urdf/acone/meshes/left_link3.STL")).toEqual(
      expect.objectContaining({ color: "#fffbf6" }),
    );
    expect(getMeshMaterialOptions("/urdf/acone/meshes/left_link4.STL")).toEqual(
      expect.objectContaining({ color: "#909090" }),
    );
    expect(
      getMeshMaterialOptions("/urdf/acone/meshes/right_link14.STL"),
    ).toEqual(expect.objectContaining({ color: "#cad1ed" }));
    expect(getMeshMaterialOptions("/urdf/acone/meshes/left_link7.STL")).toEqual(
      expect.objectContaining({ color: "#ffffff" }),
    );
  });

  test("assigns Acone colors when URDFLoader passes relative mesh URLs", () => {
    expect(getMeshMaterialOptions("meshes/left_link4.STL", "acone")).toEqual(
      expect.objectContaining({ color: "#909090" }),
    );
    expect(getMeshMaterialOptions("meshes/right_link15.STL", "acone")).toEqual(
      expect.objectContaining({ color: "#b2b2b2" }),
    );
  });

  test("reapplies Acone colors after URDFLoader overwrites mesh materials", () => {
    const robot = new THREE.Group() as THREE.Group & {
      visual: Record<string, THREE.Object3D>;
    };
    const visual = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: "#ffffff" }),
    );
    visual.add(mesh);
    robot.visual = { left_link4: visual };

    applyRobotMaterial(robot, "acone");

    expect(
      (mesh.material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe("909090");
  });

  test("reapplies Acone colors using robot.links after URDFLoader overwrites mesh materials", () => {
    const robot = new THREE.Group() as THREE.Group & {
      links: Record<string, THREE.Object3D>;
    };
    const link = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshStandardMaterial({ color: "#ffffff" }),
    );
    link.add(mesh);
    robot.links = { left_link4: link };

    applyRobotMaterial(robot, "acone");

    expect(
      (mesh.material as THREE.MeshStandardMaterial).color.getHexString(),
    ).toBe("909090");
  });

  test("maps Acone dataset state names to URDF joints", () => {
    const mapping = autoMatchJoints(
      [
        "left_joint1",
        "left_joint2",
        "left_joint3",
        "left_joint4",
        "left_joint5",
        "left_joint6",
        "left_joint7",
        "left_joint8",
        "right_joint11",
        "right_joint12",
        "right_joint13",
        "right_joint14",
        "right_joint15",
        "right_joint16",
        "right_joint17",
        "right_joint18",
      ],
      [
        "observation.state | left_waist",
        "observation.state | left_shoulder",
        "observation.state | left_elbow",
        "observation.state | left_forearm_roll",
        "observation.state | left_wrist_angle",
        "observation.state | left_wrist_rotate",
        "observation.state | left_gripper",
        "observation.state | right_waist",
        "observation.state | right_shoulder",
        "observation.state | right_elbow",
        "observation.state | right_forearm_roll",
        "observation.state | right_wrist_angle",
        "observation.state | right_wrist_rotate",
        "observation.state | right_gripper",
      ],
    );

    expect(mapping).toMatchObject({
      left_joint1: "observation.state | left_waist",
      left_joint2: "observation.state | left_shoulder",
      left_joint3: "observation.state | left_elbow",
      left_joint4: "observation.state | left_forearm_roll",
      left_joint5: "observation.state | left_wrist_angle",
      left_joint6: "observation.state | left_wrist_rotate",
      left_joint7: "observation.state | left_gripper",
      left_joint8: "observation.state | left_gripper",
      right_joint11: "observation.state | right_waist",
      right_joint12: "observation.state | right_shoulder",
      right_joint13: "observation.state | right_elbow",
      right_joint14: "observation.state | right_forearm_roll",
      right_joint15: "observation.state | right_wrist_angle",
      right_joint16: "observation.state | right_wrist_rotate",
      right_joint17: "observation.state | right_gripper",
      right_joint18: "observation.state | right_gripper",
    });
  });
});
