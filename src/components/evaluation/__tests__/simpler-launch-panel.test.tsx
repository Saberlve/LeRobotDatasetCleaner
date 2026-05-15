// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.mock("recharts", () => {
  return {
    CartesianGrid: ({ children }: { children?: React.ReactNode }) => (
      <div data-recharts="grid">{children}</div>
    ),
    Legend: () => <div data-recharts="legend" />,
    Line: ({ dataKey }: { dataKey: string }) => (
      <div data-recharts-line={dataKey} />
    ),
    LineChart: ({
      children,
      data,
    }: {
      children?: React.ReactNode;
      data?: Array<unknown>;
    }) => <div data-recharts="line-chart" data-points={data?.length ?? 0}>{children}</div>,
    Tooltip: () => <div data-recharts="tooltip" />,
    XAxis: () => <div data-recharts="x-axis" />,
    YAxis: () => <div data-recharts="y-axis" />,
  };
});

describe("SimplerLaunchPanel", () => {
  test("renders the approved four-row launch workspace layout", async () => {
    const idleStatus = createStatus();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(idleStatus)),
    );

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "启动评测" })).not.toBeNull();
    });

    expect(
      screen.getByRole("combobox", { name: "任务选择" }),
    ).not.toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "停止评测" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText("当前提示词")).not.toBeNull();
    expect(screen.getByText("最新渲染图")).not.toBeNull();
    expect(screen.getByText("模型原始动作维度")).not.toBeNull();
    expect(document.querySelector('[data-action-chart="simpler-actions"]')).not.toBeNull();
    expect(document.querySelector('[data-launch-layout="four-row"]')).not.toBeNull();
    expect(document.querySelector('[data-launch-row="controls"]')).not.toBeNull();
    expect(document.querySelector('[data-launch-row="logs"]')).not.toBeNull();
    expect(document.querySelector('[data-launch-row="frame"]')).not.toBeNull();
    expect(document.querySelector('[data-launch-row="actions"]')).not.toBeNull();
    expect(document.querySelector('[data-log-grid="paired"]')).not.toBeNull();
  });



  test("does not render run metadata cards for run id, timestamps, or error message", async () => {
    const status = createStatus({
      runId: "2026-05-15T14-03-01-177Z_bridge_carrot",
      startedAt: "2026-05-15T14:03:01.179Z",
      updatedAt: "2026-05-15T14:07:26.993248Z",
      errorMessage: "launch failed",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(status)));

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByText("当前提示词")).not.toBeNull();
    });

    expect(screen.queryByText("当前 run id")).toBeNull();
    expect(screen.queryByText("开始时间")).toBeNull();
    expect(screen.queryByText("最近更新时间")).toBeNull();
    expect(screen.queryByText("错误信息")).toBeNull();
    expect(
      screen.queryByText("2026-05-15T14-03-01-177Z_bridge_carrot"),
    ).toBeNull();
    expect(screen.queryByText("2026-05-15T14:03:01.179Z")).toBeNull();
    expect(screen.queryByText("2026-05-15T14:07:26.993248Z")).toBeNull();
    expect(screen.queryByText("launch failed")).toBeNull();
  });

  test("renders separated server and client logs for the active run", async () => {
    const status = createStatus({
      status: "running",
      prompt: "put carrot on plate",
      logFiles: {
        launcher: "/tmp/launcher.log",
        server: "/tmp/server.log",
        client: "/tmp/client.log",
      },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/evaluation/simpler/status") {
        return jsonResponse(status);
      }
      if (url === `/api/evaluation/simpler/logs?runId=${status.runId}&source=server`) {
        return jsonResponse({
          runId: status.runId,
          source: "server",
          path: "/tmp/server.log",
          content: "server ready\nlistening on 8123",
          truncated: false,
          updatedAt: "2026-05-15T12:00:04.000Z",
        });
      }
      if (url === `/api/evaluation/simpler/logs?runId=${status.runId}&source=client`) {
        return jsonResponse({
          runId: status.runId,
          source: "client",
          path: "/tmp/client.log",
          content: "episode 0\nstep 1",
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
      expect(screen.getByText("模型 server 日志")).not.toBeNull();
    });

    expect(screen.getByText("推理 client 日志")).not.toBeNull();
    expect(screen.getByText(/listening on 8123/)).not.toBeNull();
    expect(screen.getByText(/episode 0/)).not.toBeNull();
    expect(screen.queryByText("/tmp/server.log")).toBeNull();
    expect(screen.queryByText("/tmp/client.log")).toBeNull();
    expect(screen.queryByText(/最近读取:/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/evaluation/simpler/logs?runId=${status.runId}&source=server`,
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/evaluation/simpler/logs?runId=${status.runId}&source=client`,
      undefined,
    );
  });

  test("renders the latest frame without cropping the image", async () => {
    const status = createStatus({
      taskId: "bridge_carrot",
      latestFrameUrl: "/api/evaluation/simpler/frame?runId=demo",
      frameVersion: 3,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(status)));

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "bridge_carrot latest frame" })).not.toBeNull();
    });

    const frameImage = screen.getByRole("img", { name: "bridge_carrot latest frame" });
    expect(String(frameImage.getAttribute("class"))).toContain("object-contain");
    expect(String(frameImage.getAttribute("class"))).not.toContain("object-cover");
  });

  test("renders fixed-size log windows with native vertical scrolling", async () => {
    const serverLog = Array.from({ length: 25 }, (_, index) => "server line " + (index + 1))
      .join("\n");
    const clientLog = Array.from({ length: 8 }, (_, index) => "client line " + (index + 1))
      .join("\n");
    const status = createStatus({
      status: "running",
      logFiles: {
        launcher: "/tmp/launcher.log",
        server: "/tmp/server.log",
        client: "/tmp/client.log",
      },
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/evaluation/simpler/status") {
        return jsonResponse(status);
      }
      if (
        url ===
        "/api/evaluation/simpler/logs?runId=" + status.runId + "&source=server"
      ) {
        return jsonResponse({
          runId: status.runId,
          source: "server",
          path: "/tmp/server.log",
          content: serverLog,
          truncated: false,
          updatedAt: "2026-05-15T12:00:04.000Z",
        });
      }
      if (
        url ===
        "/api/evaluation/simpler/logs?runId=" + status.runId + "&source=client"
      ) {
        return jsonResponse({
          runId: status.runId,
          source: "client",
          path: "/tmp/client.log",
          content: clientLog,
          truncated: false,
          updatedAt: "2026-05-15T12:00:05.000Z",
        });
      }
      throw new Error("Unexpected fetch URL: " + url);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByTestId("log-viewport-server")).not.toBeNull();
    });

    const serverViewport = screen.getByTestId("log-viewport-server");

    expect(screen.queryByLabelText("模型 server 日志翻页")).toBeNull();
    expect(screen.getByText("固定窗口显示完整日志，拖动右侧滚动条查看。")).not.toBeNull();
    expect(String(serverViewport.getAttribute("class"))).toContain("overflow-y-auto");
    expect(serverViewport.textContent).toContain("server line 1");
    expect(serverViewport.textContent).toContain("server line 13");
    expect(serverViewport.textContent).toContain("server line 25");
  });
  test("renders one action chart per numeric model output dimension", async () => {
    const status = createStatus({
      status: "running",
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
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(status)));

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByText("模型原始动作维度")).not.toBeNull();
    });

    expect(document.querySelectorAll('[data-action-dimension-chart]').length).toBe(4);
    expect(screen.getByText("x")).not.toBeNull();
    expect(screen.getByText("y")).not.toBeNull();
    expect(screen.getByText("gripper")).not.toBeNull();
    expect(screen.getByText("width")).not.toBeNull();
    expect(document.querySelectorAll('[data-recharts="line-chart"]').length).toBe(4);
    expect(document.querySelectorAll('[data-recharts-line="x"]').length).toBe(1);
    expect(document.querySelectorAll('[data-recharts-line="width"]').length).toBe(1);
  });

  test("polls while running, disables launch controls, and stops the run", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          createStatus({
            status: "running",
            taskId: "bridge_stack",
            prompt: "stack the cubes",
            step: 3,
            actionSeries: [
              {
                step: 0,
                timestamp: 1710000000.12,
                x: 0.1,
                y: 0.2,
                z: 0.3,
                roll: 0.4,
                pitch: 0.5,
                yaw: 0.6,
                gripper: 1,
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          createStatus({
            status: "stopped",
            taskId: "bridge_stack",
            prompt: "stack the cubes",
            step: 4,
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { SimplerLaunchPanel } = await import(
      "@/components/evaluation/simpler-launch-panel"
    );

    render(<SimplerLaunchPanel />);

    await waitFor(() => {
      expect(screen.getByText("stack the cubes")).not.toBeNull();
    });

    expect(screen.getByRole("combobox", { name: "任务选择" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "启动评测" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "停止评测" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

    fireEvent.click(screen.getByRole("button", { name: "停止评测" }));

    await waitFor(() => {
      expect(screen.getAllByText("stopped").length).toBeGreaterThan(0);
    });
    expect(
      screen.getByRole("combobox", { name: "任务选择" }),
    ).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "启动评测" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/evaluation/simpler/stop",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

function createStatus(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    runId: "2026-05-15T12-00-00-000Z_bridge_carrot",
    taskId: "bridge_carrot",
    prompt: "",
    status: "idle",
    step: 0,
    startedAt: null,
    updatedAt: null,
    latestFrameUrl: null,
    frameVersion: 0,
    actionSeries: [],
    errorMessage: null,
    logPath: null,
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
