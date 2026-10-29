export async function readExportResponse(response: Response): Promise<{
  entryRoute: string;
  repoId: string;
  totalEpisodes: number;
  path: string;
}> {
  const body = await response.text();
  const status = `HTTP ${response.status}`;
  const uncertain =
    "导出可能仍在后台运行，请先检查输出目录和服务日志，避免重复提交。";
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    const kind = !body.trim()
      ? "空响应"
      : body.trimStart().startsWith("<")
        ? "HTML 页面"
        : "非 JSON 内容";
    throw new Error(
      `导出接口返回${kind}（${status}），无法确认导出结果。${uncertain}`,
    );
  }
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? `${payload.error}（${status}）`
        : `导出请求失败（${status}）。${uncertain}`,
    );
  }
  if (
    !payload ||
    typeof payload.entryRoute !== "string" ||
    typeof payload.repoId !== "string" ||
    typeof payload.path !== "string" ||
    !Number.isInteger(payload.totalEpisodes) ||
    payload.totalEpisodes < 1
  ) {
    throw new Error(`导出接口响应字段不完整（${status}）。${uncertain}`);
  }
  return payload;
}
