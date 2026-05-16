# SimplerEnv 低延迟 MJPEG 预览设计

## 目标

将 `/evaluation/launch` 的“最新渲染图”从当前的“状态轮询 + 单张 JPG 替换”改为低延迟流式预览,使图片更新延迟尽量接近 runtime 实际写帧延迟,并优先保证 Chrome/Edge 下的可用性。

本次改动只解决 SimplerEnv 启动页中的实时图片预览,不改动作曲线、日志面板、任务控制和历史回放页。

## 背景与问题

当前页面中:

- 动作数据来自 `/api/evaluation/simpler/status` 的结构化 JSON
- 图片先通过 `/api/evaluation/simpler/status` 拿到 `latestFrameUrl` 和 `frameVersion`
- 前端再发起第二次图片请求,等 `new Image().onload` 后替换 `<img>`

这条链路有两个直接问题:

1. 图片更新被状态轮询频率限制,即使 runtime 已经写出新帧,前端也要等下一次状态请求
2. 图片请求与动作 JSON 请求分离,动作可以“看起来实时”,图片却天然多一跳 HTTP 请求和一次浏览器解码

现有 SimplerEnv runtime 还会直接覆盖写 `latest-frame.jpg`,这对静态单图影响不大,但对持续流式读取更容易引入读到写入中内容的风险。

## 范围与非目标

### 本次范围

- 为 SimplerEnv 新增一个 MJPEG 流式预览接口
- 将 `/evaluation/launch` 的实时图片展示切换到该流接口
- 保留现有静态图片接口作为最终态快照和兼容回退
- 为 runtime 最新帧写入增加原子替换,降低流式读取抖动
- 为新接口和新前端行为补测试

### 明确不做

- 不把状态接口改成 SSE 或 WebSocket
- 不将动作曲线改为流式协议
- 不引入 WebRTC
- 不修改 `/evaluation/replay`
- 不实现多任务并发图像流监控
- 不为 Safari 做额外兼容优化

## 方案选择

本次选择 `MJPEG HTTP stream` 作为首版流式预览方案。

原因:

- 能直接复用浏览器原生 `<img>` 渲染能力
- 接入成本明显低于 WebSocket 二进制帧或 WebRTC
- 可以只替换图片链路,不打断现有状态、日志、动作图的实现
- 对“最低延迟优先”的目标足够有效

不选 WebSocket 的原因是协议、连接状态和前端解码逻辑更重;不选 WebRTC 的原因是实现和调试成本明显超出当前页面需求。

## 总体架构

整体仍保持三层:

1. Next.js 页面层
2. Next.js Simpler 服务层
3. `/VLA/openpi/third_party/SimplerEnv` runtime 写出层

职责调整如下:

- 页面层继续用 `/api/evaluation/simpler/status` 获取任务状态、动作序列和日志信息
- 页面层新增对 `/api/evaluation/simpler/frame/stream?runId=...` 的 `<img>` 流式消费
- 服务层新增 MJPEG 长连接输出能力
- runtime 写帧从“直接覆盖 JPG”调整为“临时文件写入后原子替换”

## 页面行为设计

### 状态与动作

以下行为保持不变:

- 任务状态继续按现有节奏轮询 `/api/evaluation/simpler/status`
- 动作曲线继续使用 `actionSeries`
- 日志继续使用现有日志接口

图片流式化不改变这些数据源,只替换图片展示链路。

### 图片展示

前端不再维护:

- `displayedFrameSrc`
- `new Image()` 预加载替换逻辑
- 基于 `frameVersion` 的单图 cache busting 切换

前端新增一个“当前是否使用流”的判断:

- 当任务状态属于 `starting`、`running`、`stopping` 且存在 `runId` 时,图片区域直接渲染流式 `<img>`
- 当任务进入 `succeeded`、`failed`、`stopped` 时,停止使用流式地址,回退到静态 `latestFrameUrl` 作为最后快照
- 当没有 `runId` 或尚无图片时,继续显示现有空状态文案

具体显示策略:

- 运行中图片源: `/api/evaluation/simpler/frame/stream?runId=<runId>`
- 结束态图片源: `${latestFrameUrl}&v=${frameVersion}`

这样做的目的有两个:

1. 运行中使用长连接获得最低延迟
2. 最终态切回静态图,避免任务结束后页面保留一个无意义的打开连接

### 连接切换

前端需要保证以下切换规则:

- 新 run 启动时,`<img>` 必须因为 `runId` 变化而重建连接
- 手动停止或任务自然结束时,流连接应被浏览器正常释放
- 如果状态轮询仍显示任务在运行,即使短时间没有新帧,前端也不主动重连

这意味着图片区域的驱动信号从“帧版本”改成“runId + run status”。

## 服务端接口设计

### 保留接口

以下接口保持存在:

- `GET /api/evaluation/simpler/status`
- `GET /api/evaluation/simpler/frame?runId=...`

其中静态 `frame` 接口继续承担:

- 最终态快照显示
- 调试或人工直接访问单张图

### 新增接口

新增:

- `GET /api/evaluation/simpler/frame/stream?runId=...`

响应类型:

- `content-type: multipart/x-mixed-replace; boundary=frame`
- `cache-control: no-store`

行为定义:

- 缺少 `runId` -> `400`
- `runId` 非法或不存在 -> `404`
- run 存在时建立长连接
- 首次连接成功后,尽快发送当前最新一帧
- 后续在检测到 `latest-frame.jpg` 更新后,立即发送下一帧
- 客户端断开连接后立即停止服务端循环

该接口不依赖 `frameVersion`,而是直接监视实际图片文件变化。

## 服务层实现设计

建议在 `src/server/simpler-launch/service.ts` 中新增一个专门的流构建入口,例如:

- `createSimplerFrameStream(runId, deps?)`

该入口负责:

1. 校验 `runId`
2. 解析对应 run 的 runtime 状态
3. 定位 `latest-frame.jpg`
4. 构造 `ReadableStream<Uint8Array>`
5. 在循环中比较图片文件的 `mtimeMs` 和 `size`
6. 有变化时读取最新 JPEG 并写出一个 MJPEG part
7. 在请求取消时结束循环

每个 part 的格式固定为:

```text
--frame
Content-Type: image/jpeg
Content-Length: <bytes>

<jpeg bytes>
```

为了避免重新引入“服务端 5Hz 节流”,服务层不应按固定 200ms 推帧。正确策略是:

- 用短间隔轮询文件元数据,例如 30-50ms 级别
- 只有检测到文件变化时才发送新 part
- 没有变化时只等待,不发送重复帧

这样可以把端到端图片延迟压到“runtime 写帧 + 文件检测 + 浏览器显示”的总和,而不是再叠加状态接口轮询延迟。

### 失败与边界情况

服务层需要明确处理:

- 图片文件暂时不存在: 连接建立后继续短暂等待,直到首帧出现或任务终止
- 图片读取失败: 跳过本次发送,保留连接,等待下一次文件变化
- run 已结束但仍存在最后一帧: 可以发送最后一帧,随后结束流
- run 被删除或状态文件损坏: 结束流

这里的原则是“最佳努力预览”: 尽量不断流,但不把流接口做成复杂的恢复协议。

## Runtime 写帧设计

为了让 MJPEG 服务端尽量不要读到写入中的 JPEG,需要同步调整 SimplerEnv runtime 写帧方式。

涉及文件:

- `/VLA/openpi/third_party/SimplerEnv/simpler_env/evaluation/live_runtime.py`

当前行为:

- `Image.save(self.frame_path, ...)` 直接覆盖 `latest-frame.jpg`

目标行为:

- 先写到 `latest-frame.jpg.tmp`
- 写完后用原子替换覆盖正式文件

这样可以使服务端看到的 `latest-frame.jpg` 始终是“上一张完整帧”或“新一张完整帧”,而不是中间态。

状态 JSON 和动作 JSON 已经使用临时文件替换,图片写入应与其保持一致。

## API 与组件边界

### 需要新增或修改的 Next.js 文件

- 新增 `src/app/api/evaluation/simpler/frame/stream/route.ts`
- 修改 `src/server/simpler-launch/service.ts`
- 修改 `src/components/evaluation/simpler-launch-panel.tsx`
- 视实现需要,补充或调整 `src/types/simpler-launch.ts`

### 需要新增或修改的外部 runtime 文件

- 修改 `/VLA/openpi/third_party/SimplerEnv/simpler_env/evaluation/live_runtime.py`

本次不需要改:

- `launch` / `stop` 路由协议
- 动作数据结构
- 日志接口结构

## 测试策略

### 服务端测试

为新的流接口和服务函数补测试,覆盖:

- 缺少 `runId` 返回 `400`
- 非法或不存在的 `runId` 返回 `404`
- 已有首帧时,响应头包含正确的 `multipart/x-mixed-replace` 类型
- 文件变化后,流中会追加新的 JPEG part
- 请求中止后,服务端循环能正常退出

如现有路由测试不便直接消费长流,可以拆成:

- 服务层单元测试验证流输出行为
- 路由测试验证状态码和响应头

### 前端测试

调整 `src/components/evaluation/__tests__/simpler-launch-panel.test.tsx`:

- 运行中状态时,图片 `src` 使用 `/frame/stream?runId=...`
- 结束态时,图片 `src` 使用静态 `latestFrameUrl&v=...`
- 删除或替换当前“5Hz 刷新 latest frame”测试,因为图片链路不再由 `frameVersion` 驱动
- 验证动作图表和状态轮询行为未回归

### Runtime 测试

如果当前仓库已有覆盖 run script 或 service 的集成测试,补一个针对图片写入方式的最小测试:

- 新帧写入后 `latest-frame.jpg` 始终可被完整读取

如果外部 runtime 现有测试体系更适合承载,则在 `/VLA/openpi/third_party/SimplerEnv` 中补对应单元测试。

## 验收标准

满足以下条件即视为完成:

- `/evaluation/launch` 运行中图片使用 MJPEG 流式预览
- 动作数据仍由原状态接口更新,无需改动图表协议
- 任务结束后图片区域回退到静态最终帧
- 新流接口能在 Chrome/Edge 下稳定显示
- 服务端不会固定按 5Hz 重发重复帧
- runtime 图片写入不会再直接覆盖正式 JPG 文件

## 风险与取舍

### 已接受取舍

- 首版只优先支持 Chrome/Edge,不为 Safari 做额外兼容
- 仍然使用文件系统作为 runtime 与 Next.js 的边界,不引入更复杂的进程内推流

### 主要风险

- MJPEG 是持续长连接,服务端实现需要确保请求中止后释放循环
- 如果 runtime 写帧频率远高于浏览器解码能力,浏览器仍可能跳帧
- 外部 `/VLA/openpi` 代码修改需要和当前仓库变更一起验证

这些风险都小于继续沿用“状态轮询 + 单图替换”带来的预览延迟问题。
