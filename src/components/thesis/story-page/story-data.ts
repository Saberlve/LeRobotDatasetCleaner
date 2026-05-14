export type MemoryDiagramStep = {
  label: string;
  detail: string;
  tone: string;
  tokens?: string[];
};

export type MemorySystemDiagram = {
  title: string;
  badge: string;
  caption: string;
  steps: MemoryDiagramStep[];
};

export const methodStages = [
  {
    title: "从当前观测提取信息",
    detail:
      "在输入序列末尾插入 N 个可学习向量，经 VLM 前向计算后，取这些位置对应的输出特征作为当前帧的压缩记忆表示。",
  },
  {
    title: "历史信息的时序聚合",
    detail:
      "缓存的各帧记忆特征拼接为历史矩阵，经双层 Transformer 和块级因果注意力进行跨时刻聚合，输出固定长度的历史记忆表示。",
  },
  {
    title: "历史信息的注入",
    detail:
      "聚合后的历史记忆表示作为键和值，动作专家的隐藏状态作为查询，通过门控交叉注意力注入动作生成过程。",
  },
];

export const systemRows = [
  ["注入位置", "VLM的视觉/语言表示", "VLM的视觉/语言表示", "动作专家每一层的前馈网络之前", "动作专家"],
  ["记忆形式", "记忆词元的键值", "压缩后的记忆词元", "经MLP后生成的平移缩放系数", "压缩后的记忆词元"],
];

export const memorySystemDiagrams: MemorySystemDiagram[] = [
  {
    title: "缓存上下文记忆",
    badge: "Cache",
    caption: "历史帧的键值缓存直接拼入当前帧的 VLM的视觉/语言表示，但没有进行时序聚合，",
    steps: [
      {
        label: "当前观测",
        detail: "图像 + 语言输入",
        tone: "bg-[#dfeff1]",
        tokens: ["Frame t", "Prompt"],
      },
      {
        label: "VLM Prefix",
        detail: "生成 moment block",
        tone: "bg-[#9fcad2]",
        tokens: ["m1", "m2", "m3", "m4"],
      },
      {
        label: "KV Cache",
        detail: "HistoryCache 滚动保存",
        tone: "bg-[#fff7be]",
        tokens: ["K/V", "K/V", "K/V"],
      },
      {
        label: "动作专家",
        detail: "读取扩展前缀",
        tone: "bg-[#dbe9d5]",
        tokens: ["a_t"],
      },
    ],
  },
  {
    title: "压缩式上下文记忆",
    badge: "Comp",
    caption:
      "每帧提取记忆词元输出，经记忆模块聚合成固定数量的记忆表示，但是直接拼接到 VLM 嵌入后",
    steps: [
      {
        label: "Moment Tokens",
        detail: "每帧末尾学习词元",
        tone: "bg-[#dfeff1]",
        tokens: ["m_t-3", "m_t-2", "m_t-1", "m_t"],
      },
      {
        label: "History Matrix",
        detail: "T x N 拼接",
        tone: "bg-[#f1e5d8]",
        tokens: ["T", "N"],
      },
      {
        label: "MemoryModule",
        detail: "块级因果聚合",
        tone: "bg-[#fff7be]",
        tokens: ["RMS", "Attn", "MLP"],
      },
      {
        label: "Memory Tokens",
        detail: "固定 N 个压缩词元",
        tone: "bg-[#dbe9d5]",
        tokens: ["M1", "M2", "M3", "M4"],
      },
    ],
  },
  {
    title: "自适应层归一化",
    badge: "Norm",
    caption:
      "记忆表示不进入输入序列，而是映射为调制向量，通过改变层归一化的输出来影响动作生成。",
    steps: [
      {
        label: "Memory Tokens",
        detail: "历史压缩表示",
        tone: "bg-[#dfeff1]",
        tokens: ["M1", "M2", "M3", "M4"],
      },
      {
        label: "Memory Attn",
        detail: "得到 modulation",
        tone: "bg-[#fff7be]",
        tokens: ["q", "k", "v"],
      },
      {
        label: "Adaptive Norm",
        detail: "生成 scale / shift",
        tone: "bg-[#f3d8c7]",
        tokens: ["γ", "β"],
      },
      {
        label: "模型内部层",
        detail: "调制 hidden states",
        tone: "bg-[#dbe9d5]",
        tokens: ["LayerNorm"],
      },
    ],
  },
  {
    title: "门控交叉注意力",
    badge: "门控交叉注意力",
    caption: "以动作的隐藏状态查询压缩后的历史记忆，通过门控残差注入。",
    steps: [
      {
        label: "HistoryCache",
        detail: "按 episode / stride 取历史",
        tone: "bg-[#dfeff1]",
        tokens: ["t-3k", "t-2k", "t-k"],
      },
      {
        label: "MemoryModule",
        detail: "块级因果 Transformer",
        tone: "bg-[#fff7be]",
        tokens: ["RoPE", "KV", "Mask"],
      },
      {
        label: "Gated Cross Attention",
        detail: "动作专家查询记忆",
        tone: "bg-[#f3d8c7]",
        tokens: ["Q_action", "K_mem", "V_mem"],
      },
      {
        label: "动作专家",
        detail: "gate * memory residual",
        tone: "bg-[#dbe9d5]",
        tokens: ["a_t"],
      },
    ],
  },
];

export const contributionRows = [
  [
    "方法实现",
    "实现了由可学习记忆词元、块级因果聚合模块与门控交叉注意力组成的通用记忆通道。",
  ],
  [
    "实验结果",
    "在 SimplerEnv 建立 64.6% 成功率基准，在 RMBench 交换方块长程任务中取得 20.0% 成功率。",
  ],
  [
    "机制发现",
    "通过对比实验确认了压缩式上下文记忆的注意力捷径问题，并验证了后注入架构对决策路径的稳定性。",
  ],
  [
    "平台支撑",
    "完成了集数据清洗、训练配置与评测回放于一体的本地化研究平台建设。",
  ],
];

export const nextSteps = [
  "多模态记忆融合：支持视觉、触觉与力觉的多源异构传感器时序记忆整合。",
  "超长程任务演进：研究面向小时级作业任务的分层压缩与检索增强记忆 (RAG-VLA)。",
  "跨平台迁移泛化：将通用记忆模块部署至更多机型，验证在大规模 VLM 骨干下的扩展性。",
];

export const limitations = [
  "任务覆盖仍以桌面操作和交换方块为主，复杂开放场景与更长任务链条还需要继续扩展。",
  "记忆窗口长度仍受显存与推理时延限制，小时级任务需要分层压缩或检索增强机制。",
  "真机部分当前以数据清洗、训练对比和开环评测为主，闭环部署与跨机型泛化仍需进一步验证。",
  "现阶段记忆主要围绕视觉历史展开，触觉、力觉等多模态时序信息尚未充分纳入统一记忆表示。",
];
