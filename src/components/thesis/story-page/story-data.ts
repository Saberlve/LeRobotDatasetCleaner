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
  notes: string[];
};

export const methodStages = [
  {
    title: "从当前观测提取信息",
    detail:
      "输入序列末尾添加 N 个可学习的词元，通过 VLM 的因果注意力机制，将当前观测信息写入固定长度的记忆词元。",
  },
  {
    title: "历史信息的时序聚合",
    detail:
      "双层 Transformer 对历史的记忆词元进行时序聚合，采用块级因果注意力，进一步抽象历史信息。",
  },
  {
    title: "历史信息的注入",
    detail:
      "通过门控交叉注意力，将压缩后的历史信息注入动作专家，生成记忆增强后的动作。",
  },
];

export const systemRows = [
  ["注入位置", "VLM 前缀", "VLM 前缀", "VLM 内部 LayerNorm", "动作专家"],
  ["记忆形式", "历史 token", "压缩 N 词元", "压缩后生成 γβ", "压缩 N 词元"],
  ["序列长度", "显著增长", "固定 N", "不变", "不变"],
  ["训练成本", "高", "中", "低", "低"],
  ["改 VLM 骨干", "否", "否", "是", "否"],
  ["与图像通道", "同池竞争", "同池竞争", "改归一化", "独立并行"],
  ["捷径风险", "中", "高", "低", "低"],
];

export const memorySystemDiagrams: MemorySystemDiagram[] = [
  {
    title: "缓存上下文记忆",
    badge: "Cache",
    caption:
      "历史 moment token 的 KV 状态直接接到下一步 VLM 前缀里，路径最短，但上下文随窗口变长。",
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
    notes: ["历史以 prefix cache 形式保留", "序列长度随缓存窗口增长"],
  },
  {
    title: "压缩式上下文记忆",
    badge: "Comp",
    caption:
      "先抽取每步 moment tokens，再用轻量 MemoryModule 聚合成固定数量 Memory Tokens。",
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
    notes: [
      "长度固定，训练成本低于直接缓存",
      "仍容易与图像语言 token 同池竞争",
    ],
  },
  {
    title: "自适应归一化",
    badge: "Norm",
    caption:
      "记忆不作为额外上下文参与竞争，而是转成调制向量，改变模型内部层的归一化输出。",
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
    notes: ["推理序列长度不增加", "注入点绑定到底层 Gemma 层结构"],
  },
  {
    title: "门控交叉注意力",
    badge: "GCA",
    caption:
      "动作专家隐藏状态查询压缩记忆，再用小门控残差注入，让记忆通道与 VLM 主路径解耦。",
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
    notes: ["不改 VLM 主干输入通道", "后注入降低注意力捷径风险"],
  },
];

export const contributionRows = [
  ["方法", "POMDP 压缩 + 三步走 GCA", "Ch2"],
  ["实验", "SimplerEnv 64.6% / RMBench 20.0%", "Ch3.1-3.3"],
  ["洞察", "注意力捷径现象 + 后注入原则", "Ch3.4"],
  ["工程", "数据、训练、评测一体化平台", "Ch4"],
];

export const nextSteps = [
  "多模态记忆：视觉、触觉和语言联合压缩。",
  "长时记忆：面向小时级 episode 的分层压缩。",
  "平台扩展：接入更多机器人机型与评测基准。",
];
