# Lerobot Dataset Visualizer 中文入口与本地数据文件夹导入设计

## 目标

为 `lerobot-dataset-visualizer` 增加两项能力：

1. 将首页入口改成中文界面。
2. 支持在网页中选择本地 LeRobot 数据集文件夹导入，并在后续刷新或重开页面后保留最近导入记录。

本次范围只覆盖入口页和本地导入链路，不对详情页做全面中文化。详情页现有路由、数据加载和图表逻辑尽量保持不变，只保证本地导入后的数据集能够进入现有浏览路径。

## 非目标

- 不重写详情页组件文案。
- 不替换现有 `/${org}/${dataset}/episode_0` 路由结构。
- 不引入新的数据库或外部存储。
- 不改变远程 Hugging Face 数据集的加载行为。

## 当前状态

### visualizer 现状

- 首页 `src/app/page.tsx` 是英文搜索页，支持搜索远程数据集并跳转。
- 本地数据集支持已经存在于底层 URL 解析中：
  - `src/utils/localDatasets.ts` 通过 `LOCAL_LEROBOT_DATASETS_JSON` 解析 `local/...` 到本地目录。
  - `src/utils/versionUtils.ts` 在 repo_id 属于本地数据集时，改走 `/api/local-datasets/...`。
- 本地数据集注册方式目前依赖环境变量，不提供 UI 内导入，也没有持久化最近导入记录。

### score_lerobot_episodes 参考实现

- 通过 `ui_local_import.py` 提供：
  - 文件夹选择
  - 本地路径校验
  - `local/<alias>` 生成
  - 导入摘要展示
  - 本次会话内注册
- 交互模型已经验证可用，适合作为 visualizer 入口体验参考。

## 用户体验设计

### 首页结构

首页保留现有“单页入口”定位，但改成中文，并拆成两个主入口：

1. 远程数据集
2. 本地数据集

### 远程数据集入口

- 保留现有搜索与联想能力。
- 将标题、副标题、输入占位、按钮文案改成中文。
- 输入 Hugging Face 数据集 ID 后，按现有行为跳转。

### 本地数据集入口

新增一个本地数据集导入卡片，包含：

- “选择本地文件夹”按钮
- 本地路径只读/可回填输入框
- 可选别名输入框
- 校验摘要区
- “进入可视化”按钮
- “最近导入”列表

#### 交互流程

1. 用户点击“选择本地文件夹”。
2. 前端调用本地目录选择接口。
3. 服务端返回选中的目录路径。
4. 用户可选填写别名。
5. 用户点击“进入可视化”。
6. 服务端执行校验与注册：
   - 检查目录存在且是文件夹
   - 检查 `meta/info.json`
   - 校验支持的版本
   - 生成规范化 `local/<alias>`
   - 写入持久注册表
7. 前端展示摘要，并跳转到 `/${org}/${dataset}/episode_0`。

### 最近导入

首页显示最近导入的本地数据集列表，至少包含：

- 显示名称
- 本地路径
- 版本
- 回合数
- 最近导入时间
- 进入按钮

刷新页面后列表仍然存在。重开服务后列表也仍然存在。

## 架构设计

### 设计原则

- 尽量复用现有本地数据 URL 构造与详情页数据加载链路。
- 将“本地注册”与“详情页读取”解耦。
- 持久化方案保持简单透明，便于手动查看和修复。

### 持久化注册表

新增仓库内 JSON 文件作为本地数据注册表，例如：

- `data/local_datasets_registry.json`

文件内容固定为对象数组，便于附带元数据和按最近使用时间排序。每条记录包含：

- `repo_id`
- `path`
- `display_name`
- `version`
- `total_episodes`
- `fps`
- `robot_type`
- `last_opened_at`

### 本地数据注册模块

新增服务端模块，职责包括：

- 目录选择辅助
- 本地路径校验
- repo_id 生成
- 注册表读写
- 返回前端所需摘要

建议拆成小函数：

- `buildLocalRepoId(datasetPath, customAlias)`
- `validateLocalDatasetPath(datasetPath)`
- `loadLocalDatasetRegistry()`
- `saveLocalDatasetRegistry(entries)`
- `registerLocalDataset(entry)`
- `listRecentLocalDatasets()`

该模块在职责上对齐 `score_lerobot_episodes.ui_local_import`，但实现语言和运行位置改为 Next.js 服务端。

### localDatasets 扩展

`src/utils/localDatasets.ts` 目前只读取环境变量。需要扩展为：

1. 先读环境变量注册表。
2. 再读持久化注册表。
3. 合并两者，环境变量优先。

这样保留现有 `run_local_v21.sh` 的兼容性，同时允许 UI 导入的数据集在不设置环境变量时也能工作。

### API 设计

新增 API 路由：

1. `GET /api/local-datasets/registry`
   - 返回最近导入列表

2. `POST /api/local-datasets/register`
   - 请求体：
     - `path`
     - `alias`
   - 响应：
     - `repoId`
     - `summary`
     - `entryRoute`

3. `POST /api/local-datasets/pick-directory`
   - 尝试弹出系统目录选择
   - 成功时返回所选路径
   - 当前环境不支持 GUI 时返回明确错误

如果浏览器环境无法直接触发系统选择器，也允许前端在失败时回退到手动路径输入，但主入口仍然首先提供“选择本地文件夹”按钮。

## 数据流

### 远程数据集

`首页输入 repo_id -> 跳转 -> 现有详情页数据加载逻辑`

### 本地数据集

`首页选择目录 -> register API -> 持久注册表 -> 跳转到 local/<alias>/episode_0 -> 现有 versionUtils/buildLocalDatasetUrl -> 现有本地资源 API`

关键点是：详情页不关心导入方式，只关心 repo_id 是否能在本地注册表里解析到真实目录。

## 中文化范围

本次只改入口页和本地导入相关提示：

- 首页标题、副标题
- 搜索框文案
- 本地导入卡片文案
- 校验摘要
- 最近导入列表文案
- 错误提示与空状态

详情页暂不全面中文化，避免本次范围膨胀。

## 错误处理

需要覆盖这些场景：

- 无法打开系统目录选择窗口
- 选择结果为空
- 路径不存在
- 路径不是目录
- 缺少 `meta/info.json`
- `info.json` 不是合法 JSON
- `codebase_version` 不支持
- 必要字段缺失，如 `total_episodes`、`fps`
- alias 非法或为空时的默认回退
- 注册表读写失败

所有错误都应返回明确的人类可读中文提示。

## 测试计划

### 单元测试

- 本地 repo_id 生成
- 本地路径校验
- 注册表读写与去重
- `localDatasets.ts` 环境变量与持久注册表合并逻辑

### API 测试

- 注册成功
- 注册失败
- 最近导入列表读取
- 文件夹选择失败时返回中文错误

### 页面测试

- 首页中文文案渲染
- 本地导入入口显示
- 最近导入列表显示

### 回归测试

- 远程数据集入口继续可用
- 已有本地 URL 构造逻辑继续可用
- `run_local_v21.sh` 启动路径不回归

## 实施顺序

1. 增加本地注册表与服务端校验模块
2. 扩展 `localDatasets.ts` 读取持久注册表
3. 增加本地导入 API
4. 改造首页为中文入口页
5. 增加最近导入列表
6. 补测试并验证 `npm test`、`npm run type-check`

## 风险与缓解

### 风险 1：浏览器环境无法稳定弹出系统目录选择

缓解：

- 保留失败提示
- 在 UI 中允许回退到手动路径输入

### 风险 2：服务端无权访问用户选择的宿主机路径

缓解：

- 当前目标环境是本地 WSL/本机运行，优先支持这一场景
- 错误提示中明确说明权限或挂载问题

### 风险 3：持久注册表与环境变量冲突

缓解：

- 环境变量优先
- 注册表只作为补充来源

### 风险 4：入口页改动影响原有远程搜索体验

缓解：

- 保留原有搜索逻辑
- 只重构展示和入口组织方式，不改远程跳转主逻辑

## 决策

采用“中文首页 + 本地注册表 + UI 内文件夹选择 + 持久最近导入列表”的最小可落地方案。

理由：

- 最贴近 `score_lerobot_episodes` 已验证的交互方式
- 最大程度复用现有详情页与本地数据加载链路
- 不需要引入数据库
- 能把本次范围稳定限制在入口页与本地导入流程
