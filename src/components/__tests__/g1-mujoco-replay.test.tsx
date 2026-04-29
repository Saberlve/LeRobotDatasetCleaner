// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import G1MujocoReplay from "@/components/g1-mujoco-replay";
import { TimeProvider, useTime } from "@/context/time-context";

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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () => `
        <mujoco model="g1_kinematic_replay">
          <compiler angle="radian" autolimits="true" />
          <worldbody><geom type="plane" size="1 1 0.1" /></worldbody>
        </mujoco>
      `,
      json: async () => ({ visuals: [] }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
  function renderReplay(element: React.ReactElement) {
    return render(<TimeProvider duration={1}>{element}</TimeProvider>);
  }

  function SharedPlaybackToggle() {
    const { setIsPlaying } = useTime();
    return (
      <button onClick={() => setIsPlaying((value) => !value)}>
        Toggle shared playback
      </button>
    );
  }

  test("renders loading then ready state for a valid G1 trajectory", async () => {
    renderReplay(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={4}
        initialChartData={[makeRow(), makeRow(29, 1)]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Episode 4").textContent).toBe("Episode 4"),
    );

    expect(screen.getByRole("button", { name: "Play" }).textContent).toBe(
      "Play",
    );
    expect(screen.getByText("Frame 0/1").textContent).toBe("Frame 0/1");
  });

  test("renders an explicit error instead of falling back to URDF when trajectory mapping fails", async () => {
    renderReplay(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "g1", fps: 30 } as never}
        episodeId={2}
        initialChartData={[{ "observation.state | 0": 0 }]}
        fallbackData={{ source: "fallback" }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Replay unavailable:/).textContent).toContain(
        "Missing G1 state column",
      ),
    );
    expect(screen.queryByTestId("urdf-viewer")).toBeNull();
  });

  test("renders the URDF replay for Acone trajectories without G1 validation", async () => {
    renderReplay(
      <G1MujocoReplay
        datasetInfo={{ robot_type: "Acone", fps: 30 } as never}
        episodeId={0}
        initialChartData={[{ "observation.state | 0": 0 }]}
        fallbackData={{ source: "acone" }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("urdf-viewer")).toBeDefined());
    expect(screen.queryByText(/Missing G1 state column/)).toBeNull();
  });

  test("supports play, pause, and reset controls", async () => {
    renderReplay(
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

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" }).textContent).toBe(
      "Play",
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Frame 0/1").textContent).toBe("Frame 0/1");
  });

  test("uses the shared playback state", async () => {
    render(
      <TimeProvider duration={1}>
        <SharedPlaybackToggle />
        <G1MujocoReplay
          datasetInfo={{ robot_type: "g1", fps: 30 } as never}
          episodeId={4}
          initialChartData={[makeRow(), makeRow(29, 1)]}
        />
      </TimeProvider>,
    );

    await screen.findByRole("button", { name: "Play" });

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle shared playback" }),
    );
    expect(screen.getByRole("button", { name: "Pause" }).textContent).toBe(
      "Pause",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Toggle shared playback" }),
    );
    expect(screen.getByRole("button", { name: "Play" }).textContent).toBe(
      "Play",
    );
  });

  test("resets frame and playing state when replay input changes", async () => {
    const { rerender } = render(
      <TimeProvider duration={1}>
        <G1MujocoReplay
          datasetInfo={{ robot_type: "g1", fps: 30 } as never}
          episodeId={4}
          initialChartData={[makeRow(), makeRow(29, 1)]}
        />
      </TimeProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Play" }));
    await waitFor(() =>
      expect(screen.getByText("Frame 1/1").textContent).toBe("Frame 1/1"),
    );

    rerender(
      <TimeProvider duration={1}>
        <G1MujocoReplay
          datasetInfo={{ robot_type: "g1", fps: 30 } as never}
          episodeId={5}
          initialChartData={[makeRow(29, 100), makeRow(29, 101)]}
        />
      </TimeProvider>,
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
