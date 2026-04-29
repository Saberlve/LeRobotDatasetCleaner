# LeRobot 数据集过滤导出设计

## 目标

在 `LeRobotDatasetCleaner` 中增加“按 flag 导出过滤后数据集”的能力：

1. 用户在现有 Filtering 面板中继续按 episode 打 `flag`。
2. 用户可以选择把 `flagged` episode 或 `unflagged` episode 导出到指定目录。
3. 导出结果必须仍然是合法的 LeRobot 数据集，可被本项目和 LeRobot 工具再次读取。
4. 原始数据集保持不变，导出永远写入新目录。
5. 导出完成后，新数据集自动注册到本地 registry，能够立即在当前项目中打开。

## 非目标

- 不支持 frame 级过滤。
- 不支持远程 Hugging Face 数据集直接导出。
- 不依赖外部 `lerobot-edit-dataset` CLI。
- 本次不实现“覆盖已有目录”的危险路径，默认目标目录已存在即报错。
- 不在这次范围内做后台任务队列、断点续传或导出进度持久化。

## 背景与当前状态

当前项目已经具备两块相关能力：

- Filtering 面板可以维护一个前端会话级的 `flagged episode` 集合。
- Filtering 面板会生成一段可复制的 `lerobot-edit-dataset` CLI 命令，但不会真正导出数据。

当前项目也已经具备本地数据集注册能力：

- `src/server/local-datasets/registry.ts` 负责校验 `meta/info.json`、生成 `local/<alias>` repo id、读写 `data/local_datasets_registry.json`。
- `POST /api/local-datasets/register` 能把新目录注册为本地数据集。

因此新增功能不需要重新设计“本地数据集如何被项目读取”，只需要补上“如何从源数据集生成一个新的合法 LeRobot 数据集目录”这条链路。

## 用户故事

### 主要场景

1. 用户打开一个本地 LeRobot 数据集。
2. 用户在 Filtering 面板中对异常 episode 打 flag。
3. 用户选择导出模式：
   - 导出 `flagged`
   - 导出 `unflagged`
4. 用户指定输出目录，并可选填写 alias。
5. 项目在服务端生成一个新数据集目录，重写必要元数据。
6. 导出成功后，前端展示摘要，并提供“打开导出结果”入口。

### 失败场景

- 当前数据集不是本地数据集。
- `flagged` 模式下没有任何 flagged episode。
- `unflagged` 模式下所有 episode 都被 flag。
- 输出目录已存在。
- 源数据集元数据不完整，无法安全导出。
- 数据复制或元数据写入过程中失败。

## 设计原则

- 复用现有本地 registry 和本地数据读取链路。
- 导出器只对“新目录”进行写入，不修改源目录。
- episode 编号在导出后重新映射为连续编号 `0..N-1`，避免稀疏 episode id 导致兼容性问题。
- 以“保持导出结果可被 LeRobot 读取”为首要目标，而不是最少复制字节数。
- 服务端模块边界清晰：选择逻辑、源数据检查、写出逻辑、API 编排分离。

## 范围内支持的数据粒度

本功能的筛选输入只有 episode id 集合。

- `flagged` 模式：保留被 flag 的 episode。
- `unflagged` 模式：保留未被 flag 的 episode。

不引入额外筛选器组合，也不把低运动、长度异常等 heuristics 直接写进导出器。导出器只消费最终的 flagged episode 集合，这样可以和前端现有语义保持一致。

## 导出结果语义

### 输出模式

新增两种导出模式：

- `flagged`
- `unflagged`

UI 和 API 一次只执行一种模式，用户可通过参数选择。若后续需要“一次导出两份”，可以在同一导出器上封装两次调用，但本次接口不要求单请求输出两份目录。

### 输出目录

- 用户显式提供 `outputPath`。
- 导出要求该目录不存在，或存在但为空目录时才允许写入；若实现复杂度偏高，可首版直接要求“不存在”。
- 导出目录由服务端创建。

### 输出 repo id / alias

- 允许用户提供 `alias`。
- 若未提供 alias，则使用源数据集 display name 加后缀自动生成：
  - `*_flagged`
  - `*_unflagged`
- 新数据集的 repo id 仍为 `local/<alias>`。

## 架构设计

新增服务端模块目录：

- `src/server/dataset-export/selection.ts`
- `src/server/dataset-export/inspect.ts`
- `src/server/dataset-export/write.ts`
- `src/server/dataset-export/exporter.ts`

职责划分如下。

### `selection.ts`

负责把前端传入的 `flaggedEpisodeIds` 和数据集总 episode 数转换成导出计划：

- 去重、排序
- 检查是否存在越界 episode id
- 按 `mode` 计算保留 episode 集合
- 生成旧 episode id 到新 episode id 的映射
- 在结果为空时抛出可读错误

建议导出类型：

- `ExportMode = "flagged" | "unflagged"`
- `EpisodeSelectionPlan`

`EpisodeSelectionPlan` 至少包含：

- `mode`
- `sourceEpisodeIds`
- `keptEpisodeIds`
- `droppedEpisodeIds`
- `episodeIdMap`
- `newTotalEpisodes`

### `inspect.ts`

负责从源数据集目录构建内部描述，尽量把格式差异吸收到这里：

- 读取 `meta/info.json`
- 识别 codebase version
- 识别 episode 级元数据文件和 data parquet 的位置
- 识别视频文件布局和引用关系
- 识别哪些 parquet 行带有 `episode_index`

建议输出统一的 `DatasetExportInspection`，包括：

- 源目录绝对路径
- 源 repo id
- 版本
- `info.json` 原始对象
- 需要过滤的 parquet 文件列表
- 需要重写的 episode 元数据文件列表
- 需要按引用复制的视频或资源文件列表

如果后续发现 v2.1 与 v3.0 在目录布局上差异较大，允许在 `inspect.ts` 内部分流为版本专用适配器，但对 `write.ts` 暴露统一结构。

### `write.ts`

负责把 inspection + selection plan 变成新的数据集目录：

- 创建目标目录
- 复制未受影响的静态文件
- 过滤并重写 parquet 文件
- 过滤并重写 episode 元数据文件
- 重写 `meta/info.json`
- 复制目标 episode 实际引用到的视频和其他资产

写出策略采用“在目标目录构造完整结果”，不尝试原地修改。任何一步失败都应终止并返回错误；必要时清理已创建的临时目录或半成品目录。

### `exporter.ts`

负责整体编排：

1. 校验输入参数
2. 解析 `repoId` 到本地真实路径
3. 执行 inspection
4. 执行 selection
5. 执行 write
6. 调用现有 registry 注册新目录
7. 返回导出摘要

## LeRobot 数据集写出规则

### episode 编号重映射

导出后的 episode id 重新映射为连续编号：

- 原始保留集 `[2, 4, 9]`
- 导出后映射为 `[0, 1, 2]`

所有依赖 episode id 的地方都必须同步使用新编号：

- episode 元数据文件
- data parquet 中的 `episode_index`
- 任何显式引用 episode 编号的索引文件

这是本设计里的强约束，不保留原始稀疏编号。

### `meta/info.json`

导出器至少需要更新这些信息：

- `total_episodes`
- 与 episode 总数、episode 索引或样本数量强相关的字段
- 如存在数据路径、分片统计、视频统计且依赖过滤结果，也要同步更新

首版要求实现时基于实际 fixture 和 LeRobot 官方样例核对 `info.json` 中哪些字段必须更新。原则是：

- 能从源数据直接继承且不受筛选影响的字段原样保留
- 任何受 episode 过滤影响的聚合字段都重算或修正

### parquet 过滤

所有包含 episode 粒度样本的 parquet 文件都需要过滤：

- 仅保留目标 episode 的行
- 若包含 `episode_index` 字段，则重映射为新的连续编号

实现时应优先复用项目当前已有的 parquet 读取能力与依赖，避免引入第二套解析路径。

### 视频与其他资产复制

导出结果只复制被保留 episode 实际引用到的资源文件。

若项目现有读取逻辑无法直接从元数据提取引用关系，则允许首版在安全前提下采用“复制与保留 episode 相关目录”的保守策略，但不能把整个源目录无差别拷贝后仅修改元数据，否则新数据集会残留被删除 episode 的内容。

### 其他文件

对不依赖筛选结果的文件应尽量原样复制，例如：

- README
- 机器人描述文件
- 静态资源

具体白名单或黑名单由 inspection 结果驱动，不把路径规则硬编码散落在 API 路由中。

## API 设计

新增路由：

- `POST /api/local-datasets/export`

请求体：

```json
{
  "repoId": "local/example_dataset",
  "flaggedEpisodeIds": [1, 4, 8],
  "mode": "unflagged",
  "outputPath": "/tmp/example_dataset_unflagged",
  "alias": "example_dataset_unflagged"
}
```

请求约束：

- `repoId` 必须是本地数据集 repo id
- `flaggedEpisodeIds` 必须是 number 数组
- `mode` 只能是 `flagged` 或 `unflagged`
- `outputPath` 必须是非空字符串
- `alias` 可选，若存在则必须满足现有 local alias 规则

成功响应：

```json
{
  "repoId": "local/example_dataset_unflagged",
  "path": "/tmp/example_dataset_unflagged",
  "mode": "unflagged",
  "totalEpisodes": 91,
  "entryRoute": "/local/example_dataset_unflagged/episode_0",
  "summary": {
    "sourceRepoId": "local/example_dataset",
    "sourceTotalEpisodes": 100,
    "exportedEpisodes": 91,
    "droppedEpisodes": 9
  }
}
```

失败响应要求：

- 4xx 用于用户输入问题或业务约束失败
- 5xx 用于导出执行失败
- 错误消息直接面向用户，优先中文，便于在 UI 中原样展示

## 前端交互设计

位置：`src/components/filtering-panel.tsx` 的 `Flagged Episodes` 区域下方或同区域扩展。

### 保留现有能力

- 保留复制 flagged ids
- 保留现有 CLI 示例

这是为了不破坏熟悉现有流程的用户，同时新增“项目内直接导出”入口。

### 新增导出卡片

卡片字段：

- 导出模式选择：`flagged` / `unflagged`
- 目标路径输入框
- “选择目录”按钮，复用现有 `pick-directory` API
- alias 输入框
- 提交按钮
- 状态区：导出中、成功摘要、错误消息

### 前端校验

- 当前数据集不是本地 repo 时，整个导出区域禁用并给出说明
- `flagged` 模式且当前没有任何 flag 时，禁用提交
- `unflagged` 模式且所有 episode 都已被 flag 时，禁用提交
- 目标路径为空时，禁用提交

### 成功后的行为

- 不自动跳转
- 显示导出摘要
- 提供“打开导出结果”按钮
- 可选提供“复制新 repo id”或“复制新路径”，但不是首版必需

## 与现有本地 registry 的集成

导出完成后，调用现有本地注册逻辑注册新目录，保持项目当前的本地数据访问模式：

- 新目录写完后调用 `registerLocalDataset`
- registry 中新增或更新对应 `local/<alias>` 记录
- 返回 `entryRoute`

如果 `registerLocalDataset` 当前只做“目录校验 + 写 registry”，无需新增第二套注册逻辑，避免分叉。

## 错误处理

必须覆盖这些错误：

- 远程数据集不允许导出
- `flaggedEpisodeIds` 非法
- episode id 越界
- 导出结果为空
- alias 非法
- 输出目录已存在
- 输出目录父级不存在且无法创建
- 无法读取源数据集元数据
- parquet 过滤失败
- 视频/资源复制失败
- registry 注册失败

错误文案要足够具体，便于用户知道下一步该修什么，而不是统一回“导出失败”。

## 测试计划

### 单元测试

- `selection.ts`
  - `flagged` 模式正确选择
  - `unflagged` 模式正确选择
  - 去重与排序
  - 越界 id 报错
  - 空结果报错
  - episode id 连续重映射正确
- alias / repo id 生成逻辑

### 服务端集成测试

使用最小本地 fixture 数据集执行真实导出，覆盖：

- 生成新目录
- `meta/info.json` 被正确更新
- parquet 行被正确过滤
- `episode_index` 被重映射
- 导出后 episode 编号连续
- registry 自动注册
- 返回的 `entryRoute` 可用于当前项目路由

### 前端测试

- Filtering 面板渲染导出区域
- 不同模式下的禁用逻辑
- API 成功后的摘要和跳转按钮
- API 失败后的错误展示

## 实施顺序

1. 为现有 Filtering 与本地 registry 补齐设计中的数据契约
2. 添加 `selection.ts` 及其测试
3. 添加 `inspect.ts`，基于实际 fixture 固化支持的 LeRobot 布局
4. 添加 `write.ts`，先让最小 fixture 导出通过
5. 添加 `exporter.ts` 与 `POST /api/local-datasets/export`
6. 在 Filtering 面板接入导出 UI
7. 补充 registry 集成和前端测试
8. 回归现有本地数据导入和详情页读取链路

## 风险与缓解

### 风险 1：LeRobot 元数据字段比当前预想更复杂

缓解：

- 先基于最小 fixture 和官方样例对 `meta/info.json` 做字段盘点
- 让 `inspect.ts` 输出“哪些字段需要重算”的明确集合
- 初版只承诺支持仓库当前已验证的数据布局

### 风险 2：视频文件引用关系不容易稳定提取

缓解：

- 优先从元数据或 parquet 行中解析实际引用
- 如果某版本目录结构固定，可在版本适配器中局部使用路径规则
- 测试中必须验证导出后的页面能正常打开视频

### 风险 3：导出过程耗时较长

缓解：

- 首版先做同步请求，UI 明确展示“导出中”
- 若后续发现真实数据集耗时不可接受，再引入后台任务和进度查询

### 风险 4：半成品目录残留

缓解：

- 优先写入临时目录，全部成功后再原子 rename 到目标目录
- 失败时尽力清理临时目录，并在日志里保留足够上下文

## 验收标准

- 用户可以在 Filtering 面板中把 flagged 或 unflagged episode 导出到指定目录
- 导出结果保留合法 LeRobot 数据集结构
- 导出后的 `meta/info.json` 和相关元数据与实际内容一致
- 导出后的 episode 编号连续
- 原始数据集不被修改
- 导出成功后可在当前项目中直接打开新数据集
