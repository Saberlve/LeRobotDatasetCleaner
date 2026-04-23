// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import G1MujocoReplay from "@/components/g1-mujoco-replay";

vi.mock("@mujoco/mujoco", () => ({
  default: vi.fn(async () => ({
    FS: {
      mkdirTree: vi.fn(),
      writeFile: vi.fn(),
    },
    MjModel: {
      from_xml_string: vi.fn(() => ({ ngeom: 0, nq: 36, delete: vi.fn() })),
    },
    MjData: vi.fn(() => ({
      qpos: new Float64Array(36),
      delete: vi.fn(),
    })),
    mj_forward: vi.fn(),
  })),
}));

describe("G1MujocoReplay", () => {
  test("renders loading then ready state for a valid G1 trajectory", async () => {
    render(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={4}
        initialChartData={[
          Object.fromEntries(
            Array.from({ length: 29 }, (_, index) => [
              `observation.state | ${index}`,
              index,
            ]),
          ),
        ]}
      />,
    );

    expect(screen.getByText("Loading Replay…")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("Episode 4")).toBeTruthy(),
    );
  });

  test("shows fallback error when a required G1 column is missing", async () => {
    render(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={1}
        initialChartData={[{ "observation.state | 0": 0 }]}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Replay unavailable: Missing G1 state column observation.state | 1",
        ),
      ).toBeTruthy(),
    );
  });
});
