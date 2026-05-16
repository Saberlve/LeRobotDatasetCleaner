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
  figures?: ThesisFigure[];
  benchmarkTables?: ThesisBenchmarkTable[];
  benchmarkSections?: ThesisBenchmarkSection[];
  platform?: ThesisPlatformCallout;
  takeaway: string;
};

export type ThesisFigure = {
  src?: string;
  title: string;
  caption: string;
  layout?: "wide" | "standard" | "portrait";
};

export type ThesisBenchmarkTable = {
  title: string;
  caption: string;
  columns: string[];
  rows: string[][];
};

export type ThesisBenchmarkVideo = {
  title: string;
  caption: string;
  src: string;
  poster: string;
  playbackRate?: number;
};

export type ThesisBenchmarkSection = {
  name: string;
  kicker: string;
  intro: string[];
  compact?: boolean;
  videos: ThesisBenchmarkVideo[];
  videoColumns: 1 | 2 | 4;
  table?: ThesisBenchmarkTable;
};

export type ThesisPlatformCallout = {
  title: string;
  caption: string;
  href: string;
  action: string;
  chips: string[];
  image: string;
};

export const thesisTitle = "面向长程任务的 VLM-VLA 通用记忆系统";
export const thesisSubtitle = "给 VLA 装上一个轻量、解耦、可插拔的记忆模块";
export const thesisHeroVideoSrc = "/videos/nice.mp4";

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
    caption: "Cache / Comp / Norm / 门控交叉注意力",
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
    caption:
      "四类短程桌面任务上，门控交叉注意力 以 64.6% 平均成功率建立可信优势。",
  },
  {
    title: "RMBench Swap Blocks",
    caption: "强记忆依赖场景下，相对 DP / pi0.5 LoRA 给出 5-10 倍提升。",
  },
  {
    title: "真机迁移快报",
    caption: "ACONE 的 14 维关节开环误差中有 12 维低于 0.1。",
  },
];

export const thesisPages: ThesisStoryPage[] = [
  {
    href: "/why-memory",
    label: "背景与研究动机",
    shortLabel: "P1",
    eyebrow: "01 / 06",
    title: "VLA 模型的“金鱼记忆”",
    hook: "主流 VLA 架构每次只输入一帧图像，没有获取历史信息的途径，因此无法完成长程任务。",
    summary:
      "机器人在长程操作里缺少记忆。再交换方块、连续拿取这些任务都要求模型知道前面发生过什么；只看当前画面时，相同的观测但是不同的历史会输出相同的动作。",
    highlights: [
      "视觉语言动作模型把图像、语言和本体状态映射到动作，但常见决策路径只使用当前观测。",
      "交换方块任务需要保留方块起点、当前阶段和已执行动作；无记忆基线在后续步骤容易偏离。",
      "本文切入点是给 VLA 增加轻量记忆通道，并把它约束在可插拔、低耦合、可复用的结构里。",
    ],
    media: ["典型 VLA 单帧架构", "交换方块失败案例", "记忆通道切入点"],
    takeaway:
      "长程操作需要把过去压成可用状态；本文从单帧 VLA 的缺口出发，补上一条不侵入骨干的记忆通道。",
  },
  {
    href: "/method",
    label: "方法",
    shortLabel: "P2",
    eyebrow: "02 / 06",
    title: "让VLA不再「只看当下」",
    hook: "提取当前画面，压缩历史信息，带着记忆去做决策。",
    summary:
      "完整历史 H_t 随时间线性增长，直接输入给 VLA 会导致上下文爆炸。因此要对上下文做合理压缩，本文把使用少量的可学习记忆词元提取每一帧的信息，再用记忆模块做时序聚合，最后通过门控交叉注意力在动作生成中注入记忆。",
    highlights: [
      "当前帧的视觉与语言输入分别经由视觉编码器和文本分词器处理，连同机器人状态一起送入VLM，形成初始观测嵌入。",
      "在每一帧输入序列末尾添加 N 个可学习词元，VLM通过因果注意力机制将当前观测信息写入，完成当前帧信息的压缩提取。",
      "历史缓存中的过去记忆词元送入双层 Transformer，采用块状因果注意力进行跨时间聚合，将多帧历史压缩为融合记忆。",
      "融合记忆通过门控交叉注意力注入动作专家。门控初始值接近 0，确保训练早期模型沿原有路径稳定运行，随训练推进逐步开放历史信息的影响。",
      "动作专家结合当前观测与注入的历史记忆生成最终动作输出；整个训练过程采用连续回合采样策略，使训练分布贴近推理时的真实部署场景，避免长程任务被切割为孤立片段。",
    ],
    media: ["POMDP 压缩公式", "三步走结构", "块级因果掩码"],
    figures: [
      {
        src: "/images/thesis/2-2.png",
        title: "记忆系统整体架构",
        caption:
          "记忆词元提取当前帧信息，历史缓存构成滑动窗口，再由聚合模块和门控交叉注意力送入动作专家。",
        layout: "wide",
      },
    ],
    benchmarkTables: [
      {
        title: "关键参数",
        caption: "训练配置中的记忆参数与方法结构保持一一对应。",
        columns: ["模块", "参数", "默认值", "含义"],
        rows: [
          ["提取", "记忆词元数量", "4", "每帧附加的记忆词元数量"],
          ["提取", "记忆词元初始化分布", "N(0, 0.02²)", "避免训练初期扰动"],
          ["聚合", "Transformer 层数", "2", "表达力与算力的平衡"],
          ["缓存", "记忆缓存库大小", "4", "滑动窗口长度"],
          ["缓存", "记忆存储步长", "30", "30Hz 频率下每秒存储一帧"],
          [
            "注入",
            "门控系数初值",
            "1e-3",
            "训练早期保持原通路稳定，但避免初值太小导致记忆作用丢失",
          ],
        ],
      },
    ],
    platform: {
      title: "训练配置中对比与修改",
      caption: "各个实验的训练配置都可以在平台中查看，并与基线进行对比",
      href: "/evaluation/training",
      action: "打开训练配置",
      chips: ["moment_token_count", "cache_size", "decision_stride"],
      image: "/images/thesis/platform-training-memory.png",
    },
    takeaway:
      "门控交叉注意力 的关键组合是可学习记忆词元、块级因果聚合和动作专家端后注入。",
  },
  {
    href: "/memory-systems",
    label: "方案对比",
    shortLabel: "P3",
    eyebrow: "03 / 06",
    title: "其他记忆系统架构探索",
    hook: "本节从结构角度对比四种方案，重点关注注入位置和耦合方式对系统的影响，实验数据作为最终的验证依据。",
    summary:
      "Cache、Comp、Norm 和 门控交叉注意力 这四种方案试图回答同一个问题：历史信息应当放在模型的哪个位置。结构层面的对比分析有助于排除显存开销、推理时延、骨干网络侵入度和注意力竞争等潜在风险，从而让主结果页的实验数据具有更清晰的解释。",
    highlights: [],
    media: ["三种融合方式结构对比", "四方案结构表", "关键判断"],
    figures: [
      {
        src: "/images/thesis/cache-context-memory.jpg",
        title: "缓存上下文记忆",
        caption:
          "将历史帧的键值缓存直接作为前缀拼入当前输入，实现直接但序列长度和计算成本随窗口增长。",
        layout: "portrait",
      },
      {
        src: "/images/thesis/compressed-context-memory.jpg",
        title: "压缩式上下文记忆",
        caption:
          "先将历史压缩为固定数量的记忆词元，再拼入上下文前缀，序列长度可控但记忆词元仍需与图像语言词元共享注意力池。",
        layout: "portrait",
      },
      {
        src: "/images/thesis/adaptive-normalization.jpg",
        title: "自适应层归一化",
        caption:
          "将压缩后的历史表示转换为归一化参数，对中间特征进行仿射调制，推理时额外开销低，但注入位置与 VLM 内部结构绑定。",
        layout: "portrait",
      },
      {
        src: "/images/thesis/gated-cross-attention.jpg",
        title: "门控交叉注意力",
        caption:
          "以动作专家隐藏状态查询记忆表示，通过门控残差后注入，让记忆通道与图像语言主路径保持解耦。",
        layout: "portrait",
      },
    ],
    platform: {
      title: "Baseline 对照配置",
      caption: "四种方案的训练入口和 memory 配置集中在同一个工作区。",
      href: "/evaluation/training",
      action: "打开训练配置",
      chips: ["Cache", "Comp", "Norm", "门控交叉注意力"],
      image: "/images/thesis/platform-baseline.png",
    },
    takeaway:
      "结构对比的关键结论是后注入：既不修改 VLM 骨干参数，也避免记忆与图像语言特征在同一注意力池中竞争。",
  },
  {
    href: "/results",
    label: "主结果",
    shortLabel: "P4",
    eyebrow: "04 / 06",
    title: "仿真与真机实验结果",
    hook: "SimplerEnv 平均成功率 64.6% 超越全部对比方法；RMBench 长程任务 20.0%，相对基线提升 5–10 倍；ACONE 真机 14 维控制自由度中 13 维误差低于 0.1。",
    summary: "",
    highlights: [
      "SimplerEnv WidowX 在抓取、放置、堆叠、入篮四类桌面操作上平均成功率达到 64.6%，超越所有对比方法。",
      "RMBench Swap Blocks 要求模型持续追踪两个方块的位置与任务进度，本文方法达到 20.0%，分别为 DP 和 π₀.5-LoRA 的 10 倍和 5 倍。",
      "基于 ACONE 双臂机器人平台手工采集 37 条高质量轨迹，总计 34205 帧，平均每回合约 924.5 帧。",
      "真机开环评测中 14 维控制自由度中 12 维 RMSE 低于 0.1，仅夹爪开合维度预测误差偏高。",
    ],
    media: ["SimplerEnv rollout", "RMBench rollout", "ACONE 迁移快报"],
    benchmarkSections: [
      {
        name: "SimplerEnv WidowX",
        kicker: "① 仿真四任务",
        intro: [
          "基于 SAPIEN 物理模拟器构建的 SimplerEnv 平台，在 WidowX 机械臂配置下评测四个桌面操作任务：将勺子放到毛巾上、将胡萝卜放到盘子上、将绿色方块放到黄色方块上、将茄子放进黄色篮子里。",
          "四个任务分别覆盖抓取、放置、堆叠和入篮四种操作类型，以完整任务成功率为评测指标。",
        ],
        videoColumns: 4,
        videos: [
          {
            title: "将勺子放到毛巾上",
            caption: "spoon on towel",
            src: "/video/simpler/spoon.mp4",
            poster:
              "/images/thesis/video_storyboards/simpler_spoon_storyboard.png",
          },
          {
            title: "将胡萝卜放到盘子上",
            caption: "carrot on plate",
            src: "/video/simpler/carrot.mp4",
            poster:
              "/images/thesis/video_storyboards/simpler_carrot_storyboard.png",
          },
          {
            title: "将绿色方块放到黄色方块上",
            caption: "cube stacking",
            src: "/video/simpler/cube.mp4",
            poster:
              "/images/thesis/video_storyboards/simpler_cube_storyboard.png",
          },
          {
            title: "将茄子放进黄色篮子里",
            caption: "eggplant in basket",
            src: "/video/simpler/eggplant.mp4",
            poster:
              "/images/thesis/video_storyboards/simpler_eggplant_storyboard.png",
          },
        ],
      },
      {
        name: "案例分析",
        kicker: "记忆有效性验证",
        intro: [
          "在目标物体被遮挡的复杂场景下，对比模型在「添加记忆」与「无记忆」情况下的表现。",
          "无记忆：由于无法获知历史信息，当目标物体被遮挡后，模型会出现明显的犹豫和不确定性，最终无法完成任务。",
          "添加记忆：模型能够利用历史记忆维持对目标位置的追踪，在遮挡发生时依然能果断执行动作，顺利完成任务。",
        ],
        compact: true,
        videoColumns: 2,
        videos: [
          {
            title: "基线无记忆VLA模型",
            caption: "在目标方块被遮挡后，模型犹豫，无法定位目标导致任务失败",
            src: "/video/simpler/badcase.mp4",
            poster: "",
            playbackRate: 3,
          },
          {
            title: "添加记忆后VLA模型",
            caption: "模型始终能够记得目标位置，成功完成任务",
            src: "/video/simpler/goodcase.mp4",
            poster: "",
          },
        ],
      },
      {
        name: "RMBench\n交换方块任务",
        kicker: "② 长程记忆任务",
        intro: [
          "RMBench 交换方块任务要求双臂机器人借助中间格交换两个方块的位置，操作过程中必须持续追踪方块的初始位置与当前流程阶段。",
          "单靠当前帧观测无法获知已放置方块的位置和任务进度，因此该任务对记忆能力有较强的依赖性。",
        ],
        compact: true,
        videoColumns: 1,
        videos: [
          {
            title: "RMBench 交换方块",
            caption: "模型通过观察历史动作，识别出交换任务阶段并执行抓取。",
            src: "/video/rmbench/nice.mp4",
            poster:
              "/images/thesis/video_storyboards/rmbench_nice_storyboard.png",
          },
        ],
        table: {
          title: "交换方块成功率对比",
          caption:
            "门控交叉注意力 在强记忆依赖任务上相对于基线方法取得了显著优势。",
          columns: ["方法", "成功率", "对比 门控交叉注意力"],
          rows: [
            ["Diffusion Policy", "2.0%", "10x"],
            ["π0.5-LoRA", "4.0%", "5x"],
            ["本文 π-门控交叉注意力", "20.0%", ""],
          ],
        },
      },
    ],
    benchmarkTables: [
      {
        title: "ACONE 真实机械臂记忆数据集统计",
        caption:
          "基于方舟无限 Acone 双臂机器人平台，手动引导采集的长程操作数据集。",
        columns: ["指标", "数值"],
        rows: [
          ["回合数量", "37"],
          ["总帧数", "34205"],
          ["帧率", "30 FPS"],
          ["平均长度", "924.5 帧/回合"],
          ["动作维度", "14 (7+7)"],
        ],
      },
    ],
    platform: {
      title: "评测回放工作区",
      caption:
        "所有 checkpoint 的成绩、柱状图和 rollout 视频都能在回放页切换查看。",
      href: "/evaluation/replay",
      action: "打开评测回放",
      chips: ["SimplerEnv", "RMBench", "checkpoint"],
      image: "/images/thesis/platform-replay-simpler.png",
    },
    takeaway:
      "主结果通过任务介绍、成功案例和定量对比形成完整证据链：门控交叉注意力 在常规短程任务上保持竞争力，在长程记忆任务上显著超越现有方法。",
  },
  {
    href: "/analysis",
    label: "分析实验",
    shortLabel: "P5",
    eyebrow: "05 / 06",
    title: "消融与分析实验",
    hook: "聚合层决定长程整合能力，注入位置决定是否抢走图像注意力。",
    summary:
      "分数只说明结果，消融和注意力分析解释机制。去掉聚合 Transformer 后，长程任务几乎塌方；Comp 前缀方案会把动作专家的注意力大量引向记忆，形成压缩式上下文记忆的注意力捷径。",
    highlights: [],
    media: ["记忆聚合模块的作用", "注意力分布", "时间步稳定性"],
    benchmarkTables: [
      {
        title: "消融实验：记忆聚合模块的作用：去除记忆聚合模块",
        caption: "",
        columns: ["任务", "具有聚合模块", "去除聚合模块", "变化"],
        rows: [
          ["将勺子放到毛巾上", "62.5%", "66.7%", "+4.2%"],
          ["将胡萝卜放到盘子上", "50.0%", "58.3%", "+8.3%"],
          ["将绿色方块放到黄色方块上", "62.5%", "12.5%", "-50.0%"],
          ["将茄子放进黄色篮子里", "83.3%", "33.3%", "-50.0%"],
          ["平均成功率", "64.6%", "42.7%", "-21.9%"],
          ["RMBench (长程)", "20.0%", "0.8%", "-19.2%"],
        ],
      },
    ],
    platform: {
      title: "消融配置摘要",
      caption: "训练工作区保留 baseline 对照、完整配置和关键 memory 参数。",
      href: "/evaluation/training",
      action: "打开训练配置",
      chips: ["Ablation", "Config", "Baseline"],
      image: "/images/thesis/platform-config-summary.png",
    },
    takeaway:
      "门控交叉注意力 稳定胜出的机制是两点：聚合模块承担跨时间整合，后注入避免记忆抢走原有图像语言通道。",
  },
  {
    href: "/conclusion",
    label: "总结",
    shortLabel: "P6",
    eyebrow: "06 / 06",
    title: "结论与局限",
    hook: "本文针对当前 VLA 模型仅单帧输入的记忆缺失问题，实现了基于门控交叉注意力VLM-VLA分层记忆系统，并通过仿真与真机开环实验验证了其在长程任务中的有效性。",
    summary: "",
    highlights: [
      "方法实现：通用的提取-聚合-注入三步走记忆架构（Ch 02）。",
      "实验结果：仿真环境 64.6% 成功率与长程任务性能提升（Ch 04）。",
      "机制分析：后注入原则的稳定性验证与注意力捷径分析（Ch 05）。",
      "平台建设：真机清洗、训练对比与评测回放一体化工具（Ch 01-04）。",
    ],
    media: ["局限性", "平台总览"],
    platform: {
      title: "一体化评测平台",
      caption: "数据查看、训练配置、评测回放、评测启动四个工作区可以现场切换。",
      href: "/evaluation",
      action: "打开评测平台",
      chips: ["数据查看", "训练配置", "评测回放", "评测启动"],
      image: "/images/thesis/platform-overview.png",
    },
    takeaway:
      "研究总结：记忆系统应以解耦通道方式服务于决策，在保证不侵入骨干的前提下提供长程历史支撑。",
  },
];
export const thesisNavItems: ThesisNavItem[] = thesisPages.map((page) => ({
  href: page.href,
  label: page.label,
  shortLabel: page.shortLabel,
  hook: page.hook,
}));

export const thesisLandingNavItems: ThesisNavItem[] = [
  ...thesisNavItems.slice(0, 3),
  {
    href: "/results",
    label: "真机平台与数据清洗工具",
    shortLabel: "Tool",
    hook: "真机 ACONE 数据、清洗链路和迁移性结果已并入主结果与一体化平台入口。",
  },
  ...thesisNavItems.slice(3),
];

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
