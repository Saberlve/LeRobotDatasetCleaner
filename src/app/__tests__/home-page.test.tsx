// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigation.push,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

import Home from "@/app/page";

describe("home page", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    navigation.push.mockReset();
  });

  test("renders local import controls inline with the search hero", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toContain("LeRobot");
    expect(html).toContain("Visualizer");
    expect(html).toContain("打开数据集");
    expect(html).toContain("选择本地文件夹");
    expect(html).toContain("最近导入");
    expect(html).not.toContain("Local Import");
    expect(html).not.toContain("本地数据集导入");
  });

  test("writes picked local folder into search and opens it through registration", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/local-datasets/registry") {
        return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      }
      if (url === "/api/local-datasets/pick-directory") {
        return new Response(JSON.stringify({ path: "/mnt/d/demo" }), {
          status: 200,
        });
      }
      if (url === "/api/local-datasets/register") {
        return new Response(
          JSON.stringify({ entryRoute: "/local/demo/episode_0" }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ datasets: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "选择本地文件夹" }));

    const input = await screen.findByPlaceholderText(
      "输入数据集 ID，例如 lerobot/pusht",
    );
    await waitFor(() =>
      expect((input as HTMLInputElement).value).toBe("/mnt/d/demo"),
    );

    fireEvent.click(screen.getByRole("button", { name: "打开数据集" }));

    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith("/local/demo/episode_0"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/local-datasets/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ path: "/mnt/d/demo", alias: "" }),
      }),
    );
  });

  test("removes a recent local dataset entry without deleting files", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === "/api/local-datasets/registry" &&
          init?.method === "DELETE"
        ) {
          return new Response(JSON.stringify({ removed: true }), {
            status: 200,
          });
        }
        if (url === "/api/local-datasets/registry") {
          return new Response(
            JSON.stringify({
              entries: [
                {
                  repoId: "local/demo",
                  displayName: "demo",
                  path: "/mnt/d/demo",
                  version: "v2.1",
                  totalEpisodes: 3,
                  fps: 30,
                  robotType: "SO101",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ datasets: [] }), { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<Home />);

    expect(await screen.findByText("demo")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "删除 demo" }));

    await waitFor(() => expect(screen.queryByText("demo")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/local-datasets/registry",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ repoId: "local/demo", path: "/mnt/d/demo" }),
      }),
    );
  });
});
