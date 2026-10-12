# 通过网页标记并导出 episode

在 Filtering 中标记有问题的 episode，然后使用 Export dataset subset：

1. 选择 **unflagged** 导出未标记的 episode，或选择 **flagged** 只导出标记的 episode。
2. 选择新的输出父目录和数据集名称，目标目录必须尚不存在。
3. 点击 Export dataset，完成后通过 Open exported dataset 查看结果。

导出不包含 `raw_episodes/`（原始录制检查点及其 PNG）；已转换的训练数据、视频、时间戳和触觉数据照常保留。源数据集中的原始录制检查点不受影响。

原数据集保持不变。导出使用独立文件，不使用硬链接或软链接。输出目录不能是源目录或其子目录，也不能覆盖已存在的数据集。

## 新触觉格式

- 动作、状态和普通相机保持各自原来的帧率，当前为 15Hz；触觉视频保持 60fps。
- 动作行的 `observation.<camera>.tactile_range` 是视频和 mesh 共用的唯一 int64 `[start_index, end_index)` 区间，不会被替换为代表帧 mesh。旧字段 `mesh3dflow_range` 仍可导出；同一相机同时存在两种区间字段会被拒绝。
- 完整 mesh 保存在 `tactile_streams/<camera>/episode_NNNNNN/mesh3dflow.npy`，保留 SDK 原始浮点类型，包括 float64。导出逐字节复制 NPY，不重新推理或转码。
- 保留原始采集时间戳、每帧 video/mesh 索引以及视频起始偏移。
- 删除或重排完整 episode 时重新生成连续的 `episode_index`、全局 `index`、数据区间和统计；各 episode 内的 mesh/触觉索引保持不变。目录名、`mesh_path` 等引用随所属 episode 更新。
- `meta/episode_id_map.json` 保存源编号到新编号的对应关系。输出继续包含 `meta/camera_streams.json`。

导出前后均检查动作区间与同步记录是否一致、视频实际帧率及有效帧范围、mesh 帧数、dtype、形状、路径和 SHA-256。一项不一致即拒绝发布输出。导出过程中还检查源文件是否变化，失败时清理本次临时输出。

整条 episode 导出直接复制共享 MP4，避免增加视频损失；未保留 episode 的闲置视频片段可能仍在共享文件中，但不再被输出数据集引用。原始历史 runtime 快照保持原身份。

带同步记录、触觉流或原始录制记录的数据集目前支持完整 episode 的选择导出；不支持同时应用 episode 内的帧剪辑草稿。网页中不要勾选“同时应用剪辑草稿”。

后端 Python 需要 numpy 和 pyarrow，并且系统需提供 ffprobe。可将 `LEROBOT_EXPORT_PYTHON` 设为 xArm 项目的 `.venv/bin/python`。
