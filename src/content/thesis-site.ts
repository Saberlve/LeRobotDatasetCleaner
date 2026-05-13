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
};

export type ThesisBenchmarkSection = {
  name: string;
  kicker: string;
  intro: string[];
  videos: ThesisBenchmarkVideo[];
  videoColumns: 1 | 4;
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
    caption: "四类短程桌面任务上，GCA 以 64.6% 平均成功率建立可信优势。",
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
      "GCA 的关键组合是可学习记忆词元、块级因果聚合和动作专家端后注入。",
  },
  {
    href: "/memory-systems",
    label: "方案对比",
    shortLabel: "P3",
    eyebrow: "03 / 06",
    title: "同一个动机，四种实现：哪种最合理？",
    hook: "四条路径放在同一张结构表里，先看注入位置和耦合风险，再看分数。",
    summary:
      "Cache、Comp、Norm 和 GCA 都在回答同一个问题：历史信息放在哪里最合适。结构对比先排除显存、时延、骨干侵入和注意力竞争等风险，把主结果页的数字放到更清楚的位置。",
    highlights: [
      "Cache 把历史 token 作为前缀带入 VLM，路径直接，但序列长度和训练成本同步上涨。",
      "Comp 把历史压成 N 个词元后进入 VLM 前缀，长度受控，却仍与图像语言共享注意力池。",
      "Norm 用压缩历史调制 LayerNorm 参数，推理轻，但和基座模型内部结构绑定。",
      "GCA 把注入点移到动作专家，记忆通道与图像语言通道并行，骨干保持不动。",
    ],
    media: ["三种融合方式结构对比", "四方案结构表", "关键判断"],
    figures: [
      {
        src: "/images/thesis/cache-context-memory.jpg",
        title: "缓存上下文记忆",
        caption:
          "直接缓存历史上下文 token 并作为前缀带入模型，路径简单，但序列长度和计算成本随历史窗口增长。",
        layout: "portrait",
      },
      {
        src: "/images/thesis/compressed-context-memory.jpg",
        title: "压缩式上下文记忆",
        caption:
          "先将历史压缩为固定数量的记忆词元，再放入上下文前缀，降低长度压力，但仍与图像语言 token 共享注意力池。",
        layout: "portrait",
      },
      {
        src: "/images/thesis/adaptive-normalization.jpg",
        title: "自适应归一化",
        caption:
          "用压缩历史生成归一化参数调制中间特征，推理开销低，但注入点绑定到 VLM 内部结构。",
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
      chips: ["Cache", "Comp", "Norm", "GCA"],
      image: "/images/thesis/platform-baseline.png",
    },
    takeaway:
      "结构层面的关键判断是后注入：不动 VLM 骨干，也不让记忆抢占图像语言通道。",
  },
  {
    href: "/results",
    label: "主结果",
    shortLabel: "P4",
    eyebrow: "04 / 06",
    title: "SimplerEnv 常规四任务 + RMBench 长程记忆任务",
    hook: "常规短程任务不退化，强记忆依赖任务给出 5-10 倍提升。",
    summary:
      "主结果页按两个基准展开：先交代任务，再播放成功 rollout，最后给出表格。ACONE 真机结果只保留迁移性快报，把页面重心留给 SimplerEnv 和 RMBench。",
    highlights: [
      "SimplerEnv WidowX 覆盖抓取、放置、堆叠、入篮四类桌面操作，平均成功率达到 64.6%。",
      "RMBench Swap Blocks 要记住两个方块起点和当前阶段，π-GCA 达到 20.0%，相对 DP / pi0.5 LoRA 提升 5-10 倍。",
      "ACONE 真机数据自采 37 条高质量轨迹，共 34205 帧，平均每回合约 924.5 帧。",
      "真机开环评测中 14 维关节有 12 维 RMSE 低于 0.1，仅夹爪开合维度仍有空间。",
    ],
    media: ["SimplerEnv rollout", "RMBench rollout", "ACONE 迁移快报"],
    benchmarkSections: [
      {
        name: "SimplerEnv WidowX",
        kicker: "① 仿真四任务",
        intro: [
          "在 SAPIEN 物理模拟器下，WidowX 机械臂完成勺子放毛巾、胡萝卜放盘子、绿块叠黄块和茄子入黄篮。",
          "四个任务覆盖抓取、放置、堆叠和入篮，评测指标是完整任务成功率。",
        ],
        videoColumns: 4,
        videos: [
          {
            title: "勺子放毛巾",
            caption: "spoon on towel",
            src: "/video/simpler/spoon.mp4",
            poster:
              "/images/thesis/video_storyboards/simpler_spoon_storyboard.png",
          },
          {
            title: "胡萝卜放盘子",
            caption: "carrot on plate",
            src: "/video/simpler/carrot.mp4",
            poster:
              "/images/thesis/video_storyboards/simpler_carrot_storyboard.png",
          },
          {
            title: "绿块叠黄块",
            caption: "cube stacking",
            src: "/video/simpler/cube.mp4",
            poster:
              "/images/thesis/video_storyboards/simpler_cube_storyboard.png",
          },
          {
            title: "茄子入黄篮",
            caption: "eggplant in basket",
            src: "/video/simpler/eggplant.mp4",
            poster:
              "/images/thesis/video_storyboards/simpler_eggplant_storyboard.png",
          },
        ],
      },
      {
        name: "RMBench 双臂交换方块",
        kicker: "② 长程记忆任务",
        intro: [
          "双臂机器人借助中间格交换两个方块的位置，过程必须保留两个方块的起点和当前流程阶段。",
          "中间格腾出后，模型如果只看当前画面，容易无法选定下一步目标。",
        ],
        videoColumns: 1,
        videos: [
          {
            title: "RMBench 交换方块",
            caption: "完整交换 rollout",
            src: "/video/rmbench/nice.mp4",
            poster:
              "/images/thesis/video_storyboards/rmbench_nice_storyboard.png",
          },
        ],
        table: {
          title: "交换方块成功率对比",
          caption: "GCA 在强记忆依赖任务上给出最直接的收益。",
          columns: ["方法", "成功率", "对比 GCA"],
          rows: [
            ["Diffusion Policy", "2.0%", "10x"],
            ["π0.5-LoRA", "4.0%", "5x"],
            ["本文 π-GCA", "20.0%", ""],
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
      "主结果的证据链是任务介绍、成功 rollout、成绩对比；GCA 在短程任务不退化，在长程记忆任务明显拉开差距。",
  },
  {
    href: "/analysis",
    label: "分析实验",
    shortLabel: "P5",
    eyebrow: "05 / 06",
    title: "消融 + 注意力捷径分析：为什么 GCA 赢？",
    hook: "聚合层决定长程整合能力，注入位置决定是否抢走图像注意力。",
    summary:
      "分数只说明结果，消融和注意力分析解释机制。去掉聚合 Transformer 后，长程任务几乎塌方；Comp 前缀方案会把动作专家的注意力大量引向记忆，形成注意力捷径。",
    highlights: [
      "完整 GCA 在 SimplerEnv 为 64.6%，去掉聚合层后降到 42.7%。",
      "RMBench 从 20.0% 降到 0.8%，说明聚合层承担了跨时间步的信息整理与压缩。",
      "不同融合方式对比中，GCA 在稳定性上优于 Norm，在性能上远超 Cache。",
      "Comp 压缩前缀让记忆占据 89.2% 注意力，形成「注意力捷径」，削弱了对当前观测的感知。",
    ],
    media: ["聚合消融", "注意力分布", "时间步稳定性"],
    benchmarkTables: [
      {
        title: "消融 1：去除记忆聚合模块",
        caption:
          "去掉跨时间聚合后，依赖空间关系和阶段判断的任务（绿块、茄子）下降最剧烈。",
        columns: ["任务", "完整 GCA", "去除聚合模块", "变化"],
        rows: [
          ["勺子放毛巾", "62.5%", "66.7%", "+4.2%"],
          ["胡萝卜放盘子", "50.0%", "58.3%", "+8.3%"],
          ["绿块叠黄块", "62.5%", "12.5%", "-50.0%"],
          ["茄子入黄篮", "83.3%", "33.3%", "-50.0%"],
          ["平均成功率", "64.6%", "42.7%", "-21.9%"],
          ["RMBench (长程)", "20.0%", "0.8%", "-19.2%"],
        ],
      },
      {
        title: "消融 2：不同记忆融合方式对比",
        caption: "在 SimplerEnv 四个任务上的完整成功率（%）对比。",
        columns: ["方法", "勺子", "胡萝卜", "绿块", "茄子", "平均"],
        rows: [
          ["-Cache", "33.3", "33.3", "12.5", "45.8", "31.2"],
          ["-Comp", "66.7", "58.3", "62.5", "58.3", "61.5"],
          ["-Norm", "54.2", "41.7", "45.8", "87.5", "57.3"],
          ["-GCA (本文)", "62.5", "50.0", "62.5", "83.3", "64.6"],
        ],
      },
    ],
    figures: [
      {
        src: "/images/thesis/3-7.png",
        title: "注意力对比图",
        caption:
          "无记忆基线主要关注图像与语言；Comp 加入后，动作专家注意力被记忆前缀截走。",
      },
      {
        src: "/images/thesis/3-8.png",
        title: "注意力随时间步变化",
        caption:
          "Comp 的记忆注意力在多个时间步保持高占比，说明捷径不是单帧偶然现象。",
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
      "GCA 稳定胜出的机制是两点：聚合模块承担跨时间整合，后注入避免记忆抢走原有图像语言通道。",
  },
  {
    href: "/conclusion",
    label: "总结",
    shortLabel: "P6",
    eyebrow: "06 / 06",
    title: "四大贡献 · 一处洞察 · 一套平台",
    hook: "方法、实验、机制分析和工程平台形成完整闭环。",
    summary:
      "本文把 POMDP 压缩、三步走 GCA、连续回合采样、三类评测和一体化平台串到同一条证据链里。最后的结论不是单个模块有效，而是记忆通道应当以解耦方式服务动作决策。",
    highlights: [
      "方法贡献：可学习记忆词元、块级因果聚合和门控交叉注入构成轻量可插拔记忆系统。",
      "实验贡献：SimplerEnv 64.6%、RMBench 20.0%、ACONE 12/14 维误差可控，覆盖仿真和真机。",
      "关键洞察：Comp 的注意力捷径说明记忆不能简单塞进 VLM 前缀，后注入更稳。",
      "工程贡献：数据查看、训练配置、评测回放和本地清洗工具组成一体化研究平台。",
    ],
    media: ["四大贡献", "平台总览", "下一步工作"],
    platform: {
      title: "一体化评测平台",
      caption: "总览、数据查看、训练配置、评测回放四个工作区可以现场切换。",
      href: "/evaluation",
      action: "打开评测平台",
      chips: ["Overview", "Data", "Training", "Replay"],
      image: "/images/thesis/platform-overview.png",
    },
    takeaway: "下一步会走向多模态记忆、小时级长时记忆和更多机器人平台接入。",
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
