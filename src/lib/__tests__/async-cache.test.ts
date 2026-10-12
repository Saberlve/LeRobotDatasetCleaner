import { expect, test, vi } from "vitest";
import { createAsyncCache } from "../async-cache";

test("concurrent and prefetched episode requests share work; failures retry", async () => {
  const cached = createAsyncCache<number>(2);
  const load = vi.fn(async () => 3);
  expect(await Promise.all([cached("ep3", load), cached("ep3", load)])).toEqual(
    [3, 3],
  );
  await cached("ep3", load);
  expect(load).toHaveBeenCalledOnce();
  const retry = vi
    .fn()
    .mockRejectedValueOnce(new Error("connection"))
    .mockResolvedValueOnce(4);
  await expect(cached("ep4", retry)).rejects.toThrow("connection");
  expect(await cached("ep4", retry)).toBe(4);
  expect(retry).toHaveBeenCalledTimes(2);
});

test("prefetch cache is bounded and expires so changed datasets are reloaded", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(100);
  try {
    const cached = createAsyncCache<number>(2, 50);
    const load = vi.fn(async () => 1);
    await cached("a", load);
    await cached("b", load);
    await cached("c", load);
    await cached("a", load);
    expect(load).toHaveBeenCalledTimes(4);
    clock.mockReturnValue(200);
    await cached("a", load);
    expect(load).toHaveBeenCalledTimes(5);
  } finally {
    clock.mockRestore();
  }
});
