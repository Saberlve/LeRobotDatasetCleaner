import { describe, expect, test } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  MUJOCO_ASSET_VFS_DIR,
  extractMujocoMeshFilenames,
  extractMujocoMeshdir,
  prepareMujocoVisualPoseXml,
  rewriteMujocoMeshdir,
} from "@/components/mujoco-sim-viewer-helpers";

describe("extractMujocoMeshFilenames", () => {
  test("returns no files for primitive-only MuJoCo XML", () => {
    expect(
      extractMujocoMeshFilenames(`
        <mujoco>
          <worldbody><geom type="box" size="1 1 1" /></worldbody>
        </mujoco>
      `),
    ).toEqual([]);
  });

  test("extracts unique mesh basenames from XML assets", () => {
    expect(
      extractMujocoMeshFilenames(`
        <mujoco>
          <asset>
            <mesh name="pelvis" file="assets/pelvis.STL" />
            <mesh name="hand" file="meshes/right_hand.STL" />
            <mesh name="pelvis_again" file="pelvis.STL" />
          </asset>
        </mujoco>
      `),
    ).toEqual(["pelvis.STL", "right_hand.STL"]);
  });
});

describe("rewriteMujocoMeshdir", () => {
  test("rewrites meshdir to the MuJoCo virtual filesystem", () => {
    expect(
      rewriteMujocoMeshdir('<compiler angle="radian" meshdir="assets" />'),
    ).toContain(`meshdir="${MUJOCO_ASSET_VFS_DIR}"`);
  });

  test("leaves primitive-only XML untouched when meshdir is absent", () => {
    const xml = '<compiler angle="radian" autolimits="true" />';
    expect(rewriteMujocoMeshdir(xml)).toBe(xml);
  });
});

describe("extractMujocoMeshdir", () => {
  test("returns the configured meshdir", () => {
    expect(
      extractMujocoMeshdir(
        '<compiler angle="radian" meshdir="assets-lowpoly" />',
      ),
    ).toBe("assets-lowpoly");
  });

  test("falls back to assets when meshdir is absent", () => {
    expect(extractMujocoMeshdir('<compiler angle="radian" />')).toBe("assets");
  });
});

describe("prepareMujocoVisualPoseXml", () => {
  test("removes mesh assets and rewrites mesh geoms to invisible placeholders", () => {
    const prepared = prepareMujocoVisualPoseXml(`
      <mujoco>
        <asset>
          <material name="dark" rgba="0.2 0.2 0.2 1" />
          <mesh name="head_link" file="head_link.STL" />
        </asset>
        <worldbody>
          <body name="torso_link">
            <geom name="head_visual" pos="0.0039635 0 -0.044" quat="1 0 0 0" type="mesh" rgba="0.2 0.2 0.2 1" mesh="head_link" />
          </body>
        </worldbody>
      </mujoco>
    `);

    expect(prepared).not.toContain("<mesh");
    expect(extractMujocoMeshFilenames(prepared)).toEqual([]);
    expect(prepared).toContain('name="head_visual"');
    expect(prepared).toContain('pos="0.0039635 0 -0.044"');
    expect(prepared).toContain('quat="1 0 0 0"');
    expect(prepared).toContain('type="box"');
    expect(prepared).toContain('size="0.001 0.001 0.001"');
    expect(prepared).toContain('rgba="0 0 0 0"');
  });
});

describe("G1 MuJoCo assembly", () => {
  test("uses the Menagerie-style torso/head visual attachment", () => {
    const xml = fs.readFileSync(
      path.join(process.cwd(), "public/mujoco/g1/g1.xml"),
      "utf8",
    );

    expect(xml).toContain('<body name="waist_yaw_link">');
    expect(xml).toContain(
      '<body name="waist_roll_link" pos="-0.0039635 0 0.044">',
    );
    expect(xml).toContain('<body name="torso_link">');
    expect(xml).toContain(
      '<geom pos="0.0039635 0 -0.044" quat="1 0 0 0" mesh="head_link"',
    );
    expect(xml).not.toContain('<body name="head_link" pos="0 0 0.24">');
  });

  test("uses original G1 limb offsets instead of simplified placeholder offsets", () => {
    const xml = fs.readFileSync(
      path.join(process.cwd(), "public/mujoco/g1/g1.xml"),
      "utf8",
    );

    expect(xml).toContain(
      '<body name="left_hip_roll_link" pos="0 0.052 -0.030465" quat="0.996179 0 -0.0873386 0">',
    );
    expect(xml).toContain(
      '<body name="left_shoulder_pitch_link" pos="0.0039563 0.10022 0.24778" quat="0.990264 0.139201 1.38722e-05 -9.86868e-05">',
    );
    expect(xml).toContain(
      '<body name="right_shoulder_pitch_link" pos="0.0039563 -0.10021 0.24778" quat="0.990264 -0.139201 1.38722e-05 9.86868e-05">',
    );
    expect(xml).not.toContain(
      '<body name="left_elbow_link" pos="0.19 0 -0.02">',
    );
  });
});
