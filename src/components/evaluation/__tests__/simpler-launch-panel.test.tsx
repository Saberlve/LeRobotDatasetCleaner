// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

vi.mock("recharts", () => {
  return {
    CartesianGrid: ({ children }: { children?: React.ReactNode }) => (
      <div data-recharts="grid">{children}</div>
    ),
    Line: ({ dataKey }: { dataKey: string }) => <div data-recharts-line={dataKey} />,
    LineChart: ({
      children,
      data,
    }: {
      children?: React.ReactNode;
      data?: Array<unknown>;
    }) => (
      <div data-recharts="line-chart" data-points={data?.length ?? 0}>
        {children}
      </div>
    ),
    Tooltip: () => <div data-recharts="tooltip" />,
    XAxis: () => <div data-recharts="x-axis" />,
    YAxis: () => <div data-recharts="y-axis" />,
  };
});

describe("SimplerLaunchPanel", () => {
  test("shows the Simpler service card and keeps the RMBench service controls inside the live workspace", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
        rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
      }),
    );

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "启动 Simpler 服务" })).not.toBeNull();
    });

    expect(screen.getByRole("button", { name: "启动 Simpler 服务" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "停止 Simpler 服务" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "启动 RMBench 服务" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "停止 RMBench 服务" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "启动评测" })).not.toBeNull();
    expect(document.querySelector('[data-launch-layout="three-row"]')).not.toBeNull();
    expect(document.querySelector('[data-launch-row="controls"]')).not.toBeNull();
    expect(document.querySelector('[data-launch-row="logs"]')).toBeNull();
    expect(document.querySelector('[data-launch-row="frame"]')).not.toBeNull();
    expect(document.querySelector('[data-launch-row="actions"]')).not.toBeNull();
    expect(screen.queryByRole("tab", { name: "Simpler 模型服务" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "RMBench 模型服务" })).toBeNull();
  });

  test("keeps the three launch sections pinned to a stable full width", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
        rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
      }),
    );

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "启动 Simpler 服务" })).not.toBeNull();
    });

    const layout = document.querySelector('[data-launch-layout="three-row"]');
    expect(layout?.getAttribute("class")).toContain("w-full");
    expect((layout as HTMLDivElement | null)?.style.scrollbarGutter).toBe("stable both-edges");

    const launchRows = Array.from(document.querySelectorAll("[data-launch-row]"));
    expect(launchRows).toHaveLength(3);
    for (const row of launchRows) {
      expect(row.getAttribute("class")).toContain("w-full");
      expect(row.getAttribute("class")).toContain("min-w-0");
    }
  });

  test("launches the selected task id through the existing task control", async () => {
    const taskId = "bridge_spoon";
    const prompt = "put spoon on cloth";
    const fetchMock = createFetchMock({
      simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
      rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
      launchResponse: createStatus({
        runId: `2026-05-16T10-00-00-000Z_${taskId}`,
        taskId,
        prompt,
        status: "starting",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    const select = await screen.findByRole("combobox", { name: "任务选择" });
    fireEvent.change(select, { target: { value: taskId } });
    fireEvent.click(screen.getByRole("button", { name: "启动评测" }));

    await waitFor(() => {
      expect(screen.getByText(prompt)).not.toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evaluation/simpler/launch",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ taskId }),
      }),
    );
  });

  test("keeps stop enabled when the run status is final but the evaluation process is still active", async () => {
    const activeRunId = "2026-05-16T10-00-00-000Z_bridge_carrot";
    const fetchMock = createFetchMock({
      simplerStatus: createStatus({
        runId: activeRunId,
        status: "failed",
        processActive: true,
        logFiles: {
          launcher: "/tmp/launcher.log",
          server: "/tmp/server.log",
          client: "/tmp/client.log",
        },
      }),
      stopResponse: createStatus({
        runId: activeRunId,
        status: "stopped",
        processActive: false,
        logFiles: {
          launcher: "/tmp/launcher.log",
          server: "/tmp/server.log",
          client: "/tmp/client.log",
        },
      }),
      simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
      rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    const stopButton = await screen.findByRole("button", { name: "停止评测" });
    await waitFor(() => {
      expect(stopButton.hasAttribute("disabled")).toBe(false);
    });

    fireEvent.click(stopButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/evaluation/simpler/stop",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ runId: activeRunId }),
        }),
      );
    });
  });

  test("renders the RMBench service controls inside the RMBench live workspace", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
        rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
      }),
    );

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByText("RMBench Live 评测")).not.toBeNull();
    });

    expect(screen.getByRole("button", { name: "启动 RMBench 服务" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "停止 RMBench 服务" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "启动 Simpler 服务" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "停止 Simpler 服务" })).not.toBeNull();
  });

  test("starts and stops persistent benchmark servers independently", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/evaluation/simpler/status") {
        return jsonResponse(createStatus());
      }
      if (url === "/api/evaluation/rmbench/status") {
        return jsonResponse(createRmbenchStatus());
      }
      if (url === "/api/evaluation/simpler/server/status") {
        return jsonResponse(createServerStatus("simpler", { status: "stopped", port: 8123 }));
      }
      if (url === "/api/evaluation/rmbench/server/status") {
        return jsonResponse(createServerStatus("rmbench", { status: "running", port: 9123 }));
      }
      if (url === "/api/evaluation/simpler/server/start") {
        expect(init).toMatchObject({ method: "POST" });
        return jsonResponse(createServerStatus("simpler", { status: "running", port: 8123 }));
      }
      if (url === "/api/evaluation/rmbench/server/stop") {
        expect(init).toMatchObject({ method: "POST" });
        return jsonResponse(createServerStatus("rmbench", { status: "stopped", port: 9123 }));
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "启动 Simpler 服务" })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "启动 Simpler 服务" }));
    fireEvent.click(screen.getByRole("button", { name: "停止 RMBench 服务" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/evaluation/simpler/server/start",
        expect.objectContaining({ method: "POST" }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/evaluation/rmbench/server/stop",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  test("surfaces the backend error when launching without a running Simpler server", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/evaluation/simpler/status") {
        return jsonResponse(createStatus());
      }
      if (url === "/api/evaluation/rmbench/status") {
        return jsonResponse(createRmbenchStatus());
      }
      if (url === "/api/evaluation/simpler/server/status") {
        return jsonResponse(createServerStatus("simpler", { status: "stopped", port: 8123 }));
      }
      if (url === "/api/evaluation/rmbench/server/status") {
        return jsonResponse(createServerStatus("rmbench", { status: "stopped", port: 9123 }));
      }
      if (url === "/api/evaluation/simpler/launch") {
        expect(init).toMatchObject({ method: "POST" });
        return jsonResponse(
          { error: "Simpler 模型服务 未运行，请先启动 Simpler 服务。" },
          409,
        );
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "启动评测" })).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "启动评测" }));

    await waitFor(() => {
      expect(screen.getByText("Simpler 模型服务 未运行，请先启动 Simpler 服务。")).not.toBeNull();
    });
  });

  test("uses the streaming frame URL while a run is active", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        simplerStatus: createStatus({
          taskId: "bridge_carrot",
          status: "running",
          runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
          latestFrameUrl:
            "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
          frameVersion: 3,
          actionSeries: [
            {
              step: 0,
              timestamp: 1710000000.12,
              x: 0.1,
              y: 0.2,
              gripper: 1,
              width: 0.9,
            },
            {
              step: 1,
              timestamp: 1710000001.12,
              x: 0.3,
              y: 0.4,
              gripper: 0,
              width: 1.1,
            },
          ],
        }),
        simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
        rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
      }),
    );

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(
        screen
          .getByRole("img", { name: "bridge_carrot latest frame" })
          .getAttribute("src"),
      ).toBe(
        "/api/evaluation/simpler/frame/stream?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
      );
      expect(screen.getByText("模型原始动作维度")).not.toBeNull();
    });

    const frameImage = screen.getByRole("img", { name: "bridge_carrot latest frame" });
    expect(String(frameImage.getAttribute("class"))).toContain("object-contain");

  });

  test("falls back to the static final frame once the run has finished", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        simplerStatus: createStatus({
          taskId: "bridge_carrot",
          status: "succeeded",
          runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
          latestFrameUrl:
            "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
          frameVersion: 7,
        }),
        simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
        rmbenchServerStatus: createServerStatus("rmbench", { status: "stopped", port: 9123 }),
      }),
    );

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(
        screen
          .getByRole("img", { name: "bridge_carrot latest frame" })
          .getAttribute("src"),
      ).toBe(
        "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot&v=7",
      );
    });
  });

  test("keeps polling briefly after completion so a late final frame reaches the UI", async () => {
    let statusCallCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/evaluation/simpler/status") {
        statusCallCount += 1;
        if (statusCallCount === 1) {
          return jsonResponse(
            createStatus({
              taskId: "bridge_carrot",
              status: "running",
              runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
              latestFrameUrl:
                "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
              frameVersion: 3,
              updatedAt: "2026-05-15T12:00:03.000Z",
            }),
          );
        }

        if (statusCallCount === 2) {
          return jsonResponse(
            createStatus({
              taskId: "bridge_carrot",
              status: "succeeded",
              runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
              latestFrameUrl:
                "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
              frameVersion: 3,
              updatedAt: "2026-05-15T12:00:04.000Z",
            }),
          );
        }

        return jsonResponse(
          createStatus({
            taskId: "bridge_carrot",
            status: "succeeded",
            runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
            latestFrameUrl:
              "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot",
            frameVersion: 9,
            updatedAt: "2026-05-15T12:00:05.000Z",
          }),
        );
      }
      if (url === "/api/evaluation/rmbench/status") {
        return jsonResponse(createRmbenchStatus());
      }
      if (url === "/api/evaluation/simpler/server/status") {
        return jsonResponse(createServerStatus("simpler", { status: "running", port: 8123 }));
      }
      if (url === "/api/evaluation/rmbench/server/status") {
        return jsonResponse(createServerStatus("rmbench", { status: "stopped", port: 9123 }));
      }
      if (url === "/api/evaluation/simpler/server/logs?source=server") {
        return jsonResponse({
          benchmark: "simpler",
          source: "server",
          path: "/tmp/simpler-server.log",
          content: "model server ready\n",
          truncated: false,
          updatedAt: "2026-05-15T12:00:03.000Z",
        });
      }
      if (
        url ===
        "/api/evaluation/simpler/logs?runId=2026-05-15T12-00-00-000Z_bridge_carrot&source=server"
      ) {
        return jsonResponse({
          runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
          source: "server",
          path: "/tmp/server.log",
          content: "server ready\n",
          truncated: false,
          updatedAt: "2026-05-15T12:00:04.000Z",
        });
      }
      if (
        url ===
        "/api/evaluation/simpler/logs?runId=2026-05-15T12-00-00-000Z_bridge_carrot&source=client"
      ) {
        return jsonResponse({
          runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
          source: "client",
          path: "/tmp/client.log",
          content: "client running\n",
          truncated: false,
          updatedAt: "2026-05-15T12:00:04.000Z",
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(
        screen
          .getByRole("img", { name: "bridge_carrot latest frame" })
          .getAttribute("src"),
      ).toBe(
        "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot&v=3",
      );
    });

    await waitFor(
      () => {
        expect(
          screen
            .getByRole("img", { name: "bridge_carrot latest frame" })
            .getAttribute("src"),
        ).toBe(
          "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00-000Z_bridge_carrot&v=9",
        );
      },
      { timeout: 1500 },
    );
  });

  test("buffers a new run until the first frame and action payload are both ready", async () => {
    const previousRunId = "2026-05-15T12-00-00-000Z_bridge_carrot";
    const nextRunId = "2026-05-16T12-00-00-000Z_bridge_spoon";
    let launched = false;
    let runningStatusCallCount = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/evaluation/simpler/status") {
        if (!launched) {
          return jsonResponse(
            createStatus({
              taskId: "bridge_carrot",
              status: "succeeded",
              runId: previousRunId,
              latestFrameUrl: `/api/evaluation/simpler/frame?runId=${previousRunId}`,
              frameVersion: 7,
            }),
          );
        }

        runningStatusCallCount += 1;
        if (runningStatusCallCount < 3) {
          return jsonResponse(
            createStatus({
              taskId: "bridge_spoon",
              status: "running",
              runId: nextRunId,
              latestFrameUrl: `/api/evaluation/simpler/frame?runId=${nextRunId}`,
              frameVersion: 0,
              actionSeries: [],
            }),
          );
        }

        return jsonResponse(
          createStatus({
            taskId: "bridge_spoon",
            status: "running",
            runId: nextRunId,
            latestFrameUrl: `/api/evaluation/simpler/frame?runId=${nextRunId}`,
            frameVersion: 2,
            actionSeries: [
              {
                step: 0,
                timestamp: 1710000000.12,
                x: 0.1,
                y: 0.2,
                gripper: 1,
              },
            ],
          }),
        );
      }
      if (url === "/api/evaluation/rmbench/status") {
        return jsonResponse(createRmbenchStatus());
      }
      if (url === "/api/evaluation/simpler/server/status") {
        return jsonResponse(createServerStatus("simpler", { status: "running", port: 8123 }));
      }
      if (url === "/api/evaluation/rmbench/server/status") {
        return jsonResponse(createServerStatus("rmbench", { status: "stopped", port: 9123 }));
      }
      if (url === "/api/evaluation/simpler/server/logs?source=server") {
        return jsonResponse({
          benchmark: "simpler",
          source: "server",
          path: "/tmp/simpler-server.log",
          content: "model server ready\n",
          truncated: false,
          updatedAt: "2026-05-15T12:00:03.000Z",
        });
      }
      if (url === "/api/evaluation/simpler/launch") {
        expect(init).toMatchObject({ method: "POST" });
        launched = true;
        return jsonResponse(
          createStatus({
            taskId: "bridge_spoon",
            status: "starting",
            runId: nextRunId,
            latestFrameUrl: `/api/evaluation/simpler/frame?runId=${nextRunId}`,
            frameVersion: 0,
            actionSeries: [],
          }),
        );
      }
      if (url === `/api/evaluation/simpler/frame/stream?runId=${nextRunId}`) {
        return mjpegResponse(1, "simpler");
      }
      if (url === `/api/evaluation/simpler/logs?runId=${nextRunId}&source=server`) {
        return jsonResponse({
          runId: nextRunId,
          source: "server",
          path: "/tmp/server.log",
          content: "server ready\n",
          truncated: false,
          updatedAt: "2026-05-15T12:00:04.000Z",
        });
      }
      if (url === `/api/evaluation/simpler/logs?runId=${nextRunId}&source=client`) {
        return jsonResponse({
          runId: nextRunId,
          source: "client",
          path: "/tmp/client.log",
          content: "client running\n",
          truncated: false,
          updatedAt: "2026-05-15T12:00:05.000Z",
        });
      }
      if (url === `/api/evaluation/simpler/logs?runId=${previousRunId}&source=server`) {
        return jsonResponse({
          runId: previousRunId,
          source: "server",
          path: "/tmp/server.log",
          content: "previous server ready\n",
          truncated: false,
          updatedAt: "2026-05-15T12:00:04.000Z",
        });
      }
      if (url === `/api/evaluation/simpler/logs?runId=${previousRunId}&source=client`) {
        return jsonResponse({
          runId: previousRunId,
          source: "client",
          path: "/tmp/client.log",
          content: "previous client ready\n",
          truncated: false,
          updatedAt: "2026-05-15T12:00:05.000Z",
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(
        screen
          .getByRole("img", { name: "bridge_carrot latest frame" })
          .getAttribute("src"),
      ).toBe(`/api/evaluation/simpler/frame?runId=${previousRunId}&v=7`);
    });

    fireEvent.change(screen.getByRole("combobox", { name: "任务选择" }), {
      target: { value: "bridge_spoon" },
    });
    fireEvent.click(screen.getByRole("button", { name: "启动评测" }));

    await waitFor(() => {
      expect(screen.getByText("新任务缓冲中，等待画面与动作同步")).not.toBeNull();
      expect(screen.getByText("新任务缓冲中，等待首批动作与画面同步")).not.toBeNull();
      expect(screen.queryByRole("img", { name: "bridge_spoon latest frame" })).toBeNull();
    });

    await sleep(350);

    await waitFor(() => {
      expect(
        screen
          .getByRole("img", { name: "bridge_spoon latest frame" })
          .getAttribute("src"),
      ).toBe(`/api/evaluation/simpler/frame/stream?runId=${nextRunId}`);
    });

  });
  test("renders the RMBench workspace with four streaming frame URLs while a run is active", async () => {
    const runId = "2026-05-15T12-00-00-000Z_swap_blocks";
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
        rmbenchServerStatus: createServerStatus("rmbench", { status: "running", port: 9123 }),
        rmbenchStatus: createRmbenchStatus({
          runId,
          status: "running",
          frameVersions: {
            third_view: 2,
            head_camera: 2,
            left_camera: 2,
            right_camera: 2,
          },
          actionSeries: [
            {
              step: 1,
              timestamp: 1710000000.12,
              x: 0.1,
              y: 0.2,
              gripper: 1,
            },
          ],
        }),
      }),
    );

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(
        screen.getByRole("img", { name: "swap_blocks third view" }).getAttribute("src"),
      ).toBe(`/api/evaluation/rmbench/frame/stream?runId=${runId}&camera=third_view`);
      expect(
        screen.getByRole("img", { name: "swap_blocks head camera" }).getAttribute("src"),
      ).toBe(`/api/evaluation/rmbench/frame/stream?runId=${runId}&camera=head_camera`);
      expect(
        screen.getByRole("img", { name: "swap_blocks left wrist" }).getAttribute("src"),
      ).toBe(`/api/evaluation/rmbench/frame/stream?runId=${runId}&camera=left_camera`);
      expect(
        screen.getByRole("img", { name: "swap_blocks right wrist" }).getAttribute("src"),
      ).toBe(`/api/evaluation/rmbench/frame/stream?runId=${runId}&camera=right_camera`);
    });
  });

  test("keeps RMBench visuals and actions gated until the primary frame is ready", async () => {
    const runId = "2026-05-15T12-00-00-000Z_swap_blocks";
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
        rmbenchServerStatus: createServerStatus("rmbench", { status: "running", port: 9123 }),
        rmbenchStatus: createRmbenchStatus({
          runId,
          status: "running",
          actionCount: 1,
          frameVersions: {
            third_view: 0,
            head_camera: 0,
            left_camera: 0,
            right_camera: 0,
          },
          actionSeries: [
            {
              step: 1,
              timestamp: 1710000000.12,
              x: 0.1,
              y: 0.2,
              gripper: 1,
            },
          ],
        }),
      }),
    );

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByText("Third view 尚未生成")).not.toBeNull();
      expect(screen.getByText("新任务缓冲中，等待首批动作与主视角同步")).not.toBeNull();
    });

    expect(document.querySelector('[data-recharts="line-chart"]')).toBeNull();
  });

  test("loads RMBench actions through the dedicated actions endpoint", async () => {
    const runId = "2026-05-15T12-00-00-000Z_swap_blocks";
    const fetchMock = createFetchMock({
      simplerServerStatus: createServerStatus("simpler", { status: "running", port: 8123 }),
      rmbenchServerStatus: createServerStatus("rmbench", { status: "running", port: 9123 }),
      rmbenchStatus: createRmbenchStatus({
        runId,
        status: "running",
        actionCount: 2,
        frameVersions: {
          third_view: 2,
          head_camera: 2,
          left_camera: 2,
          right_camera: 2,
        },
        actionSeries: [
          {
            step: 1,
            timestamp: 1710000000.12,
            x: 0.1,
            y: 0.2,
            gripper: 1,
          },
          {
            step: 2,
            timestamp: 1710000000.24,
            x: 0.3,
            y: 0.4,
            gripper: 0,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/evaluation/rmbench/actions?runId=${runId}&afterStep=0`,
        undefined,
      );
    });
  });

});

function createFetchMock({
  simplerStatus = createStatus(),
  rmbenchStatus = createRmbenchStatus(),
  simplerServerStatus = createServerStatus("simpler"),
  rmbenchServerStatus = createServerStatus("rmbench"),
  launchResponse,
  stopResponse,
  rmbenchLaunchResponse,
  rmbenchStopResponse,
  simplerModelServerLogContent = "model server ready\n",
  rmbenchModelServerLogContent = "rmbench model server ready\n",
  serverLogContent = "server ready\n",
  clientLogContent = "client running\n",
}: {
  simplerStatus?: Record<string, unknown>;
  rmbenchStatus?: Record<string, unknown>;
  simplerServerStatus?: Record<string, unknown>;
  rmbenchServerStatus?: Record<string, unknown>;
  launchResponse?: Record<string, unknown>;
  stopResponse?: Record<string, unknown>;
  rmbenchLaunchResponse?: Record<string, unknown>;
  rmbenchStopResponse?: Record<string, unknown>;
  simplerModelServerLogContent?: string;
  rmbenchModelServerLogContent?: string;
  serverLogContent?: string;
  clientLogContent?: string;
}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/evaluation/simpler/status") {
      return jsonResponse(simplerStatus);
    }
    if (url === "/api/evaluation/rmbench/status") {
      return jsonResponse(rmbenchStatus);
    }
    if (url.startsWith("/api/evaluation/rmbench/actions?")) {
      const requestUrl = new URL(url, "http://localhost");
      const runId = requestUrl.searchParams.get("runId");
      const afterStep = Number(requestUrl.searchParams.get("afterStep") ?? "0");
      const actionSeries = Array.isArray(rmbenchStatus.actionSeries)
        ? rmbenchStatus.actionSeries.filter((point) => {
            const step =
              typeof point === "object" && point && "step" in point
                ? Number((point as { step?: unknown }).step)
                : 0;
            return Number.isFinite(step) && step > afterStep;
          })
        : [];
      return jsonResponse({
        runId: runId ?? String(rmbenchStatus.runId),
        actionCount:
          typeof rmbenchStatus.actionCount === "number"
            ? rmbenchStatus.actionCount
            : Array.isArray(rmbenchStatus.actionSeries)
              ? rmbenchStatus.actionSeries.length
              : 0,
        actionSeries,
      });
    }
    if (
      typeof simplerStatus.runId === "string" &&
      url === `/api/evaluation/simpler/frame/stream?runId=${simplerStatus.runId}`
    ) {
      return mjpegResponse(
        Array.isArray(simplerStatus.actionSeries) && simplerStatus.actionSeries.length > 0
          ? simplerStatus.actionSeries.length
          : Math.max(1, Number(simplerStatus.step ?? 0)),
        "simpler",
      );
    }
    if (typeof rmbenchStatus.runId === "string") {
      const rmbenchActionCount =
        Array.isArray(rmbenchStatus.actionSeries) && rmbenchStatus.actionSeries.length > 0
          ? rmbenchStatus.actionSeries.length
          : Math.max(1, Number(rmbenchStatus.step ?? 0));
      for (const camera of ["third_view", "head_camera", "left_camera", "right_camera"]) {
        if (
          url ===
          `/api/evaluation/rmbench/frame/stream?runId=${rmbenchStatus.runId}&camera=${camera}`
        ) {
          return mjpegResponse(rmbenchActionCount, "rmbench");
        }
      }
    }
    if (url === "/api/evaluation/simpler/server/status") {
      return jsonResponse(simplerServerStatus);
    }
    if (url === "/api/evaluation/rmbench/server/status") {
      return jsonResponse(rmbenchServerStatus);
    }
    if (url === "/api/evaluation/simpler/server/logs?source=server") {
      return jsonResponse({
        benchmark: "simpler",
        source: "server",
        path: String(simplerServerStatus.logFiles?.server ?? "/tmp/simpler-server.log"),
        content: simplerModelServerLogContent,
        truncated: false,
        updatedAt: "2026-05-15T12:00:03.000Z",
      });
    }
    if (url === "/api/evaluation/rmbench/server/logs?source=server") {
      return jsonResponse({
        benchmark: "rmbench",
        source: "server",
        path: String(rmbenchServerStatus.logFiles?.server ?? "/tmp/rmbench-server.log"),
        content: rmbenchModelServerLogContent,
        truncated: false,
        updatedAt: "2026-05-15T12:00:03.000Z",
      });
    }
    if (url === "/api/evaluation/simpler/launch") {
      return jsonResponse(launchResponse ?? simplerStatus);
    }
    if (url === "/api/evaluation/simpler/stop") {
      return jsonResponse(stopResponse ?? simplerStatus);
    }
    if (url === "/api/evaluation/rmbench/launch") {
      return jsonResponse(rmbenchLaunchResponse ?? rmbenchStatus);
    }
    if (url === "/api/evaluation/rmbench/stop") {
      return jsonResponse(rmbenchStopResponse ?? rmbenchStatus);
    }
    if (url === `/api/evaluation/simpler/logs?runId=${simplerStatus.runId}&source=server`) {
      return jsonResponse({
        runId: simplerStatus.runId,
        source: "server",
        path: "/tmp/server.log",
        content: serverLogContent,
        truncated: false,
        updatedAt: "2026-05-15T12:00:04.000Z",
      });
    }
    if (url === `/api/evaluation/simpler/logs?runId=${simplerStatus.runId}&source=client`) {
      return jsonResponse({
        runId: simplerStatus.runId,
        source: "client",
        path: "/tmp/client.log",
        content: clientLogContent,
        truncated: false,
        updatedAt: "2026-05-15T12:00:05.000Z",
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

function createStatus(overrides: Partial<Record<string, unknown>> = {}) {
  const status =
    typeof overrides.status === "string" ? overrides.status : "idle";
  const defaultProcessActive =
    status === "starting" || status === "running" || status === "stopping";
  return {
    runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
    taskId: "bridge_carrot",
    prompt: "",
    status,
    processActive: defaultProcessActive,
    step: 0,
    startedAt: null,
    updatedAt: null,
    latestFrameUrl: null,
    frameVersion: 0,
    actionSeries: [],
    errorMessage: null,
    logPath: null,
    logFiles: null,
    ...overrides,
  };
}

function createRmbenchStatus(overrides: Partial<Record<string, unknown>> = {}) {
  const status =
    typeof overrides.status === "string" ? overrides.status : "idle";
  const defaultProcessActive =
    status === "starting" || status === "running" || status === "stopping";
  const actionSeries = Array.isArray(overrides.actionSeries) ? overrides.actionSeries : [];
  const actionCount =
    typeof overrides.actionCount === "number" ? overrides.actionCount : actionSeries.length;
  return {
    runId: "2026-05-15T12-00-00-000Z_swap_blocks",
    taskId: "swap_blocks",
    taskConfig: "demo_clean",
    prompt: "",
    status,
    processActive: defaultProcessActive,
    step: 0,
    actionCount,
    startedAt: null,
    updatedAt: null,
    frameUrls: {
      third_view: "/api/evaluation/rmbench/frame?runId=2026-05-15T12-00-00-000Z_swap_blocks&camera=third_view",
      head_camera: "/api/evaluation/rmbench/frame?runId=2026-05-15T12-00-00-000Z_swap_blocks&camera=head_camera",
      left_camera: "/api/evaluation/rmbench/frame?runId=2026-05-15T12-00-00-000Z_swap_blocks&camera=left_camera",
      right_camera: "/api/evaluation/rmbench/frame?runId=2026-05-15T12-00-00-000Z_swap_blocks&camera=right_camera",
    },
    frameVersions: {
      third_view: 0,
      head_camera: 0,
      left_camera: 0,
      right_camera: 0,
    },
    actionSeries,
    errorMessage: null,
    logPath: null,
    logFiles: null,
    ...overrides,
  };
}

function createServerStatus(
  benchmark: "simpler" | "rmbench",
  overrides: Partial<Record<string, unknown>> = {},
) {
  const label = benchmark === "simpler" ? "Simpler 模型服务" : "RMBench 模型服务";
  const port = benchmark === "simpler" ? 8123 : 9123;
  return {
    benchmark,
    label,
    status: "idle",
    pid: null,
    port,
    startedAt: null,
    updatedAt: null,
    checkpointPath:
      benchmark === "simpler"
        ? "/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000"
        : "/root/autodl-tmp/checkpoints/pi05_rmbench_memory_lora_pytorch/rmbench_mem_lora_h800/30000",
    logPath: `/tmp/${benchmark}-server`,
    logFiles: {
      launcher: `/tmp/${benchmark}-launcher.log`,
      server: `/tmp/${benchmark}-server.log`,
    },
    errorMessage: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function mjpegResponse(actionCount: number, benchmark: "simpler" | "rmbench" = "simpler") {
  const jpegPayload = "ABCD";
  const stepHeader = benchmark === "simpler" ? "X-Simpler-Step" : "X-RMBench-Step";
  const actionHeader =
    benchmark === "simpler" ? "X-Simpler-Action-Count" : "X-RMBench-Action-Count";
  const body =
    `--frame
` +
    `Content-Type: image/jpeg
` +
    `${stepHeader}: ${actionCount}
` +
    `${actionHeader}: ${actionCount}
` +
    `Content-Length: ${jpegPayload.length}

` +
    `${jpegPayload}
`;

  return Promise.resolve(
    new Response(body, {
      status: 200,
      headers: {
        "content-type": "multipart/x-mixed-replace; boundary=frame",
      },
    }),
  );
}
function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
