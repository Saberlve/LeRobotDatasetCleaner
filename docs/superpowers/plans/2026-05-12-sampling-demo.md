# Sampling Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone HTML animation prototype at `public/sampling-demo.html` that compares fixed-window sampling and continuous-episode sampling.

**Architecture:** The prototype is a single static HTML document with embedded CSS and JavaScript. The JavaScript owns one explicit step-based state machine, while CSS handles presentation, responsive layout, and small state transitions. No Next.js route, package dependency, or generated asset is required.

**Tech Stack:** HTML, CSS, vanilla JavaScript, existing repository static serving through `public/`.

---

### Task 1: Add Static Demo Structure

**Files:**
- Create: `public/sampling-demo.html`

- [ ] **Step 1: Write the initial HTML skeleton**

Create `public/sampling-demo.html` with this structure:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>两种回合采样方式对比</title>
  </head>
  <body>
    <main class="page-shell">
      <header class="demo-header">
        <p class="eyebrow">Episode Sampling Demo</p>
        <h1>两种回合采样方式对比</h1>
        <p class="summary">
          固定窗口采样只抽取一次历史片段；连续回合采样会随着时间推进持续生成训练样本。
        </p>
      </header>

      <section class="control-bar" aria-label="动画控制">
        <div class="button-row">
          <button id="playButton" type="button">播放动画</button>
          <button id="pauseButton" type="button">暂停</button>
          <button id="resetButton" type="button">重置</button>
        </div>
        <fieldset class="speed-control">
          <legend>播放速度</legend>
          <label><input type="radio" name="speed" value="slow" /> 慢</label>
          <label><input type="radio" name="speed" value="normal" checked /> 中</label>
          <label><input type="radio" name="speed" value="fast" /> 快</label>
        </fieldset>
      </section>

      <p id="statusText" class="status-line" aria-live="polite">
        当前步骤：等待播放。
      </p>

      <section class="comparison-stack" aria-label="采样方式对比">
        <article class="sampling-panel fixed-panel" aria-labelledby="fixedTitle">
          <aside class="side-label blue">固定窗口采样</aside>
          <div class="panel-content">
            <div class="panel-heading">
              <h2 id="fixedTitle">固定窗口采样</h2>
              <p>只截取一次固定长度历史窗口，窗口外帧不参与训练。</p>
            </div>
            <div class="track-wrap">
              <div class="timeline-row">
                <span>回合开始</span>
                <div class="timeline-line" aria-hidden="true"></div>
                <span>回合结束</span>
              </div>
              <div id="fixedFrames" class="frame-track" aria-label="固定窗口原始帧序列"></div>
              <div id="fixedWindow" class="selection-window fixed-window" aria-hidden="true"></div>
              <div id="fixedOutside" class="outside-callout">窗口外帧不参与</div>
            </div>
            <div class="samples-area">
              <span class="samples-label">训练样本</span>
              <div id="fixedSamples" class="sample-row"></div>
            </div>
          </div>
        </article>

        <article class="sampling-panel continuous-panel" aria-labelledby="continuousTitle">
          <aside class="side-label green">连续回合采样</aside>
          <div class="panel-content">
            <div class="panel-heading">
              <h2 id="continuousTitle">连续回合采样</h2>
              <p>每一帧到来都生成训练样本，满窗口后滑动并移除最早帧。</p>
            </div>
            <div class="track-wrap">
              <div class="timeline-row">
                <span>回合开始</span>
                <div class="timeline-line" aria-hidden="true"></div>
                <span>回合结束</span>
              </div>
              <div id="continuousFrames" class="frame-track" aria-label="连续回合原始帧序列"></div>
              <div id="slidingWindow" class="selection-window sliding-window" aria-hidden="true"></div>
              <div id="removeCallout" class="remove-callout">移除第一帧</div>
            </div>
            <div class="samples-area">
              <span class="samples-label">训练样本</span>
              <div id="continuousSamples" class="sample-grid"></div>
            </div>
          </div>
        </article>
      </section>

      <section id="summaryCard" class="summary-card" aria-label="最终对比总结">
        <div>
          <strong>固定窗口采样</strong>
          <span>只生成一个固定长度历史窗口样本，窗口外帧不参与。</span>
        </div>
        <div>
          <strong>连续回合采样</strong>
          <span>每一帧到来都生成训练样本，窗口满后滑动更新。</span>
        </div>
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Verify the file exists**

Run: `test -f public/sampling-demo.html`

Expected: command exits with status 0.

### Task 2: Add Visual Design And Responsive Layout

**Files:**
- Modify: `public/sampling-demo.html`

- [ ] **Step 1: Add embedded CSS in `<head>`**

Add a `<style>` block that defines:

```css
:root {
  --canvas: oklch(96.5% 0.018 75);
  --surface: oklch(98.3% 0.013 75);
  --surface-strong: oklch(99% 0.01 80);
  --ink: oklch(24% 0.025 55);
  --muted: oklch(50% 0.028 60);
  --line: oklch(84% 0.025 70);
  --blue: oklch(50% 0.13 252);
  --blue-soft: oklch(88% 0.055 250);
  --green: oklch(47% 0.12 145);
  --green-soft: oklch(89% 0.06 145);
  --orange: oklch(65% 0.16 55);
  --orange-soft: oklch(89% 0.07 55);
  --shadow: 0 18px 45px oklch(40% 0.04 65 / 0.11);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", sans-serif;
}

.page-shell {
  width: min(1280px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 30px 0 48px;
}

.demo-header {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0;
  color: var(--orange);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  font-size: 2rem;
  line-height: 1.2;
}

.summary {
  max-width: 72ch;
  color: var(--muted);
  line-height: 1.7;
}

.control-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin: 20px 0 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: oklch(97% 0.016 75 / 0.92);
  backdrop-filter: blur(16px);
}

.button-row,
.speed-control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

button,
.speed-control label {
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-strong);
  color: var(--ink);
  font: inherit;
  font-size: 0.9rem;
}

button {
  padding: 0 15px;
  cursor: pointer;
}

button:hover,
.speed-control label:hover {
  border-color: var(--orange);
}

button:focus-visible,
input:focus-visible + span,
.speed-control label:focus-within {
  outline: 3px solid oklch(75% 0.12 252 / 0.35);
  outline-offset: 2px;
}

.speed-control {
  margin: 0;
  padding: 0;
  border: 0;
}

.speed-control legend {
  margin-right: 4px;
  color: var(--muted);
  font-size: 0.86rem;
}

.speed-control label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  cursor: pointer;
}

.status-line {
  min-height: 44px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  line-height: 1.4;
}

.comparison-stack {
  display: grid;
  gap: 18px;
}

.sampling-panel {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.side-label {
  display: grid;
  place-items: center;
  padding: 18px;
  color: oklch(98% 0.01 80);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  writing-mode: vertical-rl;
  letter-spacing: 0;
}

.side-label.blue {
  background: var(--blue);
}

.side-label.green {
  background: var(--green);
}

.panel-content {
  display: grid;
  gap: 18px;
  padding: 22px;
}

.panel-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.panel-heading h2 {
  font-size: 1.35rem;
}

.panel-heading p {
  max-width: 58ch;
  color: var(--muted);
  line-height: 1.6;
}

.track-wrap {
  position: relative;
  min-width: 860px;
  padding: 4px 12px 36px;
}

.timeline-row {
  display: grid;
  grid-template-columns: max-content 1fr max-content;
  align-items: center;
  gap: 12px;
  color: var(--ink);
  font-weight: 600;
}

.timeline-line {
  position: relative;
  height: 2px;
  background: var(--ink);
}

.timeline-line::after {
  position: absolute;
  right: -1px;
  top: 50%;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 11px solid var(--ink);
  content: "";
  transform: translateY(-50%);
}

.frame-track {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-top: 18px;
}

.frame-card {
  position: relative;
  min-height: 116px;
  overflow: hidden;
  border: 1px solid oklch(78% 0.032 70);
  border-radius: 10px;
  background:
    radial-gradient(circle at 38% 62%, oklch(78% 0.1 95) 0 5px, transparent 6px),
    linear-gradient(160deg, oklch(79% 0.07 180), oklch(50% 0.08 180) 62%, oklch(36% 0.05 180));
  opacity: 0.24;
  transform: translateY(8px);
  transition:
    opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 180ms ease,
    filter 180ms ease;
}

.frame-card::before {
  position: absolute;
  inset: 0 0 auto;
  height: 24%;
  background: linear-gradient(90deg, oklch(92% 0.02 75), oklch(76% 0.035 25));
  content: "";
}

.frame-card::after {
  position: absolute;
  right: 12px;
  bottom: 16px;
  width: 18px;
  height: 64px;
  border-radius: 9px;
  background: oklch(23% 0.025 250 / 0.78);
  box-shadow: -18px -12px 0 oklch(18% 0.03 250 / 0.58);
  content: "";
}

.frame-label {
  position: absolute;
  left: 10px;
  top: 8px;
  z-index: 2;
  display: inline-flex;
  min-width: 32px;
  justify-content: center;
  border-radius: 999px;
  background: oklch(98% 0.012 80 / 0.88);
  color: var(--ink);
  font-weight: 800;
  font-style: italic;
}

.frame-card.visible {
  opacity: 1;
  transform: translateY(0);
}

.frame-card.outside,
.frame-card.removed {
  border-color: var(--orange);
  filter: saturate(0.78);
}

.frame-card.removed {
  opacity: 0.42;
  transform: translateY(18px);
}

.selection-window {
  position: absolute;
  top: 90px;
  height: 138px;
  border: 2px dashed var(--blue);
  border-radius: 14px;
  background: var(--blue-soft);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 200ms ease,
    left 260ms cubic-bezier(0.22, 1, 0.36, 1),
    width 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.selection-window.active {
  opacity: 0.38;
}

.fixed-window {
  left: 12px;
  width: calc((100% - 24px - 64px) * 0.8 + 48px);
}

.sliding-window {
  border-color: var(--green);
  background: var(--green-soft);
}

.sliding-window.size-1 {
  left: 12px;
  width: calc((100% - 24px - 64px) * 0.2);
}

.sliding-window.size-2 {
  left: 12px;
  width: calc((100% - 24px - 64px) * 0.4 + 16px);
}

.sliding-window.size-3 {
  left: 12px;
  width: calc((100% - 24px - 64px) * 0.6 + 32px);
}

.sliding-window.size-4 {
  left: 12px;
  width: calc((100% - 24px - 64px) * 0.8 + 48px);
}

.sliding-window.shifted {
  left: calc(12px + ((100% - 24px - 64px) * 0.2 + 16px));
}

.outside-callout,
.remove-callout {
  position: absolute;
  right: 12px;
  bottom: 0;
  display: none;
  border: 2px dashed var(--orange);
  border-radius: 10px;
  background: var(--orange-soft);
  padding: 7px 12px;
  color: oklch(38% 0.1 50);
  font-weight: 800;
}

.remove-callout {
  left: 12px;
  right: auto;
}

.outside-callout.active,
.remove-callout.active {
  display: block;
}

.samples-area {
  display: grid;
  grid-template-columns: max-content 1fr;
  align-items: start;
  gap: 14px;
  overflow-x: auto;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: oklch(96.8% 0.018 78);
}

.samples-label {
  color: var(--muted);
  font-weight: 700;
}

.sample-row,
.sample-grid {
  display: flex;
  flex-wrap: nowrap;
  gap: 10px;
  min-height: 50px;
}

.sample-pill {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-strong);
  padding: 0 12px;
  color: var(--ink);
  font-weight: 750;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 180ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sample-pill.visible {
  opacity: 1;
  transform: translateY(0);
}

.sample-pill.fixed {
  border-color: var(--blue);
  background: var(--blue-soft);
}

.sample-pill.continuous {
  border-color: var(--green);
  background: var(--green-soft);
}

.sample-pill.final {
  border-color: var(--orange);
  box-shadow: inset 0 -3px 0 var(--orange);
}

.summary-card {
  display: none;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-strong);
}

.summary-card.active {
  display: grid;
}

.summary-card div {
  display: grid;
  gap: 6px;
}

.summary-card strong {
  color: var(--ink);
}

.summary-card span {
  color: var(--muted);
  line-height: 1.55;
}

@media (max-width: 760px) {
  .page-shell {
    width: min(100vw - 20px, 720px);
    padding-top: 18px;
  }

  h1 {
    font-size: 1.55rem;
  }

  .sampling-panel {
    grid-template-columns: 1fr;
  }

  .side-label {
    min-height: 54px;
    writing-mode: horizontal-tb;
  }

  .panel-content {
    padding: 16px;
  }

  .track-wrap {
    overflow-x: auto;
  }

  .summary-card {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
    animation-duration: 1ms !important;
  }
}
```

- [ ] **Step 2: Verify key CSS hooks are present**

Run: `rg -n "selection-window|sample-pill|prefers-reduced-motion|oklch" public/sampling-demo.html`

Expected: matches for all four terms.

### Task 3: Add Animation State Machine

**Files:**
- Modify: `public/sampling-demo.html`

- [ ] **Step 1: Add embedded JavaScript before `</body>`**

Add this script:

```html
<script>
  const frames = ["f1", "f2", "f3", "f4", "f5"];
  const windowSize = 4;
  const speeds = {
    slow: 1600,
    normal: 1050,
    fast: 620,
  };

  const fixedFramesEl = document.querySelector("#fixedFrames");
  const continuousFramesEl = document.querySelector("#continuousFrames");
  const fixedSamplesEl = document.querySelector("#fixedSamples");
  const continuousSamplesEl = document.querySelector("#continuousSamples");
  const fixedWindowEl = document.querySelector("#fixedWindow");
  const fixedOutsideEl = document.querySelector("#fixedOutside");
  const slidingWindowEl = document.querySelector("#slidingWindow");
  const removeCalloutEl = document.querySelector("#removeCallout");
  const summaryCardEl = document.querySelector("#summaryCard");
  const statusTextEl = document.querySelector("#statusText");
  const playButton = document.querySelector("#playButton");
  const pauseButton = document.querySelector("#pauseButton");
  const resetButton = document.querySelector("#resetButton");
  const speedInputs = [...document.querySelectorAll("input[name='speed']")];

  let currentStep = 0;
  let timer = null;
  let isPlaying = false;
  let speed = speeds.normal;

  const steps = [
    {
      status: "当前步骤：时间轴就绪，准备对比两种回合采样方式。",
      fixedVisible: 0,
      continuousVisible: 0,
      fixedSample: false,
      continuousSamples: 0,
      fixedWindow: false,
      fixedOutside: false,
      slidingSize: 0,
      shifted: false,
      removed: false,
      summary: false,
    },
    {
      status: "当前步骤：固定窗口采样读取 f1 到 f4，准备抽取固定长度历史窗口。",
      fixedVisible: 4,
      continuousVisible: 0,
      fixedSample: false,
      continuousSamples: 0,
      fixedWindow: true,
      fixedOutside: false,
      slidingSize: 0,
      shifted: false,
      removed: false,
      summary: false,
    },
    {
      status: "当前步骤：固定窗口采样抽取 [f1, f2, f3, f4]，训练样本只生成一次。",
      fixedVisible: 4,
      continuousVisible: 0,
      fixedSample: true,
      continuousSamples: 0,
      fixedWindow: true,
      fixedOutside: false,
      slidingSize: 0,
      shifted: false,
      removed: false,
      summary: false,
    },
    {
      status: "当前步骤：f5 到达，但它位于固定窗口外，不参与这次训练样本。",
      fixedVisible: 5,
      continuousVisible: 0,
      fixedSample: true,
      continuousSamples: 0,
      fixedWindow: true,
      fixedOutside: true,
      slidingSize: 0,
      shifted: false,
      removed: false,
      summary: false,
    },
    {
      status: "当前步骤：连续回合采样接收 f1，生成样本 [f1]。",
      fixedVisible: 5,
      continuousVisible: 1,
      fixedSample: true,
      continuousSamples: 1,
      fixedWindow: true,
      fixedOutside: true,
      slidingSize: 1,
      shifted: false,
      removed: false,
      summary: false,
    },
    {
      status: "当前步骤：f2 到达，连续回合采样生成 [f1, f2]。",
      fixedVisible: 5,
      continuousVisible: 2,
      fixedSample: true,
      continuousSamples: 2,
      fixedWindow: true,
      fixedOutside: true,
      slidingSize: 2,
      shifted: false,
      removed: false,
      summary: false,
    },
    {
      status: "当前步骤：f3 到达，连续回合采样生成 [f1, f2, f3]。",
      fixedVisible: 5,
      continuousVisible: 3,
      fixedSample: true,
      continuousSamples: 3,
      fixedWindow: true,
      fixedOutside: true,
      slidingSize: 3,
      shifted: false,
      removed: false,
      summary: false,
    },
    {
      status: "当前步骤：f4 到达，窗口达到最大长度，生成 [f1, f2, f3, f4]。",
      fixedVisible: 5,
      continuousVisible: 4,
      fixedSample: true,
      continuousSamples: 4,
      fixedWindow: true,
      fixedOutside: true,
      slidingSize: 4,
      shifted: false,
      removed: false,
      summary: false,
    },
    {
      status: "当前步骤：f5 到达，连续回合采样移除 f1，生成 [f2, f3, f4, f5]。",
      fixedVisible: 5,
      continuousVisible: 5,
      fixedSample: true,
      continuousSamples: 5,
      fixedWindow: true,
      fixedOutside: true,
      slidingSize: 4,
      shifted: true,
      removed: true,
      summary: false,
    },
    {
      status: "当前步骤：对比完成。固定窗口只抽一次；连续回合每一步生成样本并滑动更新。",
      fixedVisible: 5,
      continuousVisible: 5,
      fixedSample: true,
      continuousSamples: 5,
      fixedWindow: true,
      fixedOutside: true,
      slidingSize: 4,
      shifted: true,
      removed: true,
      summary: true,
    },
  ];

  function createFrame(label, index) {
    const card = document.createElement("div");
    card.className = "frame-card";
    card.dataset.index = String(index);
    card.innerHTML = `<span class="frame-label">${label}</span>`;
    return card;
  }

  function createSample(labels, kind, isFinal = false) {
    const sample = document.createElement("span");
    sample.className = `sample-pill ${kind}${isFinal ? " final" : ""}`;
    sample.textContent = `[${labels.join(", ")}]`;
    requestAnimationFrame(() => sample.classList.add("visible"));
    return sample;
  }

  function renderStaticFrames() {
    fixedFramesEl.replaceChildren(...frames.map(createFrame));
    continuousFramesEl.replaceChildren(...frames.map(createFrame));
  }

  function buildContinuousSample(index) {
    const end = index + 1;
    const start = Math.max(0, end - windowSize);
    return frames.slice(start, end);
  }

  function setFrameVisibility(container, visibleCount, removedFirst) {
    [...container.children].forEach((card, index) => {
      card.classList.toggle("visible", index < visibleCount);
      card.classList.toggle("outside", container === fixedFramesEl && index === 4 && visibleCount === 5);
      card.classList.toggle("removed", removedFirst && index === 0);
    });
  }

  function renderSamples(step) {
    fixedSamplesEl.replaceChildren();
    if (step.fixedSample) {
      fixedSamplesEl.append(createSample(frames.slice(0, windowSize), "fixed"));
    }

    continuousSamplesEl.replaceChildren();
    for (let index = 0; index < step.continuousSamples; index += 1) {
      continuousSamplesEl.append(
        createSample(buildContinuousSample(index), "continuous", index === 4),
      );
    }
  }

  function renderStep(index) {
    const step = steps[index];
    currentStep = index;
    statusTextEl.textContent = step.status;
    setFrameVisibility(fixedFramesEl, step.fixedVisible, false);
    setFrameVisibility(continuousFramesEl, step.continuousVisible, step.removed);
    fixedWindowEl.classList.toggle("active", step.fixedWindow);
    fixedOutsideEl.classList.toggle("active", step.fixedOutside);
    removeCalloutEl.classList.toggle("active", step.removed);
    summaryCardEl.classList.toggle("active", step.summary);

    slidingWindowEl.className = "selection-window sliding-window";
    if (step.slidingSize > 0) {
      slidingWindowEl.classList.add("active", `size-${step.slidingSize}`);
    }
    if (step.shifted) {
      slidingWindowEl.classList.add("shifted");
    }

    renderSamples(step);
  }

  function stopPlayback() {
    window.clearTimeout(timer);
    timer = null;
    isPlaying = false;
  }

  function queueNextStep() {
    window.clearTimeout(timer);
    if (!isPlaying) return;
    timer = window.setTimeout(() => {
      if (currentStep >= steps.length - 1) {
        stopPlayback();
        return;
      }
      renderStep(currentStep + 1);
      queueNextStep();
    }, speed);
  }

  function play() {
    if (isPlaying) return;
    if (currentStep >= steps.length - 1) {
      renderStep(0);
    }
    isPlaying = true;
    queueNextStep();
  }

  function pause() {
    stopPlayback();
  }

  function reset() {
    stopPlayback();
    renderStep(0);
  }

  playButton.addEventListener("click", play);
  pauseButton.addEventListener("click", pause);
  resetButton.addEventListener("click", reset);

  speedInputs.forEach((input) => {
    input.addEventListener("change", (event) => {
      speed = speeds[event.target.value] ?? speeds.normal;
      if (isPlaying) {
        queueNextStep();
      }
    });
  });

  renderStaticFrames();
  renderStep(0);
</script>
```

- [ ] **Step 2: Verify JavaScript parses**

Run: `node --check public/sampling-demo.html`

Expected: FAIL because `node --check` cannot parse a full HTML document. This verifies that direct Node syntax checking is not applicable to this artifact.

- [ ] **Step 3: Extract and syntax-check embedded script**

Run: `node -e "const fs=require('fs'); const html=fs.readFileSync('public/sampling-demo.html','utf8'); const js=html.match(/<script>([\\s\\S]*)<\\/script>/)[1]; new Function(js); console.log('embedded script parses');"`

Expected: prints `embedded script parses`.

### Task 4: Verify Behavior Hooks And Repository Health

**Files:**
- Verify: `public/sampling-demo.html`

- [ ] **Step 1: Verify required copy and state labels**

Run: `rg -n "固定窗口采样|连续回合采样|窗口外帧不参与|移除第一帧|\\[f2, f3, f4, f5\\]" public/sampling-demo.html`

Expected: matches for every phrase.

- [ ] **Step 2: Verify there are exactly five logical frames**

Run: `rg -n 'const frames = \\["f1", "f2", "f3", "f4", "f5"\\]' public/sampling-demo.html`

Expected: one match.

- [ ] **Step 3: Run optional TypeScript verification**

Run: `npm run type-check`

Expected: command exits with status 0. If it fails because of unrelated existing work, record the failing output and do not claim repository-wide type-check success.

- [ ] **Step 4: Review final diff**

Run: `git diff -- public/sampling-demo.html`

Expected: diff only adds the standalone HTML demo.
