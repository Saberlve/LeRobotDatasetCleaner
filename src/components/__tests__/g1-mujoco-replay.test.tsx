// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import G1MujocoReplay from "@/components/g1-mujoco-replay";

vi.mock(
  "@mujoco/mujoco",
  () => ({
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
  }),
  { virtual: true },
);

vi.mock("@/components/urdf-viewer", () => ({
  default: ({ data }: { data: unknown }) => (
    <div data-testid="urdf-viewer">{JSON.stringify(data)}</div>
  ),
}));

afterEach(() => {
  cleanup();
});

function makeRow(length = 29, offset = 0) {
  return Object.fromEntries(
    Array.from({ length }, (_, index) => [
      `observation.state | ${index}`,
      index + offset,
    ]),
  );
}

describe("G1MujocoReplay", () => {
  test("renders loading then ready state for a valid G1 trajectory", async () => {
    render(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={4}
        initialChartData={[makeRow(), makeRow(29, 1)]}
      />,
    );

    expect(screen.getByText("Loading Replay…").textContent).toBe("Loading Replay…");
    await waitFor(() =>
      expect(screen.getByText("Episode 4").textContent).toBe("Episode 4"),
    );

    expect(screen.getByRole("button", { name: "Play" }).textContent).toBe("Play");
    expect(screen.getByText("Frame 0/1").textContent).toBe("Frame 0/1");
  });

  test("renders fallback data through the URDF viewer when replay init fails", async () => {
    render(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={2}
        initialChartData={[{ "observation.state | 0": 0 }]}
        fallbackData={{ source: "fallback" }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("urdf-viewer").textContent).toBe(
        '{"source":"fallback"}',
      ),
    );
  });

  test("supports play, pause, and reset controls", async () => {
    const { rerender } = render(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={4}
        initialChartData={[makeRow(), makeRow(29, 1)]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Play" }).textContent).toBe(
        "Play",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" }).textContent).toBe(
      "Pause",
    );

    await waitFor(() =>
      expect(screen.getByText("Frame 1/1").textContent).toBe("Frame 1/1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" }).textContent).toBe(
      "Play",
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Frame 0/1").textContent).toBe("Frame 0/1");
  });

  test("resets frame and playing state when replay input changes", async () => {
    const { rerender } = render(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={4}
        initialChartData={[makeRow(), makeRow(29, 1)]}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    await waitFor(() =>
      expect(screen.getByText("Frame 1/1").textContent).toBe("Frame 1/1"),
    );

    rerender(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={5}
        initialChartData={[makeRow(29, 100), makeRow(29, 101)]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Episode 5").textContent).toBe("Episode 5"),
    );
    expect(screen.getByRole("button", { name: "Play" }).textContent).toBe(
      "Play",
    );
    expect(screen.getByText("Frame 0/1").textContent).toBe("Frame 0/1");
  });
});
