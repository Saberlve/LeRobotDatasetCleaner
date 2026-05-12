# Sampling Demo Design

## Goal

Build a standalone single-file HTML prototype that demonstrates two episode sampling strategies in a way a thesis or defense audience can understand at a glance:

- Fixed window sampling extracts one fixed-length history window once. Frames outside that window do not participate in training.
- Continuous episode sampling generates a training sample as each frame arrives. The window grows until full, then slides forward by removing the earliest frame.

The prototype will live at `public/sampling-demo.html` and should work without a build step.

## Audience And Context

The demo is for robotics researchers, VLA/VLM policy engineers, thesis readers, and presentation audiences. It should feel like a precise research visualization rather than a promotional page. The visual tone follows the product context: warm off-white canvas, ink-brown text, restrained controls, and state colors used only to explain sampling behavior.

## Layout

The page has a compact title area, a sticky control bar, a status line, then two stacked comparison panels.

The fixed-window panel contains:

- A left vertical label, `固定窗口采样`, in blue.
- A timeline from `回合开始` to `回合结束`.
- Five frame slots labeled `f1` through `f5`.
- A blue dashed selection window around `f1` to `f4`.
- An orange dashed treatment on `f5` with `窗口外帧不参与`.
- One training sample row showing `[f1, f2, f3, f4]`.

The continuous-episode panel contains:

- A left vertical label, `连续回合采样`, in green.
- The same timeline and five frame slots.
- A generated sample after each arriving frame: `[f1]`, `[f1, f2]`, `[f1, f2, f3]`, `[f1, f2, f3, f4]`, `[f2, f3, f4, f5]`.
- On `f5`, an orange removal indicator marks `f1` leaving the full window.

On smaller screens, the panels remain vertically stacked and the timeline content can scroll horizontally inside each panel instead of compressing text into unreadable sizes.

## Animation Model

The data model is fixed for the prototype:

```js
const frames = ["f1", "f2", "f3", "f4", "f5"];
const windowSize = 4;
```

The animation is step-based, not free-running canvas animation. Each step sets an explicit state for visible frames, selected windows, samples, and status text. This makes play, pause, reset, and speed changes predictable.

Default sequence:

1. Show title, controls, and both timelines.
2. Reveal fixed-window frames `f1` to `f4`.
3. Highlight the fixed history window and copy it into the training sample row.
4. Reveal `f5`, mark it as outside the fixed window.
5. Reveal continuous frames one by one.
6. Generate one sample per continuous frame arrival.
7. When `f5` arrives, show `f1` moving out and the final sample `[f2, f3, f4, f5]`.
8. Show a final concise comparison summary.

Motion should be brief and state-driven: frame arrival fades and rises into place, windows flash once, sample rows slide in slightly, and removed frame state fades downward. No decorative page-load choreography.

## Controls

The control bar includes:

- `播放动画`
- `暂停`
- `重置`
- Speed segmented control: `慢`, `中`, `快`

The status line updates at each step, for example:

- `当前步骤：固定窗口采样抽取 [f1, f2, f3, f4]`
- `当前步骤：f5 到达，固定窗口外帧不参与训练`
- `当前步骤：连续回合采样移除 f1，生成 [f2, f3, f4, f5]`

Buttons use native button semantics and visible focus states.

## Visual System

Use embedded CSS in the HTML file. Colors are restrained and tied to meaning:

- Blue: fixed-window selection and fixed sample.
- Green: continuous-episode label and continuous sample state.
- Orange: excluded frames and removed frames.
- Warm neutral surfaces: page, panels, frame cards, controls.

Frame cards use placeholder visual blocks for now. They should look like simplified video thumbnails, not plain text squares, so the audience still reads them as frames before real screenshots are available.

## Accessibility And Responsiveness

The prototype must be usable with mouse and keyboard:

- Buttons are real `button` elements.
- Focus states are visible.
- Status text uses `aria-live="polite"`.
- Animation should respect `prefers-reduced-motion` by shortening transitions.

Responsive behavior:

- Desktop: two full-width stacked panels with left labels and horizontal timelines.
- Tablet and mobile: left labels become top labels or remain narrow, while timeline tracks allow horizontal scrolling.
- Text must not overlap frame cards, buttons, or labels.

## Testing

Manual verification is enough for this prototype:

- Open `public/sampling-demo.html` in a browser or serve it through the existing Next dev server.
- Confirm play, pause, reset, and speed controls work.
- Confirm fixed sampling only creates one training sample.
- Confirm continuous sampling creates five samples and the final one is `[f2, f3, f4, f5]`.
- Confirm no text overlaps at desktop and mobile widths.

Optional repository verification after implementation:

- `npm run type-check`

The HTML prototype itself does not require TypeScript compilation.
