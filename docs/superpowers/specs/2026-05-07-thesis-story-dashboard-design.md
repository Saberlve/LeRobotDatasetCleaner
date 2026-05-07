# Thesis Story Dashboard Design

## Goal

Turn LeRobotDatasetCleaner into a thesis-facing visualization experience for the graduate project under `/mnt/d/share/docs/graduate`. The page should explain the project as a story rather than as an experiment-management backend.

The primary audience is a thesis defense viewer: advisor, reviewer, classmate, or visitor who needs to understand what problem the project solves, how the memory method works, what data was collected, how training/evaluation were performed, and what evidence supports the claims.

## Product Shape

Add a thesis dashboard route, tentatively `/thesis`, alongside the existing dataset-cleaning routes. The existing LeRobot dataset viewer remains intact and is reused where it supports the story.

The dashboard follows this narrative:

1. Why VLA models need memory.
2. How the ACONE real-robot dataset was collected and cleaned.
3. How the proposed memory system works.
4. How training was monitored.
5. How the method performs on SimplerEnv and RMBench.
6. What rollout videos show.
7. What the conclusion and limitations are.

This is a presentation surface. It should be readable from top to bottom without requiring the user to configure runs, import logs, or know the file layout.

## Routes

### `/thesis`

Single narrative page with anchored sections and compact navigation:

- Overview
- Memory Motivation
- Dataset Cleaning
- Method Architecture
- Training Curves
- Benchmark Results
- Rollout Videos
- Conclusion

The page may use tabs inside specific sections, but the top-level flow should remain linear.

### Existing Dataset Routes

Existing dataset routes such as `/:org/:dataset/episode_:id` remain the detailed inspection tool. The thesis dashboard can link to a cleaned local dataset episode when the configured dataset path is available.

## Data Contract

Use a local static manifest first. This avoids depending on live W&B, remote benchmark hosts, or fragile filesystem scans during a thesis presentation.

Create a typed project manifest, for example:

```ts
type ThesisProjectManifest = {
  title: string;
  subtitle: string;
  projectRoot: string;
  highlights: Array<{
    label: string;
    value: string;
    caption: string;
  }>;
  dataset: {
    name: string;
    format: string;
    robot: string;
    task: string;
    episodes: number;
    frames: number;
    fps: number;
    averageLength: number;
    cameras: string[];
    actionDimensions: number;
    rawDatasetPath?: string;
    cleanedDatasetPath?: string;
  };
  methods: Array<{
    id: string;
    name: string;
    historySource: string;
    injectionPoint: string;
    summary: string;
    risk?: string;
  }>;
  benchmarks: Array<{
    id: string;
    name: string;
    tasks: string[];
    results: Array<{
      method: string;
      checkpoint?: string;
      taskScores: Record<string, number | null>;
      average?: number;
    }>;
  }>;
  trainingRuns: Array<{
    id: string;
    method: string;
    label: string;
    source: string;
    checkpointStep?: number;
    metrics: string[];
  }>;
  videos: Array<{
    id: string;
    benchmark: string;
    task: string;
    method: string;
    outcome?: "success" | "failure" | "mixed";
    source: string;
    caption: string;
  }>;
  figures: Array<{
    id: string;
    title: string;
    source: string;
    section: string;
  }>;
};
```

The first manifest can be hand-authored from the current thesis files:

- `/mnt/d/share/docs/graduate/data/results/Simpler.md`
- `/mnt/d/share/docs/graduate/data/results/rmbench.md`
- `/mnt/d/share/docs/graduate/paper/chapters/chapter3.md`
- `/mnt/d/share/docs/graduate/paper/chapters/chapter4.md`
- `/mnt/d/share/docs/graduate/paper/figures` and `/mnt/d/share/docs/graduate/figures`

Later iterations can add importers for W&B exports and benchmark logs.

## Page Sections

### Overview

The first viewport states the project plainly:

> Memory-augmented vision-language-action policy for long-horizon robotic manipulation.

Show three metric cards:

- Method: `pi0.5 + Gated Cross-Attention Memory`
- SimplerEnv: average success rate `64.6%`
- RMBench Swap Blocks: `20.0%`, five times the `pi0.5` LoRA baseline in the current result file

Also show a concise contribution list:

- Learnable memory tokens compress current observations.
- A temporal memory aggregator fuses sliding-window history.
- Gated cross-attention injects memory into the action expert.
- The same app supports real-robot dataset cleaning and evidence review.

### Memory Motivation

Use the real ACONE task as the motivating example: pick up the black pouch three times, then touch the green ring.

The section should show key frames or video clips for the repeated stages. The message is that a single image can look similar across repetitions, so the policy needs memory to infer the current stage.

### Dataset Cleaning

Reuse the existing dataset-cleaning strengths:

- cleaned dataset statistics: LeRobot v2.1, ACONE, 37 episodes, 34205 frames, 30 FPS, average 924.5 frames, three camera views, 14 action dimensions
- before/after trajectory-length distribution
- representative episode playback
- links to the existing detailed dataset viewer

This section should present the data-cleaning app as part of the research pipeline, not as a separate tool.

### Method Architecture

Show the method as a small interactive architecture panel:

Current observation and instruction -> memory tokens -> history cache -> memory aggregator -> gated cross-attention -> action expert.

Below it, show a method comparison table:

| Method | History source                   | Injection point               | Role in thesis                         |
| ------ | -------------------------------- | ----------------------------- | -------------------------------------- |
| Cache  | full VLM prefix KV cache         | current VLM prefix            | simple context baseline                |
| Comp   | compressed memory-token KV cache | current VLM prefix            | strong but has attention shortcut risk |
| Norm   | aggregated memory vector         | VLM hidden-state modulation   | adaptive normalization baseline        |
| GCA    | aggregated memory tokens         | action expert cross-attention | proposed method                        |

The design should keep this section visual and scannable. It should avoid becoming a code walkthrough.

### Training Curves

Display W&B-style curves from exported local files. First version supports static JSON/CSV exports instead of live W&B API calls.

Required curves:

- training loss
- learning rate
- selected checkpoint step

Optional curves when present:

- gradient norm
- memory gate value
- validation or evaluation metrics

Users should be able to compare GCA, Norm, Comp, and Cache runs if the exported files exist. Missing runs should render as unavailable, not as a page error.

### Benchmark Results

Provide two benchmark tabs.

SimplerEnv tab:

- Show task-level table and grouped bar chart for Spoon on Towel, Carrot on Plate, Stack Green Block on Yellow Block, Eggplant in Yellow Basket, and Average.
- Include public comparison rows from the thesis result file: RT-1-X, Octo-Base, Octo-Small, OpenVLA, CogACT, SpatialVLA, pi0, pi0-FAST, GR00T N1.5.
- Include memory variants: Cache, Comp, Norm, GCA.
- Highlight GCA average success rate `64.6%`.

RMBench tab:

- Show Swap Blocks success-rate comparison.
- Include DP `2%`, pi0.5 LoRA `4%`, and GCA `20.0%`.
- Make the improvement claim explicit but restrained: current result shows GCA is 5x pi0.5 LoRA and 10x DP on Swap Blocks, while absolute success remains limited.

### Rollout Videos

Show a video evidence wall, optimized for thesis defense.

Controls:

- benchmark selector
- task selector
- method selector
- success/failure selector

Video card metadata:

- benchmark
- task
- method
- checkpoint
- outcome
- short caption

Support side-by-side playback for baseline versus GCA when matching videos exist. The first version can use ordinary HTML video elements and local/static video URLs from the manifest.

### Conclusion

Summarize the evidence:

- GCA achieves the best current SimplerEnv average among implemented memory variants.
- RMBench Swap Blocks shows the strongest memory-specific gain.
- Comp is competitive but carries an attention-shortcut concern because history enters the VLM prefix directly.
- The current RMBench absolute success rate remains low, leaving room for better precision and stage-switching.

## Error Handling

The thesis page must degrade gracefully:

- Missing manifest: show setup instructions and the expected manifest path.
- Missing training curve file: show a disabled run card with the source path.
- Missing video: show metadata and a "video unavailable" placeholder.
- Missing dataset path: keep dataset summary visible and hide deep-link actions.
- Invalid numeric result: omit it from charts and flag it in a small data-quality note.

The defense page should never crash because one artifact is missing.

## Implementation Boundaries

First implementation should include:

- `/thesis` route
- typed local manifest
- overview cards
- narrative section layout
- method comparison table
- static benchmark charts/tables
- static training curve reader for local JSON/CSV exports
- video wall driven by manifest entries
- links back to existing dataset viewer where possible

First implementation should not include:

- live W&B API authentication
- automatic benchmark execution
- automatic checkpoint scanning
- editing thesis markdown files from the web page
- replacing the existing dataset-cleaning workflow

## UI Principles

The visual style should feel like a research presentation interface:

- dense enough to support evidence, but not like a production monitoring dashboard
- Chinese UI text by default, matching the existing translated app
- restrained cards for metrics and repeated video/result items
- clear section anchors for defense navigation
- no marketing landing-page copy
- no decorative visual effects that distract from experiment evidence

## Testing

Unit tests should cover:

- manifest validation and fallback behavior
- benchmark result transformation into chart/table rows
- W&B export parsing for representative JSON and CSV files
- video manifest filtering

Component tests should cover:

- rendering with a complete manifest
- rendering with missing training files
- rendering with missing videos
- rendering benchmark tabs and highlighted GCA results

Manual verification should include:

- desktop and mobile layout checks
- opening `/thesis`
- navigating section anchors
- playing at least one local/static video
- confirming existing dataset routes still work
