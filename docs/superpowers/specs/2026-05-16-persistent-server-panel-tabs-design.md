# Persistent Server Panel Tabs Design

## Summary

This design refines the `/evaluation/launch` frontend so the `Persistent Server` area shows one benchmark server panel at a time. Instead of rendering both `Simpler Server` and `RMBench Server` cards side by side, the page adds an external tab switcher above the server panel area.

The required behavior is:
- The tab switcher lives outside the server card, not inside it.
- The switcher offers exactly two tabs: `Simpler Server` and `RMBench Server`.
- The default active tab is `Simpler Server`.
- Switching tabs replaces the visible server panel content below.
- Existing server start/stop/status behavior remains unchanged.

## Goals

- Match the requested "subpage switch" interaction without introducing nested routes.
- Reduce visual density in the `Persistent Server` area by showing only one benchmark server card at a time.
- Reuse the existing `ModelServerCard` implementation and server state wiring.
- Keep the rest of `/evaluation/launch` unchanged.

## Non-Goals

- Adding new routes such as `/evaluation/launch/simpler` or `/evaluation/launch/rmbench`.
- Changing backend APIs, polling behavior, or model-server lifecycle logic.
- Changing task launch, logs, frame preview, or action-chart behavior.
- Redesigning the existing `ModelServerCard` content structure.

## Current State

`src/components/evaluation/simpler-launch-panel.tsx` currently renders two `ModelServerCard` instances side by side inside the top control section:
- one for `simpler`
- one for `rmbench`

Both cards are visible at the same time, each with its own status, port, and start/stop buttons.

## Proposed UI Structure

### 1. Add a page-level tab state

Inside `SimplerLaunchPanel`, introduce a frontend-only state:
- `activeServerTab: "simpler" | "rmbench"`

Default value:
- `"simpler"`

This state only controls which server card is displayed. It does not affect any backend state and does not change the currently running server processes.

### 2. Add an external tab switcher above the server panel

In the `Persistent Server` display area, render a compact two-tab switcher above the server card content. The switcher is outside the server card itself and belongs to the surrounding controls section.

Tab labels:
- `Simpler Server`
- `RMBench Server`

Behavior:
- Clicking a tab marks it active immediately.
- Only one tab can be active at a time.
- The active tab swaps the server card content rendered below.

### 3. Render one server card at a time

Replace the current two-card grid with conditional rendering:
- when `activeServerTab === "simpler"`, render the existing `ModelServerCard` with `simpler` props
- when `activeServerTab === "rmbench"`, render the existing `ModelServerCard` with `rmbench` props

No other behavior changes are needed inside `ModelServerCard`.

## Visual Design

- Keep the tab switcher outside the server card so the page reads like a subpage selector for the `Persistent Server` section.
- Use the existing page palette and rounded control styling so the tabs feel native to the current launch workspace.
- The active tab should be visually prominent through filled background or stronger border/text contrast.
- The inactive tab should remain clearly clickable but visually secondary.
- The switcher should work on both desktop and mobile widths without forcing horizontal overflow in normal viewport sizes.

## Interaction Rules

- Entering `/evaluation/launch` shows the `Simpler Server` tab by default.
- Switching tabs does not reset server status polling.
- Switching tabs does not clear server error state or task error state.
- Starting or stopping a server from the visible tab uses the same benchmark-specific handlers already in the component.
- Background polling continues to refresh both server statuses so the hidden tab stays up to date when the user switches back.

## Implementation Scope

Primary file:
- `src/components/evaluation/simpler-launch-panel.tsx`

Regression tests:
- `src/components/evaluation/__tests__/simpler-launch-panel.test.tsx`

No backend file changes are required for this refinement.

## Testing Strategy

Add or update frontend coverage for:
- default render shows the `Simpler Server` tab content
- `RMBench Server` content is shown after switching tabs
- the hidden benchmark card is not rendered before tab switch
- start/stop actions still call the correct benchmark-specific endpoints after switching tabs
- existing task-launch controls remain visible in the launch workspace

## Risks and Mitigations

- Risk: UI refactor accidentally disconnects button handlers from the benchmark-specific server endpoints.
  Mitigation: keep `ModelServerCard` unchanged and add an interaction test for the RMBench tab.

- Risk: hidden-tab server status becomes stale.
  Mitigation: keep the existing dual-status polling logic and only change presentation.

- Risk: the switcher looks like it belongs inside the server card rather than outside it.
  Mitigation: render the tab control at the controls-section level above the conditional server card.

## Implementation Outline

1. Add `activeServerTab` state to `SimplerLaunchPanel`.
2. Replace the two-card grid with an external two-tab switcher plus conditional `ModelServerCard` rendering.
3. Update the launch-panel tests to assert default tab behavior, tab switching, and correct RMBench handler wiring.
