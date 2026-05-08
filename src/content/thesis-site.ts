export type ThesisNavItem = {
  href: string;
  label: string;
  shortLabel: string;
  hook: string;
};

export type ThesisStoryPage = {
  href: string;
  label: string;
  shortLabel: string;
  eyebrow: string;
  title: string;
  hook: string;
  summary: string;
  highlights: string[];
  media: string[];
  takeaway: string;
};

export const thesisTitle = "面向长程任务的 VLM-VLA 通用记忆系统";
export const thesisSubtitle = "给 VLA 装上一个轻量、解耦、可插拔的记忆模块";
export const thesisHeroVideoSrc = "/videos/nice.mp4";
export const dataCleaningToolNavItem = {
  href: "/local/pick_X_times_filterd_twice/episode_0",
  label: "数据清洗工具",
  shortLabel: "Tool",
  hook: "打开 pick_X_times_filterd_twice 数据集，进入同步视频、动作曲线和 URDF 回放检视。",
};

export const thesisMetrics = [
  {
    value: "64.6%",
    label: "SimplerEnv 平均成功率",
    caption: "超越 11 个对比方法",
  },
  {
    value: "5-10x",
    label: "RMBench Swap Blocks 提升",
    caption: "相对 DP / pi0.5 LoRA",
  },
  {
    value: "4 种",
    label: "记忆方案实现并对比",
    caption: "Cache / Comp / Norm / GCA",
  },
  {
    value: "3 个",
    label: "评测平台",
    caption: "SimplerEnv / RMBench / ACONE",
  },
  {
    value: "37 条 / 34205 帧",
    label: "真机数据自采与清洗",
    caption: "长程任务数据闭环",
  },
  {
    value: "1 套",
    label: "自研 URDF 三维数据清洗工具",
    caption: "服务真机数据质量筛选",
  },
  {
    value: "0 改动",
    label: "预训练 VLM 骨干参数",
    caption: "方法解耦注入，不侵入骨干",
  },
];

export const thesisResultPanels = [
  {
    title: "SimplerEnv 完整对比",
    caption: "短程任务上，GCA 以 64.6% 平均成功率建立可信优势。",
  },
  {
    title: "RMBench Swap Blocks",
    caption: "强记忆依赖场景下，相对 DP / pi0.5 LoRA 给出 5-10 倍提升。",
  },
  {
    title: "真机任务关键帧",
    caption: "真实平台上的多阶段操作构成了最直接的记忆需求证据。",
  },
];

export const thesisPages: ThesisStoryPage[] = [
  {
    href: "/why-memory",
    label: "为什么需要记忆",
    shortLabel: "Page 1",
    eyebrow: "Page 1 / Background",
    title: "为什么需要记忆？",
    hook: "让机器人取杯倒水，它会忘记自己刚开过柜门。",
    summary:
      "长程任务里的失败常常不是因为机器人看不见，而是因为它只看见了此刻。柜门开过没有、杯子拿过没有、任务走到哪一步，这些信息藏在过去的动作里。",
    highlights: [
      "VLA 从 RT-1 走到 pi0.5，模型越来越强，但长程阶段感仍然没有自然消失。",
      "上下文扩展、外部存储、端到端嵌入都在尝试补上历史信息，各自也带来成本和耦合。",
      "这项工作把问题收束到三个词：通用、轻量、解耦。",
    ],
    media: ["VLA 时间线图", "三类记忆方案对比图", "问题定义引导卡片"],
    takeaway: "记忆不是装饰模块，而是长程操作成功与否的分水岭。",
  },
  {
    href: "/method",
    label: "方法核心",
    shortLabel: "Page 2",
    eyebrow: "Page 2 / Method",
    title: "方法核心：三步走",
    hook: "把“记忆”拆成一个三阶段流水线，每一阶段只做一件事。",
    summary:
      "记忆没有被粗暴塞进模型骨干，而是被拆成清晰的流水线：先从当前观察中提取，再把历史组织起来，最后以门控交叉注意力注入动作专家。",
    highlights: [
      "图 3-1 展开完整路径：当前观察和指令进入 VLM，记忆词元读出信息，再进入历史聚合器。",
      "提取：用可学习记忆词元在 VLM 末端读取当前观察。",
      "聚合：用块级因果注意力融合滑动窗口内历史。",
      "注入：用门控交叉注意力把记忆送进动作专家，而不是穿透 VLM 骨干。",
      "连续回合采样让训练样本保留前后关系，避免把长程任务切成互不相干的片段。",
    ],
    media: ["整体架构总图", "提取/聚合/注入局部示意图", "训练采样策略图"],
    takeaway: "本文方法的核心不是加历史，而是把历史以正确位置和方式注入策略。",
  },
  {
    href: "/memory-systems",
    label: "四种记忆方案对比实现",
    shortLabel: "Page 3",
    eyebrow: "Page 3 / Systems",
    title: "不止一种方案：4 种记忆系统的对比实现",
    hook: "为了找到最好的方案，我们把四条路全走了一遍。",
    summary:
      "Cache、Comp、Norm、GCA 不是纸面上的四个名字，而是四条被实现、训练、比较过的路线。最后留下来的方案，是在同一批问题里筛出来的。",
    highlights: [
      "表 3-1 把四种方案并排摆开，历史来源、注入位置和结构风险一目了然。",
      "Cache 把历史直接带进来，简单有效，也最容易形成注意力捷径。",
      "Comp 压缩了 KV，却仍然让历史信息穿过骨干路径。",
      "Norm 用仿射调制改变隐状态，但缺少足够细的空间选择性。",
      "GCA 把记忆留在骨干之外，只在动作专家处完成解耦注入。",
    ],
    media: ["方法对比总表", "四张方案卡片", "注入点对照图"],
    takeaway: "GCA 的胜出来自系统比较，不是单点尝试。",
  },
  {
    href: "/dataset-and-tooling",
    label: "真机平台与数据清洗工具",
    shortLabel: "Page 4",
    eyebrow: "Page 4 / Platform",
    title: "真机平台与数据清洗工具",
    hook: "写代码之前，我们先建了一个数据清洗网页应用。",
    summary:
      "真实机器人数据不会自动变干净。相机、动作、轨迹长度、失败片段都需要被检视和筛选，这套网页工具就是从这条数据链路里长出来的。",
    highlights: [
      "ARX Acone 平台给任务提供了真实双臂操作场景。",
      "三次拿起小包再触碰绿环的过程，让相似画面反复出现，阶段记忆变得必要。",
      "URDF 回放、轨迹统计、质量筛选和清洗前后对比，把数据质量问题变成可检查的证据。",
      "37 条 episode 和 34205 帧最终进入训练数据集。",
    ],
    media: ["平台照片/示意图", "关键帧序列", "工具截图轮播", "数据集统计表"],
    takeaway: "算法之外，本文也把真实平台、数据集和清洗工具链搭起来了。",
  },
  {
    href: "/results",
    label: "实验结果",
    shortLabel: "Page 5",
    eyebrow: "Page 5 / Results",
    title: "实验结果",
    hook: "在三个平台上，我们分别问了三个不同的问题。",
    summary:
      "训练曲线先回答模型是不是认真训出来的，测试结果再回答它是不是真的会做任务。短程、遮挡、强记忆依赖和真机案例被放在同一条证据链上。",
    highlights: [
      "4 种方法的 loss 曲线放在一起，展示不同记忆路径的训练动态。",
      "SimplerEnv、RMBench 和 ACONE 分开展示，避免把不同问题混成一个平均数。",
      "分组学习率和 8xH800 训练资源，让工程成本可见。",
      "结果从短程任务推进到遮挡案例、Swap Blocks，再落到真机关键帧。",
    ],
    media: ["可交互训练曲线", "结果表与柱状图", "基线对比 rollout 视频"],
    takeaway: "结果页要同时回答两个问题：这套方法真训出来了，而且它确实更强。",
  },
  {
    href: "/analysis",
    label: "深入分析",
    shortLabel: "Page 6",
    eyebrow: "Page 6 / Analysis",
    title: "深入分析：为什么 GCA 赢了？",
    hook: "Comp 在平均分上接近 GCA，但它有一个根本性缺陷。",
    summary:
      "分数只告诉我们谁赢了，结构分析才说明为什么会赢。这里把几种方案拆开看：历史信息从哪里来、经过哪里、最后影响了谁。",
    highlights: [
      "Norm 在部分任务上能抬分，也会在另一些任务上掉下去，问题来自粗粒度调制。",
      "Comp 的平均分接近 GCA，但历史信息仍会穿透 VLM 层，长程任务里容易留下隐患。",
      "骨干受影响和骨干不受影响的对照图，把解耦注入的价值讲清楚。",
      "聚合模块消融和推理效率会继续补上，让分析从现象走向机制。",
    ],
    media: ["机制对比图", "失败案例解释图", "重点结论卡片"],
    takeaway: "GCA 的优势来自结构设计，而不是偶然的结果波动。",
  },
  {
    href: "/conclusion",
    label: "总结与展望",
    shortLabel: "Page 7",
    eyebrow: "Page 7 / Conclusion",
    title: "总结与展望",
    hook: "做了什么，没做完什么，下一步去哪。",
    summary:
      "这项工作把记忆机制、训练采样、可插拔架构和数据工具链串成了一个完整闭环，也留下了更长窗口、更强闭环验证和可解释性分析的空间。",
    highlights: [
      "主要贡献落在四处：GCA 机制、连续回合采样、可插拔架构和数据清洗工具。",
      "当前版本仍受固定窗口、闭环验证不足、可解释性有限和任务复杂度的约束。",
      "下一步自然走向自适应窗口、闭环验证、可解释性分析和多任务迁移。",
    ],
    media: ["贡献图标卡片", "局限与未来方向对照布局", "论文与代码入口"],
    takeaway: "这项工作已经形成完整故事，同时保留清晰可扩展的下一步。",
  },
];

export const thesisNavItems: ThesisNavItem[] = thesisPages.map((page) => ({
  href: page.href,
  label: page.label,
  shortLabel: page.shortLabel,
  hook: page.hook,
}));

export function getStoryPage(href: string) {
  return thesisPages.find((page) => page.href === href);
}

export function getNextStoryPage(href: string) {
  const currentIndex = thesisPages.findIndex((page) => page.href === href);
  if (currentIndex < 0 || currentIndex === thesisPages.length - 1) {
    return null;
  }
  return thesisPages[currentIndex + 1];
}
