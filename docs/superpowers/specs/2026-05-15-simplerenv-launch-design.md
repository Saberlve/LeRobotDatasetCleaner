# SimplerEnv 一键评测启动与监控设计

## 目标

在现有训练-评测-回放一体化平台中新增一个 SimplerEnv 单任务评测页面,支持用户从固定任务列表中一键启动 `pi05` 评测,并在评测进行时实时查看:

- 当前任务提示词
- 最近 1 秒内产出的最新渲染图
- `pi05` 原始 7 维动作输出折线图
- 当前运行状态与基础运行信息

首版范围只覆盖 SimplerEnv,不覆盖 RMBench 或真机评测,也不支持多任务并发监控。

## 范围与约束

### 首版范围

- 新增平台页面 `/evaluation/launch`
- 仅支持单任务启动与监控
- 任务选择来自固定下拉框,预置 4 个 Bridge 任务:
  - `bridge_carrot`
  - `bridge_stack`
  - `bridge_spoon`
  - `eggplant`
- 支持手动停止当前评测
- 模型固定为 `/root/autodl-tmp/checkpoints/pi05_simpler/pi05_bridge_v2_full/26000`
- 评测运行时自动使用 `openpi` 环境

### 明确不做

- 不支持多任务并发启动
- 不支持自定义 SimplerEnv 参数编辑
- 不支持首版改成 SSE 或 WebSocket 推流
- 不把现有历史回放页 `/evaluation/replay` 改造成运行控制台
- 不解析 `.task.log` 作为前端主数据源

## 产品定义

该功能是现有评测平台中的一个独立控制台页面,职责是:

- 启动一次新的 SimplerEnv 单任务评测
- 在任务运行期间轮询并展示实时状态
- 允许用户中断当前评测
- 在任务结束后保留当前 run 的结果摘要,直到页面刷新或新任务启动

它不是历史结果浏览器,也不是通用脚本参数面板。

## 页面与导航

### 路由

- 新增路由 `/evaluation/launch`

### 导航文案

在现有 evaluation workbench 导航中新增一项:

- 文案: `评测启动与监控`
- 说明: `单任务 SimplerEnv 实时评测`

### 页面结构

页面分为 4 个主要区块:

1. 控制区
2. 提示词与运行状态区
3. 最新渲染图区
4. 原始动作折线图区

## 交互设计

### 控制区

控件包括:

- 固定任务下拉框
- `启动评测` 按钮
- `停止评测` 按钮
- 当前运行状态标签

交互规则:

- 空闲状态下允许切换任务并启动
- 运行中禁用任务下拉框
- 运行中禁用 `启动评测`
- 空闲时禁用 `停止评测`
- 同一时间只允许一个活动评测
- 已有评测运行时,再次调用启动接口返回冲突错误

### 提示词与运行状态区

展示字段:

- 当前任务名
- 当前提示词 `prompt`
- 当前 step
- 开始时间
- 最近更新时间
- 当前 run id
- 运行状态
- 可选错误信息

状态枚举固定为:

- `idle`
- `starting`
- `running`
- `stopping`
- `succeeded`
- `failed`
- `stopped`

### 渲染图区

页面展示“最近 1 秒内写出的最新渲染帧”。

前端不自行维护 1 秒窗口逻辑,而是每秒请求状态接口一次,并使用返回的 `latestFrameUrl` 与帧版本信息刷新图片。后端只维护“当前最新帧”这一语义。

### 动作图区

图表展示 `pi05` 原始 7 维输出:

- `x`
- `y`
- `z`
- `roll`
- `pitch`
- `yaw`
- `gripper`

横轴首版使用 `step`,同时在数据中保留时间戳供 tooltip 或后续扩展使用。图表每秒刷新一次,每次直接读取当前完整动作序列。

## 技术方案

整体采用三层结构:

1. Next.js 页面层
2. Next.js 服务层
3. `/VLA/openpi` 单任务包装与 runtime 写出层

### 1. Next.js 页面层

页面负责:

- 提供任务选择和启动/停止入口
- 以 1Hz 频率轮询状态接口
- 展示 prompt、最新渲染图和动作折线图
- 在接口错误或评测失败时展示可读错误

前端不直接解析日志文件,也不直接访问 `/VLA/openpi` 磁盘路径。

### 2. Next.js 服务层

服务层负责:

- 校验当前是否已有活动 run
- 拉起 `/VLA/openpi` 中的单任务评测包装脚本
- 终止活动 run 的进程树
- 从 runtime 目录读取状态 JSON、动作 JSON 与最新图片
- 将磁盘数据转换成前端可直接渲染的 API 响应

该层不实现评测循环本身,只做进程编排与 runtime 文件读写。

### 3. `/VLA/openpi` 包装与 runtime 写出层

在 `/VLA/openpi` 中增加一个专用于单任务实时评测的薄包装:

- 复用现有 `Pi05Inference` 和 `maniskill2_evaluator`
- 不改变现有多任务脚本的职责
- 在单步评测循环中额外写出 prompt、最新图像和原始动作序列

该层通过固定 runtime 目录与 Next.js 服务层解耦。

## API 设计

### `POST /api/evaluation/simpler/launch`

请求体:

```json
{
  "taskId": "bridge_carrot"
}
```

行为:

- 验证 `taskId` 是否在固定白名单中
- 检查当前是否已有活动 run
- 生成 run id
- 初始化 runtime 目录
- 拉起单任务包装脚本
- 返回 run 基础信息

错误情况:

- 非法任务 id -> `400`
- 已有任务运行 -> `409`
- 启动脚本失败 -> `500`

### `POST /api/evaluation/simpler/stop`

请求体可为空,也可带 `runId`。

行为:

- 查找当前活动 run
- 将状态切换为 `stopping`
- 终止进程树
- 写回最终状态 `stopped`

错误情况:

- 没有活动 run -> `409`
- 停止失败 -> `500`

### `GET /api/evaluation/simpler/status`

返回前端直接可渲染的数据,示例结构:

```json
{
  "runId": "2026-05-15T12-00-00Z_bridge_carrot",
  "taskId": "bridge_carrot",
  "prompt": "put carrot on plate",
  "status": "running",
  "step": 42,
  "startedAt": "2026-05-15T12:00:00.000Z",
  "updatedAt": "2026-05-15T12:01:08.000Z",
  "latestFrameUrl": "/api/evaluation/simpler/frame?runId=2026-05-15T12-00-00Z_bridge_carrot",
  "frameVersion": 42,
  "actionSeries": [
    {
      "step": 0,
      "timestamp": 1710000000.12,
      "x": 0.1,
      "y": 0.2,
      "z": -0.1,
      "roll": 0.01,
      "pitch": 0.02,
      "yaw": -0.03,
      "gripper": 1.0
    }
  ],
  "errorMessage": null,
  "logPath": "/VLA/openpi/third_party/SimplerEnv/runtime/launch/..."
}
```

设计原则:

- 返回的是结构化状态,不是日志文本
- `actionSeries` 直接可用于前端图表
- `frameVersion` 用于前端判断图片是否需要强制刷新

### `GET /api/evaluation/simpler/frame?runId=...`

行为:

- 校验 `runId`
- 读取该 run runtime 目录中的最新帧图片
- 以图片响应返回

错误情况:

- run 不存在 -> `404`
- 图片尚未生成 -> `404`

## Runtime 协议

所有实时中间数据统一写入:

`/VLA/openpi/third_party/SimplerEnv/runtime/launch/<runId>/`

### 文件列表

- `status.json`
- `actions.json`
- `latest-frame.jpg`
- `meta.json`
- `stdout.log`
- `stderr.log`

### `status.json`

包含:

- `runId`
- `taskId`
- `prompt`
- `status`
- `step`
- `startedAt`
- `updatedAt`
- `pid`
- `latestFramePath`
- `actionCount`
- `logPath`
- `errorMessage`

它是前端状态页的主数据源。

### `actions.json`

保存完整动作时间序列数组。每个元素为:

```json
{
  "step": 12,
  "timestamp": 1710000000.12,
  "x": 0.1,
  "y": 0.2,
  "z": 0.3,
  "roll": 0.4,
  "pitch": 0.5,
  "yaw": 0.6,
  "gripper": 1.0
}
```

首版允许每步重写整个 JSON 文件,因为单任务 episode 长度有限,实现更直接。若后续性能不够,再改成 JSONL 或分片文件。

### `latest-frame.jpg`

始终保存最新一帧渲染图。文件名固定,由 `status.json` 中的更新时间和 `frameVersion` 解决缓存问题。

### `meta.json`

保存本次运行的固定配置快照:

- `taskId`
- `envName`
- `sceneName`
- `robot`
- `rgbOverlayPath`
- `checkpointPath`
- `serverPort`
- `renderScale`

### `stdout.log` / `stderr.log`

保存包装脚本输出,主要用于调试和失败排障,不作为前端主展示数据。

## `/VLA/openpi` 侧改动

### 新增单任务包装脚本

新增:

`/VLA/openpi/third_party/SimplerEnv/scripts/run_pi05_single_task_live.sh`

职责:

- 接收 `taskId` 与 `runId`
- 映射 4 个固定任务到对应 SimplerEnv 参数
- 固定使用 `/root/miniconda3/envs/openpi/bin/python`
- 启动 policy server
- 等待 server ready
- 仅启动 1 个 SimplerEnv 任务
- 将 runtime 目录路径通过环境变量传入 Python 评测逻辑
- 正确清理 server 与 task 子进程

### 任务映射

任务参数映射直接复用参考脚本 `run_pi05_bridge_v2_full_hd.sh` 中的 4 组配置:

- `bridge_carrot` -> `PutCarrotOnPlateInScene-v0`
- `bridge_stack` -> `StackGreenCubeOnYellowCubeBakedTexInScene-v0`
- `bridge_spoon` -> `PutSpoonOnTableClothInScene-v0`
- `eggplant` -> `PutEggplantInBasketScene-v0`

首版不允许 UI 修改这些参数。

### 评测循环中的 live writer

优先在:

`/VLA/openpi/third_party/SimplerEnv/simpler_env/evaluation/maniskill2_evaluator.py`

的 `run_maniskill2_eval_single_episode(...)` 中接入 live writer,因为这里已经能拿到:

- `task_description`
- `image`
- `raw_action`
- `timestep`
- `info`
- episode 成功/失败状态

写出时机:

- episode 初始化时: 写 `meta.json` 与初始 `status.json`
- 每一步评测后:
  - 覆盖写 `latest-frame.jpg`
  - 追加原始 7 维动作到 `actions.json`
  - 更新 `status.json` 中的 `prompt`、`step`、`updatedAt`、`actionCount`
- episode 结束时:
  - 将 `status` 更新为 `succeeded` 或 `failed`
  - 记录 `errorMessage` 或结束摘要

### 原始动作字段定义

直接取 `Pi05Inference.step()` 当前返回的 `raw_action`:

- `world_vector[0]` -> `x`
- `world_vector[1]` -> `y`
- `world_vector[2]` -> `z`
- `rotation_delta[0]` -> `roll`
- `rotation_delta[1]` -> `pitch`
- `rotation_delta[2]` -> `yaw`
- `open_gripper[0]` -> `gripper`

这是前端要求展示的“pi05 原始 7 维输出”,不是送进环境后的 `rot_axangle` 或处理后的夹爪动作。

## 前端实现建议

### 页面组件

建议将新页面拆成独立客户端组件,避免把大量轮询和控制状态堆进现有 `evaluation-dashboard.tsx`。

可以复用:

- 现有 evaluation workbench 的视觉样式
- 现有 `recharts` 封装和配色策略

建议新增一个聚焦单一职责的组件,例如:

- `src/components/evaluation/simpler-launch-panel.tsx`

### 刷新策略

- 页面挂载后立即请求一次 `status`
- 若状态为 `starting | running | stopping`,每 1000ms 轮询一次
- 若状态为 `idle | succeeded | failed | stopped`,停止或降低轮询频率

### 图片刷新策略

使用 `frameVersion` 或 `updatedAt` 拼接查询参数,避免浏览器缓存旧图。

### 图表数据量

首版直接渲染全量 `actionSeries`。如果后续单次 episode 数据过多导致前端卡顿,再增加窗口裁剪或抽样。

## 错误处理

### 启动阶段

- server 未在超时内 ready -> 标记 `failed`
- 启动脚本非零退出 -> 标记 `failed`
- runtime 目录初始化失败 -> 接口返回 `500`

### 运行阶段

- live writer 写文件失败 -> 将错误写入 `stderr.log` 并尽量同步到 `status.json`
- 最新帧尚未生成时,前端图片区显示占位状态
- `actions.json` 临时不可读时,服务层返回最后一次成功读取的数据或空数组

### 停止阶段

- 手动停止时优先标记 `stopping`
- 进程终止成功后标记 `stopped`
- 若进程已经自然结束,停止接口返回当前最终状态而不是再报致命错误

## 测试策略

### Next.js 单元测试

新增或扩展测试覆盖:

- 新页面存在任务下拉框、启动按钮、停止按钮、prompt 区、图表区
- 状态轮询成功时正确渲染 prompt 与动作数据
- 运行中禁用任务选择与启动按钮
- 停止接口触发后按钮和状态正确变化

### 服务层测试

覆盖:

- `taskId` 白名单校验
- 活动 run 冲突控制
- runtime 状态文件解析
- frame 接口在图片不存在时返回 `404`

### `/VLA/openpi` 侧验证

至少验证:

- 单任务包装脚本能正确映射 4 个任务
- 评测启动后 runtime 目录按预期生成
- step 推进时 `status.json`、`actions.json`、`latest-frame.jpg` 持续更新
- 手动停止时 server 与 task 进程被正确清理

### 集成验证

最终验证命令至少包括:

- `npm run type-check`
- `npm run test -- <相关测试文件>` 或 `npx vitest run <相关测试文件>`

如果本地具备 SimplerEnv 运行条件,再做一次手工联调:

- 启动页面
- 选择 1 个任务
- 点击启动
- 观察 prompt、图片和动作曲线每秒刷新
- 点击停止并确认状态变为 `stopped`

## 设计取舍

### 选择文件轮询而不是 SSE/WebSocket

原因:

- 更容易复用现有 Next.js API route
- 更容易复用和调试 `/VLA/openpi` 脚本
- 单任务 1Hz 刷新对首版足够

### 选择独立页面而不是并入回放页

原因:

- 运行控制与历史回放是两种不同职责
- 独立页面能减少现有回放页状态复杂度

### 选择在 evaluator 层写 runtime 而不是解析日志

原因:

- evaluator 已经拿到 prompt、image 和 raw action
- 日志解析脆弱,且拿不到实时图片和结构化动作序列

## 后续扩展方向

- 扩展为多任务并发监控
- 扩展到 RMBench 评测启动
- 将动作数据从全量 JSON 改为增量流
- 在页面中加入最近日志摘要与最终视频入口
- 将单任务 runtime 协议抽象为通用评测 runtime 协议
